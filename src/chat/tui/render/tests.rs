//! Snapshot tests for `render::draw_ui`, split out of `render.rs` for
//! line-count budget (same convention as `render/render_tools.rs`).
//! Uses `ratatui::backend::TestBackend` to render into an in-memory cell
//! buffer and assert on its content/colors — real evidence that the
//! layout, sidebar tab-switching, and animated border actually produce
//! the expected output, without needing a real pty (which this repo's
//! own sandboxed dev environment can't allocate; see this branch's PR
//! description for why that distinction matters here specifically).

use super::{
    draw_ui_with_palette, ColorMode, Palette, LOTUS_BLUE, MATCHA_GREEN, OBSIDIAN, SAKURA_PINK,
};
use crate::chat::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use crate::chat::tool_types::{StreamOutcome, ToolSpec};
use crate::chat::tui::{App, StreamEvent, TurnState};
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

fn snapshot(width: u16) -> String {
    let backend = TestBackend::new(width, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();
    let palette = Palette::for_mode(ColorMode::TrueColor);
    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();
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
    let palette = Palette::for_mode(ColorMode::TrueColor);

    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();
    let first: String = terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|c| c.symbol())
        .collect();
    assert!(first.contains("Activity"));

    app.sidebar_tab = app.sidebar_tab.next(); // Activity -> Approval
    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();
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
fn streaming_turn_draws_the_seven_colour_input_ring() {
    let backend = TestBackend::new(120, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();
    let (_sender, receiver) = std::sync::mpsc::channel::<StreamEvent>();
    app.turn = TurnState::Streaming(receiver);
    let palette = Palette::for_mode(ColorMode::TrueColor);

    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();

    let painted_colours: Vec<_> = terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|cell| cell.fg)
        .collect();
    assert!(palette
        .processing_ring
        .iter()
        .all(|colour| painted_colours.contains(colour)));
}

#[test]
fn true_colour_palette_uses_lotus_sakura_matcha_and_obsidian_tokens() {
    let palette = Palette::for_mode(ColorMode::TrueColor);

    assert_eq!(palette.system_blue, LOTUS_BLUE);
    assert_eq!(palette.user_pink, SAKURA_PINK);
    assert_eq!(palette.runtime_green, MATCHA_GREEN);
    assert_eq!(palette.obsidian, OBSIDIAN);
}

#[test]
fn semantic_badges_use_system_user_and_runtime_colours() {
    let backend = TestBackend::new(120, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();
    app.history
        .push(ChatMessage::text(Role::Assistant, "Ready"));
    let palette = Palette::for_mode(ColorMode::TrueColor);

    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();

    let backgrounds: Vec<_> = terminal
        .backend()
        .buffer()
        .content
        .iter()
        .map(|cell| cell.bg)
        .collect();
    assert!(backgrounds.contains(&palette.system_blue));
    assert!(backgrounds.contains(&palette.user_pink));
    assert!(backgrounds.contains(&palette.runtime_green));
}

#[test]
fn composer_badge_tracks_system_user_and_runtime_states() {
    let backend = TestBackend::new(120, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();
    let palette = Palette::for_mode(ColorMode::TrueColor);

    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();
    assert!(composer_text(&terminal).contains("SYSTEM"));

    app.status.clear();
    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();
    assert!(composer_text(&terminal).contains("YOU"));

    let (_sender, receiver) = std::sync::mpsc::channel::<StreamEvent>();
    app.turn = TurnState::Streaming(receiver);
    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();
    let text = composer_text(&terminal);
    assert!(text.contains("YANA-RT"));
    assert!(text.contains("THINKING"));
}

#[test]
fn low_colour_palettes_avoid_rgb_sequences() {
    for mode in [ColorMode::Ansi256, ColorMode::Ansi] {
        let palette = Palette::for_mode(mode);
        let colors = [
            palette.system_blue,
            palette.user_pink,
            palette.runtime_green,
            palette.obsidian,
            palette.text,
            palette.muted,
            palette.warning,
            palette.danger,
            palette.violet,
        ];
        assert!(colors
            .iter()
            .chain(palette.processing_ring.iter())
            .all(|color| !matches!(color, ratatui::style::Color::Rgb(..))));
    }

    let ansi = Palette::for_mode(ColorMode::Ansi);
    assert!(ansi
        .badge_style(ansi.system_blue)
        .add_modifier
        .contains(ratatui::style::Modifier::REVERSED));
}

#[test]
fn no_color_palette_disables_spectrum_but_keeps_state_labels() {
    let palette = Palette::for_mode(ColorMode::NoColor);
    assert!(!palette.colors_enabled());
    assert!(palette
        .processing_ring
        .iter()
        .all(|color| *color == ratatui::style::Color::Reset));

    let backend = TestBackend::new(120, 28);
    let mut terminal = Terminal::new(backend).unwrap();
    let mut app = app();
    let (_sender, receiver) = std::sync::mpsc::channel::<StreamEvent>();
    app.turn = TurnState::Streaming(receiver);
    terminal
        .draw(|frame| draw_ui_with_palette(frame, &mut app, palette))
        .unwrap();

    let text = composer_text(&terminal);
    assert!(text.contains("YANA-RT"));
    assert!(text.contains("THINKING"));
    assert!(terminal
        .backend()
        .buffer()
        .content
        .iter()
        .all(|cell| cell.fg == ratatui::style::Color::Reset
            && cell.bg == ratatui::style::Color::Reset));
}

fn composer_text(terminal: &Terminal<TestBackend>) -> String {
    let content = &terminal.backend().buffer().content;
    content[content.len() - 120 * 3..]
        .iter()
        .map(|cell| cell.symbol())
        .collect()
}
