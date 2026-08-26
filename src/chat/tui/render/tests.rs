//! Snapshot tests for `render::draw_ui`, split out of `render.rs` for
//! line-count budget (same convention as `render/render_tools.rs`).
//! Uses `ratatui::backend::TestBackend` to render into an in-memory cell
//! buffer and assert on its content/colors — real evidence that the
//! layout, sidebar tab-switching, and animated border actually produce
//! the expected output, without needing a real pty (which this repo's
//! own sandboxed dev environment can't allocate; see this branch's PR
//! description for why that distinction matters here specifically).

use super::{draw_ui, SEND_BORDER_COLORS};
use crate::chat::provider::{ChatMessage, ChatProvider, ChatUsage};
use crate::chat::tool_types::{StreamOutcome, ToolSpec};
use crate::chat::tui::{App, StreamEvent, TurnState};
use crate::runtime::CancellationToken;
use anyhow::Result;
use ratatui::backend::TestBackend;
use ratatui::Terminal;
use std::sync::Arc;

struct TestProvider;

impl ChatProvider for TestProvider {
    fn name(&self) -> &str {
        "ollama"
    }
    fn default_model(&self) -> &str {
        "llama3.2"
    }
    fn requires_key(&self) -> bool {
        false
    }
    fn env_var(&self) -> &str {
        ""
    }
    fn stream_chat(
        &self,
        _api_key: Option<&str>,
        _model: &str,
        _system: Option<&str>,
        _messages: &[ChatMessage],
        _tools: &[ToolSpec],
        _on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        Ok((ChatUsage::default(), StreamOutcome::Text))
    }
}

fn app() -> App {
    App::new(
        Arc::new(TestProvider),
        "llama3.2".to_string(),
        None,
        None,
        "12345678-0000-0000-0000-000000000000".to_string(),
        vec![ChatMessage::text(
            crate::chat::provider::Role::User,
            "Hello Yana",
        )],
        false,
        true,
        true,
    )
}

fn empty_app() -> App {
    App::new(
        Arc::new(TestProvider),
        "llama3.2".to_string(),
        None,
        None,
        "12345678-0000-0000-0000-000000000000".to_string(),
        Vec::new(),
        false,
        true,
        true,
    )
}

fn snapshot(width: u16) -> String {
    let backend = TestBackend::new(width, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();
    terminal.draw(|frame| draw_ui(frame, &mut app)).unwrap();
    terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|cell| cell.symbol())
        .collect()
}

#[test]
fn wide_terminal_shows_sidebar() {
    let output = snapshot(120);
    assert!(output.contains("Conversation"));
    assert!(output.contains("Session"));
    assert!(!output.contains("████"));
}

#[test]
fn narrow_terminal_hides_sidebar_without_hiding_conversation() {
    let output = snapshot(90);
    assert!(output.contains("Conversation"));
    assert!(!output.contains("Session"));
    assert!(!output.contains("████"));
}

#[test]
fn tab_cycles_through_sidebar_panels() {
    let backend = TestBackend::new(120, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();

    terminal.draw(|frame| draw_ui(frame, &mut app)).unwrap();
    let first: String = terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|c| c.symbol())
        .collect();
    assert!(first.contains("Activity"));

    app.sidebar_tab = app.sidebar_tab.next(); // Activity -> Approval
    terminal.draw(|frame| draw_ui(frame, &mut app)).unwrap();
    let second: String = terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|c| c.symbol())
        .collect();
    assert!(second.contains("Approval"));
}

#[test]
fn processing_turn_draws_the_seven_colour_input_ring() {
    let backend = TestBackend::new(120, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();
    let (_sender, receiver) = std::sync::mpsc::channel::<StreamEvent>();
    app.turn = TurnState::Streaming {
        rx: receiver,
        cancel: CancellationToken::default(),
    };

    terminal.draw(|frame| draw_ui(frame, &mut app)).unwrap();

    let painted_colours: Vec<_> = terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|cell| cell.fg)
        .collect();
    assert!(SEND_BORDER_COLORS
        .iter()
        .all(|colour| painted_colours.contains(colour)));
}

#[test]
fn empty_session_shows_the_yana_local_welcome() {
    let backend = TestBackend::new(90, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = empty_app();
    terminal.draw(|frame| draw_ui(frame, &mut app)).unwrap();

    let output: String = terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|cell| cell.symbol())
        .collect();
    assert!(output.contains("YANA // LOCAL"));
    assert!(output.contains("grounded copilot"));
    assert!(output.contains("asks before running"));
}

#[test]
fn very_small_terminal_renders_without_panicking() {
    let backend = TestBackend::new(38, 10);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = empty_app();
    terminal.draw(|frame| draw_ui(frame, &mut app)).unwrap();
    assert_eq!(terminal.backend().buffer().area.width, 38);
}

#[test]
fn terminal_theme_changes_the_active_input_border() {
    let backend = TestBackend::new(90, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = empty_app();
    app.settings.theme = crate::chat::settings::ThemeName::Terminal;
    terminal.draw(|frame| draw_ui(frame, &mut app)).unwrap();
    assert!(terminal
        .backend()
        .buffer()
        .content
        .iter()
        .any(|cell| cell.fg == ratatui::style::Color::Green));
}
