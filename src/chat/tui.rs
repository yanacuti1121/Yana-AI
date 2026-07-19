//! The chat TUI: `App` state, the render loop, and key handling. Rendering
//! itself (`draw_ui` and its formatting helpers) lives in `tui/render.rs` —
//! split out to keep this file under the crate's 300-line guideline once
//! the header banner grew past a couple of lines (see `banner.rs`).
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

mod model_command;
mod render;
mod turn;

use super::banner::BannerInfo;
use super::history;
use super::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use super::terminal_guard::TerminalGuard;
use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant};

const TICK: Duration = Duration::from_millis(50);
const IDLE_POLL: Duration = Duration::from_millis(250);
const SCROLL_PAGE: u16 = 10;
/// A handful of recent sessions, per the brief — not a full paginated list.
const RECENT_SESSIONS_LIMIT: usize = 5;

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
    banner_info: BannerInfo,
    recent_sessions: Vec<history::SessionSummary>,
    /// Only show the recent-sessions list when opened without `--resume`
    /// (per the brief) — not merely "history happens to be empty," so a
    /// `--resume`d session that somehow loaded zero turns doesn't
    /// re-surface a picker mid-conversation-intent.
    show_recent_sessions: bool,
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
        resumed: bool,
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
            banner_info: BannerInfo::gather(),
            recent_sessions: if resumed { Vec::new() } else { history::list_recent_sessions(RECENT_SESSIONS_LIMIT) },
            show_recent_sessions: !resumed,
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

        if let Some(rest) = text.strip_prefix("/model") {
            self.handle_model_command(rest.trim());
            return;
        }

        // Any real message dismisses the recent-sessions list in favor of
        // the live conversation — it already served its purpose (picking
        // a session to `--resume`, or starting fresh here instead).
        self.show_recent_sessions = false;

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
}

pub fn run(terminal: &mut TerminalGuard, mut app: App) -> Result<()> {
    loop {
        terminal.draw(|frame| render::draw_ui(frame, &mut app))?;

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
