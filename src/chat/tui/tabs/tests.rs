use super::*;
use crate::chat::provider::{ChatMessage, ChatProvider, ModelInfo};
use crate::chat::tool_types::{StreamOutcome, ToolSpec};
use crate::runtime::CancellationToken;
use anyhow::Result;
use std::sync::Arc;

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
    fn list_models(&self, _api_key: Option<&str>) -> Result<Vec<ModelInfo>> {
        Ok(vec![
            ModelInfo::named("local-test"),
            ModelInfo::named("local-code"),
        ])
    }
    fn stream_chat(
        &self,
        _api_key: Option<&str>,
        _model: &str,
        _system: Option<&str>,
        _messages: &[ChatMessage],
        _tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        on_chunk("Hello")?;
        on_chunk(" from")?;
        on_chunk(" local AI")?;
        Ok((
            ChatUsage {
                input_tokens: 1,
                output_tokens: 4,
            },
            StreamOutcome::Text,
        ))
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
fn tabs_create_switch_close_and_isolate_state() {
    let mut app = app();
    app.input.insert_str("first draft");
    app.new_tab();
    assert_eq!(app.tabs.len(), 2);
    assert!(app.input.is_empty());
    app.input.insert_str("second draft");
    app.previous_tab();
    assert_eq!(app.input.as_str(), "first draft");
    app.next_tab();
    assert_eq!(app.input.as_str(), "second draft");
    app.close_active_tab();
    assert_eq!(app.tabs.len(), 1);
}

#[test]
fn invalid_tab_jump_keeps_current_tab() {
    let mut app = app();
    app.jump_to_tab(8);
    assert_eq!(app.active_tab, 0);
}

#[test]
fn mock_provider_streams_chunks_in_order() {
    let provider = FakeProvider;
    let mut output = String::new();
    let (usage, outcome) = provider
        .stream_chat(None, "local-test", None, &[], &[], &mut |chunk| {
            output.push_str(chunk);
            Ok(())
        })
        .unwrap();
    assert_eq!(output, "Hello from local AI");
    assert_eq!(usage.output_tokens, 4);
    assert!(matches!(outcome, StreamOutcome::Text));
}

#[test]
fn visible_tab_labels_matches_active_tab_index_and_stops_on_overflow() {
    let mut app = app();
    app.metadata.title = "first".to_string();
    app.new_tab();
    app.metadata.title = "second".to_string();
    let labels = visible_tab_labels(&app.tabs, 200);
    assert_eq!(labels.len(), 2);
    assert_eq!(labels[0].0, 0);
    assert!(labels[0].1.contains("first"));
    assert_eq!(labels[1].0, 1);
    assert!(labels[1].1.contains("second"));

    // A width too small for even one label yields nothing rendered —
    // matches draw_tabs's own overflow cutoff, no panic on tiny terminals.
    assert!(visible_tab_labels(&app.tabs, 2).is_empty());
}

#[test]
fn cancellation_sets_the_active_worker_token() {
    let mut app = app();
    let (_sender, receiver) = std::sync::mpsc::channel();
    let cancel = CancellationToken::default();
    app.turn = TurnState::Streaming {
        rx: receiver,
        cancel: cancel.clone(),
    };
    app.cancel_generation();
    assert!(cancel.is_cancelled());
    assert_eq!(app.status, "cancelling generation…");
}
