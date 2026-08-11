use super::*;
use crate::chat::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use crate::chat::tool_types::{StreamOutcome, ToolSpec};
use anyhow::Result;
use std::sync::Arc;
use uuid::Uuid;

struct FakeProvider;

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
        _messages: &[ChatMessage],
        _tools: &[ToolSpec],
        _on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        Ok((ChatUsage::default(), StreamOutcome::Text))
    }
}

fn app() -> App {
    let mut app = App::new(
        Arc::new(FakeProvider),
        "local-test".to_string(),
        None,
        None,
        Uuid::new_v4().to_string(),
        Vec::new(),
        false,
        true,
        true,
    );
    app.settings.autosave = false;
    app
}

#[test]
fn slash_autocomplete_is_prefix_based_and_deterministic() {
    let none = BTreeMap::new();
    assert_eq!(autocomplete("/mo", &none), vec!["/model", "/models"]);
    assert!(autocomplete("/unknown", &none).is_empty());
}

#[test]
fn autocomplete_includes_custom_commands_alongside_built_ins() {
    let mut custom = BTreeMap::new();
    custom.insert("review".to_string(), "Review this: {args}".to_string());
    assert_eq!(autocomplete("/rev", &custom), vec!["/review"]);
    // A custom name colliding with a built-in prefix still shows both,
    // deduplicated and sorted — not silently shadowed either way.
    custom.insert("rename".to_string(), "unused".to_string());
    assert_eq!(autocomplete("/ren", &custom), vec!["/rename"]);
}

#[test]
fn palette_keeps_multiword_command_arguments() {
    assert_eq!(
        palette_command("Duplicate tab  /tab duplicate"),
        "/tab duplicate"
    );
}

#[test]
fn custom_command_expands_into_input_without_auto_sending() {
    let mut app = app();
    app.settings
        .custom_commands
        .insert("review".to_string(), "Please review: {args}".to_string());
    let handled = app.try_dispatch_command("/review the auth module");
    assert!(handled);
    assert_eq!(app.input.as_str(), "Please review: the auth module");
    assert!(app.history.is_empty(), "must not auto-send the expansion");
}

#[test]
fn unknown_slash_command_still_falls_through_to_suggestion() {
    let mut app = app();
    app.try_dispatch_command("/rev");
    assert!(app.status.starts_with("did you mean") || app.status.contains("unknown"));
}

#[test]
fn undo_restores_the_conversation_cleared_by_clear() {
    let mut app = app();
    app.history.push(ChatMessage::text(Role::User, "keep me"));
    app.try_dispatch_command("/clear");
    assert!(app.history.is_empty());
    assert_eq!(app.status, "conversation cleared · /undo to restore");
    app.try_dispatch_command("/undo");
    assert_eq!(app.history.len(), 1);
    assert_eq!(app.status, "restored the cleared conversation");
}

#[test]
fn second_undo_has_nothing_left_to_restore() {
    let mut app = app();
    app.history.push(ChatMessage::text(Role::User, "one"));
    app.try_dispatch_command("/clear");
    app.try_dispatch_command("/undo");
    app.try_dispatch_command("/undo");
    assert_eq!(app.status, "nothing to undo");
}

#[test]
fn clearing_an_already_empty_conversation_is_a_no_op_status() {
    let mut app = app();
    app.try_dispatch_command("/clear");
    assert_eq!(app.status, "nothing to clear");
    assert!(app.undo_buffer.is_none());
}
