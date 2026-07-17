//! The chat TUI: `App` state, the render loop, and key handling.
//!
//! Streaming replies are rendered via buffer-then-redraw, not `print!`:
//! each turn's network call runs on a spawned worker thread (`stream_chat`
//! is fully synchronous, built on `ureq` — there is no async runtime
//! anywhere in this crate), forwarding chunks to the render loop over an
//! `mpsc` channel. This isn't incidental complexity: with a single
//! blocking thread, a mid-stream Ctrl-C would be unobservable until the
//! network call finished on its own, since nothing else could run
//! `crossterm::event::poll` concurrently.
//!
//! In raw mode, Ctrl-C does not generate `SIGINT` (raw mode disables the
//! `ISIG` termios flag) — it arrives as an ordinary `Event::Key`, same as
//! Ctrl-D, and both are handled here as plain "quit" key events.

use super::history;
use super::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use super::terminal_guard::TerminalGuard;
use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Paragraph, Wrap};
use ratatui::Frame;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const TICK: Duration = Duration::from_millis(50);
const IDLE_POLL: Duration = Duration::from_millis(250);
const SCROLL_PAGE: u16 = 10;

enum StreamEvent {
    Chunk(String),
    Done(Result<ChatUsage>),
}

enum TurnState {
    Idle,
    Streaming(mpsc::Receiver<StreamEvent>),
}

pub struct App {
    history: Vec<ChatMessage>,
    streaming_reply: String,
    input: String,
    status: String,
    scroll: u16,
    breaker: super::circuit_breaker::CircuitBreaker,
    turn: TurnState,
    turn_started_at: Option<Instant>,
    session_id: String,
    provider: Arc<dyn ChatProvider>,
    model: String,
    system: Option<String>,
    api_key: Option<String>,
    verbose: bool,
    should_quit: bool,
}

impl App {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        provider: Arc<dyn ChatProvider>,
        model: String,
        system: Option<String>,
        api_key: Option<String>,
        session_id: String,
        history: Vec<ChatMessage>,
    verbose: bool,
    ) -> Self {
        Self {
            history,
            streaming_reply: String::new(),
            input: String::new(),
            status: "Enter to send — Ctrl-C / Ctrl-D to quit".to_string(),
            scroll: u16::MAX, // clamped to content on first draw — starts pinned to bottom
            breaker: super::circuit_breaker::CircuitBreaker::new(),
            turn: TurnState::Idle,
            turn_started_at: None,
            session_id,
            provider,
            model,
            system,
            api_key,
            verbose,
            should_quit: false,
        }
    }

    fn on_key(&mut self, key: KeyEvent) {
        // Unix only sets `kind` when REPORT_EVENT_TYPES is explicitly
        // enabled (we don't enable it, so it's always Press there);
        // Windows always sets it accurately — guard so a Windows Release
        // event is never double-handled as a second keypress.
        if key.kind != KeyEventKind::Press {
            return;
        }
        match (key.code, key.modifiers) {
            (KeyCode::Char('c'), KeyModifiers::CONTROL)
            | (KeyCode::Char('d'), KeyModifiers::CONTROL) => {
                self.should_quit = true;
            }
            (KeyCode::Enter, _) => self.submit(),
            (KeyCode::Backspace, _) => {
                self.input.pop();
            }
            (KeyCode::PageUp, _) => self.scroll = self.scroll.saturating_sub(SCROLL_PAGE),
            (KeyCode::PageDown, _) => self.scroll = self.scroll.saturating_add(SCROLL_PAGE),
            (KeyCode::Char(c), _) => self.input.push(c),
            _ => {}
        }
    }

    fn submit(&mut self) {
        let text = self.input.trim().to_string();
        // Blocks double-submit while a turn is in flight — the old
        // single-threaded design got this for free by construction
        // (blocked on the network call); the threaded design needs it
        // explicit.
        if text.is_empty() || matches!(self.turn, TurnState::Streaming(_)) {
            return;
        }
        self.input.clear();

        if !self.breaker.can_attempt() {
            let secs = self.breaker.cooldown_remaining_secs().unwrap_or(0);
            self.status = format!(
                "{} is cooling down after repeated failures, ~{secs}s remaining",
                self.provider.name()
            );
            return;
        }

        if let Err(e) = history::append_user(&self.session_id, &text) {
            self.status = format!("warning: failed to persist user message: {e}");
        } else {
            self.status.clear();
        }
        self.history.push(ChatMessage { role: Role::User, content: text });
        self.spawn_turn();
    }

    fn spawn_turn(&mut self) {
        let provider = Arc::clone(&self.provider);
        let api_key = self.api_key.clone();
        let model = self.model.clone();
        let system = self.system.clone();
        let messages = self.history.clone();
        let (tx, rx) = mpsc::channel::<StreamEvent>();

        thread::spawn(move || {
            let mut on_chunk = |chunk: &str| -> Result<()> {
                tx.send(StreamEvent::Chunk(chunk.to_string())).ok();
                Ok(())
            };
            let result = provider.stream_chat(
                api_key.as_deref(),
                &model,
                system.as_deref(),
                &messages,
                &mut on_chunk,
            );
            tx.send(StreamEvent::Done(result)).ok();
        });

        self.turn = TurnState::Streaming(rx);
        self.turn_started_at = Some(Instant::now());
        self.streaming_reply.clear();
    }

    /// Near-verbatim port of the old single-threaded `run_turn`'s three
    /// match arms (Ok / Err-before-any-output / Err-mid-stream) — same
    /// conditions, same `history::append_assistant`/`track_cost`/
    /// `breaker.record_*` calls, writing to `self.status` instead of
    /// `println!`/`eprintln!`.
    fn finish_turn(&mut self, result: Result<ChatUsage>) {
        let duration_ms = self
            .turn_started_at
            .take()
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(0);
        let reply = std::mem::take(&mut self.streaming_reply);
        self.turn = TurnState::Idle;

        match result {
            Ok(usage) => {
                self.breaker.record_success();
                self.history.push(ChatMessage { role: Role::Assistant, content: reply.clone() });
                self.status = match history::append_assistant(
                    &self.session_id, self.provider.name(), &self.model, &reply,
                    usage.input_tokens, usage.output_tokens, duration_ms, false, None,
                ) {
                    Ok(()) => String::new(),
                    Err(e) => format!("warning: failed to persist assistant message: {e}"),
                };
                track_cost(self.provider.name(), &self.model, usage, duration_ms);
            }
            Err(e) if reply.is_empty() => {
                // Failed before any output — nothing conversational
                // happened, so no phantom empty assistant turn is pushed
                // into history. Never dump the raw upstream error to the
                // screen; full detail only under --verbose.
                self.breaker.record_failure();
                self.status = if self.verbose {
                    format!("error: {e:#}")
                } else {
                    "error — request failed. Rerun with --verbose for details.".to_string()
                };
                if let Err(e2) = history::append_assistant(
                    &self.session_id, self.provider.name(), &self.model, "",
                    0, 0, duration_ms, true, Some(&e.to_string()),
                ) {
                    self.status = format!("{} (also failed to persist error record: {e2})", self.status);
                }
            }
            Err(e) => {
                // Died mid-stream — keep the partial reply as context for
                // the next turn instead of silently losing it.
                self.breaker.record_failure();
                self.status = if self.verbose {
                    format!("stream interrupted: {e:#}")
                } else {
                    "stream interrupted. Rerun with --verbose for details.".to_string()
                };
                self.history.push(ChatMessage { role: Role::Assistant, content: reply.clone() });
                if let Err(e2) = history::append_assistant(
                    &self.session_id, self.provider.name(), &self.model, &reply,
                    0, 0, duration_ms, true, Some(&e.to_string()),
                ) {
                    self.status = format!("{} (also failed to persist partial reply: {e2})", self.status);
                }
            }
        }
    }
}

/// Feed real, provider-reported token counts into the same cost ledger
/// every other yana-rt subcommand already writes to — not the
/// char_count/4 heuristic used elsewhere in this repo.
fn track_cost(provider_name: &str, model: &str, usage: ChatUsage, duration_ms: u64) {
    if usage.input_tokens == 0 && usage.output_tokens == 0 {
        return; // provider didn't report usage — nothing honest to log
    }
    let payload = serde_json::json!({
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "task": "chat",
        "tier": "standard",
        "model": format!("{provider_name}/{model}"),
        "duration_ms": duration_ms,
    });
    crate::cost::track_from_payload("chat", &payload);
}

pub fn run(terminal: &mut TerminalGuard, mut app: App) -> Result<()> {
    loop {
        terminal.draw(|frame| draw_ui(frame, &mut app))?;

        drain_stream_events(&mut app);

        let timeout = if matches!(app.turn, TurnState::Streaming(_)) { TICK } else { IDLE_POLL };
        if event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                app.on_key(key);
            }
        }

        if app.should_quit {
            break;
        }
    }
    Ok(())
}

/// Drains every pending `StreamEvent` for the in-flight turn (if any)
/// before the next draw. Structured as its own function, taking `&mut
/// App` directly, specifically to avoid holding an immutable borrow of
/// `app.turn` (to read the `Receiver`) at the same time a `Done` event
/// needs `&mut self` (via `finish_turn`) — the borrow checker would
/// otherwise reject draining and finishing in the same `if let
/// TurnState::Streaming(rx) = &app.turn` block.
fn drain_stream_events(app: &mut App) {
    loop {
        let event = match &app.turn {
            TurnState::Streaming(rx) => match rx.try_recv() {
                Ok(ev) => ev,
                Err(_) => return, // empty or disconnected — nothing more to drain this tick
            },
            TurnState::Idle => return,
        };
        match event {
            StreamEvent::Chunk(s) => app.streaming_reply.push_str(&s),
            StreamEvent::Done(result) => {
                app.finish_turn(result);
                return;
            }
        }
    }
}

fn draw_ui(frame: &mut Frame, app: &mut App) {
    let [history_area, input_area] =
        Layout::vertical([Constraint::Min(3), Constraint::Length(3)]).areas(frame.area());

    let title = format!(
        " yana chat — {} / {} — session {} ",
        app.provider.name(),
        app.model,
        &app.session_id[..8.min(app.session_id.len())]
    );

    let mut lines: Vec<Line> = Vec::with_capacity(app.history.len() + 1);
    for msg in &app.history {
        let (label, style) = match msg.role {
            Role::User => ("You", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
            Role::Assistant => ("AI", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        };
        lines.push(Line::from(vec![Span::styled(format!("{label}: "), style), Span::raw(msg.content.clone())]));
        lines.push(Line::raw(""));
    }
    if matches!(app.turn, TurnState::Streaming(_)) || !app.streaming_reply.is_empty() {
        let style = Style::default().fg(Color::Green).add_modifier(Modifier::BOLD);
        lines.push(Line::from(vec![
            Span::styled("AI: ", style),
            Span::raw(app.streaming_reply.clone()),
        ]));
    }

    let total_lines = lines.len() as u16;
    let visible = history_area.height.saturating_sub(2); // minus top+bottom border
    let max_scroll = total_lines.saturating_sub(visible);
    // Pinned-to-bottom by default (App::new sets scroll = u16::MAX);
    // PageUp/PageDown move it, always re-clamped into range here so it
    // can never scroll past the actual content.
    app.scroll = app.scroll.min(max_scroll);

    let history_widget = Paragraph::new(Text::from(lines))
        .block(Block::bordered().title(title))
        .wrap(Wrap { trim: false })
        .scroll((app.scroll, 0));
    frame.render_widget(history_widget, history_area);

    let input_title = if app.status.is_empty() {
        " message ".to_string()
    } else {
        format!(" {} ", app.status)
    };
    let input_widget = Paragraph::new(app.input.as_str()).block(Block::bordered().title(input_title));
    frame.render_widget(input_widget, input_area);
    frame.set_cursor_position((
        input_area.x + 1 + app.input.len() as u16,
        input_area.y + 1,
    ));
}
