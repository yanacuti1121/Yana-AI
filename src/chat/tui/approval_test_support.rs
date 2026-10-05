//! Shared setup for the approval-flow tests (MCP prompts, command prompts, header notices).

use super::*;
use crate::chat::provider::{ChatProvider, ChatUsage};
use crate::chat::tool_types::{StreamOutcome, ToolCall, ToolSpec};
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use std::sync::Arc;
use uuid::Uuid;

pub(super) struct FakeProvider;

impl ChatProvider for FakeProvider {
    fn name(&self) -> &str {
        "fake"
    }
    fn default_model(&self) -> &str {
        "local-test"
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
        _messages: &[crate::chat::provider::ChatMessage],
        _tools: &[ToolSpec],
        _on_chunk: &mut dyn FnMut(&str) -> anyhow::Result<()>,
    ) -> anyhow::Result<(ChatUsage, StreamOutcome)> {
        Ok((ChatUsage::default(), StreamOutcome::Text))
    }
}

pub(super) fn app_in(root: &std::path::Path) -> App {
    let mut app = App::new(Arc::new(FakeProvider), "local-test".to_string(), None, None, Uuid::new_v4().to_string(), Vec::new(), false, true, true);
    app.settings.autosave = false;
    app.repo_root = root.to_path_buf();
    // Past the round ceiling, so error paths stop at the guard instead of starting a turn.
    app.tool_rounds.set_rounds(9);
    app
}

pub(super) fn trusted_repo(servers: serde_json::Value) -> (tempfile::TempDir, std::path::PathBuf) {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("ws");
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    write_servers(&root, servers);
    (outer, root)
}

pub(super) fn write_servers(root: &std::path::Path, servers: serde_json::Value) {
    std::fs::write(root.join(".yana-ai/mcp-servers.json"), serde_json::json!({"servers": servers}).to_string()).unwrap();
    crate::capability::config_trust::trust_in_test(root);
}

pub(super) fn last_tool_result(app: &App) -> crate::model::tool::ToolResultRecord {
    app.history.last().and_then(|m| m.tool_result.clone()).expect("a tool result was recorded")
}

/// The whole UI drawn into a real buffer, as text rows joined by newlines.
pub(super) fn screen_of(app: &mut App, width: u16, height: u16) -> String {
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;
    let mut terminal = Terminal::new(TestBackend::new(width, height)).unwrap();
    terminal.draw(|frame| crate::chat::tui::render::draw_ui(frame, app)).unwrap();
    let buffer = terminal.backend().buffer().clone();
    (0..height).map(|y| (0..width).map(|x| buffer[(x, y)].symbol().to_string()).collect::<String>()).collect::<Vec<_>>().join("\n")
}

pub(super) fn run_command(command: &str, id: &str) -> ToolCall {
    ToolCall { id: id.into(), name: "run_command".into(), arguments_json: serde_json::json!({"command": command}).to_string() }
}

pub(super) fn press(app: &mut App, c: char) {
    app.handle_approval_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
}
