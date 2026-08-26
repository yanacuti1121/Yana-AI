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

mod approval;
mod commands;
#[cfg(test)]
mod golden_e2e_tests;
mod keys;
mod model_command;
mod mouse;
mod overlay;
mod render;
mod sidebar;
mod tabs;
mod tool_dispatch;
mod turn;

use sidebar::{ProjectCounts, SidebarTab};

use super::banner::BannerInfo;
use super::history;
use super::input::TextInput;
use super::provider::{ChatMessage, ChatProvider, ChatUsage, ProviderHealth};
use super::settings::ChatSettings;
use super::terminal_guard::TerminalGuard;
use super::tool_types::ToolResultRecord;
use super::tools::round_guard::ToolRoundGuard;
use crate::runtime::{CancellationToken, RuntimeEvent, TurnError, TurnOutcome};
use anyhow::Result;
use crossterm::event::{self, Event};
use ratatui::layout::Rect;
use std::path::PathBuf;
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

const TICK: Duration = Duration::from_millis(50);
const IDLE_POLL: Duration = Duration::from_millis(250);
/// A handful of recent sessions, per the brief — not a full paginated list.
const RECENT_SESSIONS_LIMIT: usize = 5;

enum StreamEvent {
    Runtime(RuntimeEvent),
    Done(Result<TurnOutcome, TurnError>),
}

/// A `run_command` tool call waiting on a human y/N in the TUI before
/// (or instead of) executing. `guard_verdict.is_some()` means
/// `crate::guard::check_command()` already denied it — in that case the
/// approval UI offers acknowledge-only, no y-path at all (see
/// `approval.rs`).
struct PendingApproval {
    call: crate::model::tool::ToolCall,
    command: String,
    argv: Vec<String>,
    guard_verdict: Option<&'static str>,
}

enum ToolExecEvent {
    Done(Result<ToolResultRecord, TurnError>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OverlayKind {
    Commands,
    Models,
    History,
    Help,
    Settings,
    SystemPrompt,
}

struct Overlay {
    kind: OverlayKind,
    title: String,
    query: TextInput,
    items: Vec<String>,
    selected: usize,
    detail: Vec<String>,
    loading: bool,
}

enum TurnState {
    Idle,
    Streaming {
        rx: mpsc::Receiver<StreamEvent>,
        cancel: CancellationToken,
    },
    AwaitingApproval(PendingApproval),
    /// `call_id` rides alongside the receiver so the eventual
    /// `ToolExecEvent::Done` can be turned into a `ToolResultRecord`
    /// addressed back to the right call — the channel itself only ever
    /// carries the execution outcome, not which call it belongs to.
    ExecutingTool {
        call_id: String,
        rx: mpsc::Receiver<ToolExecEvent>,
    },
}

pub(super) struct ChatTab {
    history: Vec<ChatMessage>,
    streaming_reply: String,
    input: TextInput,
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
    provider_health: ProviderHealth,
    health_rx: Option<mpsc::Receiver<ProviderHealth>>,
    metadata: history::SessionMetadata,
    last_usage: ChatUsage,
    last_duration_ms: Option<u64>,
    output_started_at: Option<Instant>,
    output_chunks: u64,
    auto_scroll: bool,
    has_new_output: bool,
    tool_rounds: ToolRoundGuard,
    /// Single-level undo for `/clear` — the conversation as it stood right
    /// before the most recent clear, restorable once via `/undo`. Not a
    /// full undo stack (lazygit-style multi-step undo is a much bigger
    /// feature); this covers the one destructive, no-confirmation action
    /// the TUI has today.
    undo_buffer: Option<Vec<ChatMessage>>,
}

pub(super) struct App {
    tabs: Vec<ChatTab>,
    active_tab: usize,
    verbose: bool,
    should_quit: bool,
    banner_info: BannerInfo,
    recent_sessions: Vec<history::SessionSummary>,
    /// Only show the recent-sessions list when opened without `--resume`
    /// (per the brief) — not merely "history happens to be empty," so a
    /// `--resume`d session that somehow loaded zero turns doesn't
    /// re-surface a picker mid-conversation-intent.
    show_recent_sessions: bool,
    /// Anchor for `read_file`'s Gate L5 sandboxing — cwd at chat startup,
    /// matching `history.rs::history_dir()`'s own cwd-anchoring
    /// convention (`yana chat` has no `$CLAUDE_PROJECT_DIR` equivalent of
    /// its own).
    repo_root: PathBuf,
    /// Whether `run_command` routes through `core/scripts/sandbox-exec.sh`
    /// for real isolation. Default `true`; `--no-sandbox` is an explicit,
    /// human-invoked opt-out — never a silent runtime fallback if a
    /// sandbox mode turns out to be unavailable (see the plan).
    use_sandbox: bool,
    /// Which sidebar panel is visible — cycled with Tab (see
    /// `sidebar::SidebarTab::next`). The Provider box above it is always
    /// shown regardless of this value.
    sidebar_tab: SidebarTab,
    /// `MANIFEST.json` counts for the Project panel, read once at startup
    /// (see `App::new`). `None` means the read/parse failed.
    project_counts: Option<ProjectCounts>,
    /// Last `/memory [query]` filter and its matching L1 facts, shown in
    /// the Memory panel. Re-fetched only when `/memory` runs, not per
    /// frame — `sidebar::read_memory_facts` does real file I/O.
    memory_filter: String,
    memory_results: Vec<sidebar::MemoryFact>,
    settings: ChatSettings,
    overlay: Option<Overlay>,
    model_discovery: Option<mpsc::Receiver<Result<Vec<super::provider::ModelInfo>, String>>>,
    /// Ollama-only: live progress from an in-flight `/api/pull`, drained
    /// by `poll_model_pull` into `overlay.detail`. `None` when no pull is
    /// running (the common case for every other provider, always).
    model_pull: Option<mpsc::Receiver<overlay::PullUpdate>>,
    /// Ollama-only: result of an in-flight `/api/delete`. `Ok(name)`
    /// carries which model to drop from the visible list without a full
    /// re-fetch; `Err` carries a message for the status bar.
    model_delete: Option<mpsc::Receiver<Result<String, String>>>,
    /// Tab bar's on-screen area from the most recent draw — recorded so a
    /// mouse click can be hit-tested against tab boundaries without
    /// re-deriving the layout independently of `render::draw_tabs`'s own
    /// math. `Rect::default()` (all zero) before the first frame; a click
    /// that arrives before any draw simply hits nothing, which is correct.
    tabs_area: Rect,
}

impl std::ops::Deref for App {
    type Target = ChatTab;

    fn deref(&self) -> &Self::Target {
        &self.tabs[self.active_tab]
    }
}

impl std::ops::DerefMut for App {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.tabs[self.active_tab]
    }
}

impl App {
    fn start_health_probe(
        provider: Arc<dyn ChatProvider>,
        api_key: Option<String>,
        model: String,
    ) -> mpsc::Receiver<ProviderHealth> {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let health = match provider.list_models(api_key.as_deref()) {
                Ok(models) if models.iter().any(|candidate| candidate.id == model) => {
                    ProviderHealth::Ready
                }
                Ok(_) => ProviderHealth::Unavailable(format!(
                    "model '{model}' is not installed or not exposed by {} · use /models",
                    provider.name()
                )),
                Err(error) => ProviderHealth::Unavailable(error.to_string()),
            };
            let _ = tx.send(health);
        });
        rx
    }

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
        use_sandbox: bool,
    ) -> Self {
        let repo_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let (settings, settings_warning) = match super::settings::load(&repo_root) {
            Ok(settings) => (settings, None),
            Err(error) => (ChatSettings::default(), Some(error.to_string())),
        };
        let mut metadata = history::load_metadata(&session_id).unwrap_or_else(|_| {
            history::new_metadata(&session_id, provider.name(), &model, system.clone())
        });
        metadata.provider = provider.name().to_string();
        metadata.model = model.clone();
        metadata.system_prompt = system.clone();
        let health_rx =
            Self::start_health_probe(Arc::clone(&provider), api_key.clone(), model.clone());
        let tab = ChatTab {
            history,
            streaming_reply: String::new(),
            input: TextInput::default(),
            status: settings_warning
                .map(|warning| format!("settings ignored: {warning}"))
                .unwrap_or_else(|| "Enter to send · Ctrl+J newline · Ctrl+K commands".to_string()),
            scroll: u16::MAX,
            breaker: super::circuit_breaker::CircuitBreaker::new(),
            turn: TurnState::Idle,
            turn_started_at: None,
            session_id,
            provider,
            model,
            system,
            api_key,
            provider_health: ProviderHealth::Checking,
            health_rx: Some(health_rx),
            metadata,
            last_usage: ChatUsage::default(),
            last_duration_ms: None,
            output_started_at: None,
            output_chunks: 0,
            auto_scroll: true,
            has_new_output: false,
            tool_rounds: ToolRoundGuard::new(),
            undo_buffer: None,
        };
        let mut app = Self {
            tabs: vec![tab],
            active_tab: 0,
            verbose,
            should_quit: false,
            banner_info: BannerInfo::gather(),
            recent_sessions: if resumed {
                Vec::new()
            } else {
                history::list_recent_sessions(RECENT_SESSIONS_LIMIT)
            },
            show_recent_sessions: !resumed,
            repo_root: repo_root.clone(),
            use_sandbox,
            sidebar_tab: SidebarTab::default(),
            project_counts: sidebar::read_project_counts(&repo_root),
            memory_filter: String::new(),
            memory_results: Vec::new(),
            settings,
            overlay: None,
            model_discovery: None,
            model_pull: None,
            model_delete: None,
            tabs_area: Rect::default(),
        };
        if !resumed && app.settings.restore_session {
            if let Ok(workspace) = history::load_workspace() {
                let bootstrap_id = app.session_id.clone();
                for restored_id in &workspace.session_ids {
                    app.open_session_tab(restored_id);
                }
                if app.tabs.len() > 1 {
                    app.tabs.retain(|tab| tab.session_id != bootstrap_id);
                    app.active_tab = app
                        .tabs
                        .iter()
                        .position(|tab| tab.session_id == workspace.active_session_id)
                        .unwrap_or(0);
                }
            }
        }
        if !resumed {
            app.persist_workspace();
        }
        app
    }

    /// The canonical `SessionContext` for the active tab (AD-17) — derived
    /// from the existing split fields (`repo_root`/`use_sandbox` live here,
    /// `session_id`/`provider`/`model` on the active `ChatTab`, reached via
    /// `Deref`), not a replacement for them. Built fresh on demand, never
    /// cached — matches `chat::tools::catalog()`'s existing "compute this
    /// turn, don't stash it" convention, and means it can never go stale
    /// relative to the fields it's derived from.
    pub(super) fn session_context(&self) -> crate::session_context::SessionContext {
        crate::session_context::SessionContext::new(
            self.session_id.clone(),
            self.repo_root.clone(),
            self.provider.name().to_string(),
            self.model.clone(),
            self.use_sandbox,
        )
    }
}

pub fn run(terminal: &mut TerminalGuard, mut app: App) -> Result<()> {
    loop {
        terminal.draw(|frame| render::draw_ui(frame, &mut app))?;

        drain_stream_events(&mut app);
        approval::drain_tool_exec_events(&mut app);
        app.poll_model_discovery();
        app.poll_model_pull();
        app.poll_model_delete();
        app.poll_health_checks();

        let timeout = if matches!(
            app.turn,
            TurnState::Streaming { .. } | TurnState::ExecutingTool { .. }
        ) {
            TICK
        } else {
            IDLE_POLL
        };
        if event::poll(timeout)? {
            match event::read()? {
                Event::Key(key) => app.on_key(key),
                Event::Paste(text) => app.input.insert_str(&text),
                Event::Mouse(mouse) => app.on_mouse(mouse),
                Event::Resize(_, _) | Event::FocusGained | Event::FocusLost => {}
            }
        }

        if app.should_quit {
            app.shutdown();
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
            TurnState::Streaming { rx, .. } => match rx.try_recv() {
                Ok(ev) => ev,
                Err(_) => return, // empty or disconnected — nothing more to drain this tick
            },
            TurnState::Idle | TurnState::AwaitingApproval(_) | TurnState::ExecutingTool { .. } => {
                return
            }
        };
        match event {
            StreamEvent::Runtime(RuntimeEvent::TextDelta(s)) => {
                app.streaming_reply.push_str(&s);
                app.output_chunks += 1;
                if app.auto_scroll {
                    app.scroll = u16::MAX;
                } else {
                    app.has_new_output = true;
                }
            }
            StreamEvent::Runtime(_) => {}
            StreamEvent::Done(result) => {
                app.finish_turn(result);
                return;
            }
        }
    }
}
