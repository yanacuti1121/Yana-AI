use super::super::*;
use super::fixtures::*;
use crate::runtime::provider::{ChatMessage, ChatProvider, ChatUsage};
use crate::runtime::tool_types::{StreamOutcome, ToolCall, ToolSpec};
use anyhow::Result;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

#[test]
fn streams_typed_events_in_order() {
    let calls = Arc::new(AtomicUsize::new(0));
    let engine = engine(
        MockProvider::new([MockResponse::Text(vec!["Hello", " local", " AI"])]),
        ToolDecision::Allow,
        calls,
    );
    let mut events = Vec::new();
    let outcome = engine
        .run(request("s1"), &CancellationToken::default(), &mut |event| {
            events.push(event)
        })
        .expect("turn completes");

    assert!(matches!(events[0], RuntimeEvent::TurnStarted { .. }));
    assert!(matches!(events[1], RuntimeEvent::MessageStarted));
    assert!(matches!(&events[2], RuntimeEvent::TextDelta(chunk) if chunk == "Hello"));
    assert!(matches!(&events[4], RuntimeEvent::TextDelta(chunk) if chunk == " AI"));
    assert!(matches!(events[5], RuntimeEvent::Metrics(_)));
    assert!(matches!(events[6], RuntimeEvent::MessageCompleted(_)));
    assert!(matches!(
        events[7],
        RuntimeEvent::TurnCompleted { tool_rounds: 0 }
    ));
    assert!(matches!(
        outcome,
        TurnOutcome::Completed { ref message, .. } if message == "Hello local AI"
    ));
}

#[test]
fn denied_tool_never_reaches_executor() {
    let calls = Arc::new(AtomicUsize::new(0));
    let provider = MockProvider::new([
        MockResponse::Tool(ToolCall {
            id: "call-1".to_string(),
            name: "run_command".to_string(),
            arguments_json: "{}".to_string(),
        }),
        MockResponse::Text(vec!["denied safely"]),
    ]);
    let engine = engine(
        provider,
        ToolDecision::Deny {
            reason: "human approval required".to_string(),
        },
        Arc::clone(&calls),
    );
    let mut events = Vec::new();
    let outcome = engine
        .run(request("s1"), &CancellationToken::default(), &mut |event| {
            events.push(event)
        })
        .expect("denial is fed back to provider");

    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(events
        .iter()
        .any(|event| matches!(event, RuntimeEvent::ToolDenied { .. })));
    assert!(matches!(
        outcome,
        TurnOutcome::Completed { ref tool_results, .. }
            if tool_results.len() == 1 && tool_results[0].denied
    ));
}

#[test]
fn approved_tool_executes_once_and_emits_lifecycle() {
    let calls = Arc::new(AtomicUsize::new(0));
    let provider = MockProvider::new([
        MockResponse::Tool(ToolCall {
            id: "call-1".to_string(),
            name: "read_file".to_string(),
            arguments_json: "{}".to_string(),
        }),
        MockResponse::Text(vec!["done"]),
    ]);
    let engine = engine(provider, ToolDecision::Allow, Arc::clone(&calls));
    let mut events = Vec::new();
    let outcome = engine
        .run(request("s1"), &CancellationToken::default(), &mut |event| {
            events.push(event)
        })
        .expect("approved turn");

    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(events
        .iter()
        .any(|event| matches!(event, RuntimeEvent::ToolApproved { .. })));
    assert!(events
        .iter()
        .any(|event| matches!(event, RuntimeEvent::ToolStarted { .. })));
    assert!(events
        .iter()
        .any(|event| matches!(event, RuntimeEvent::ToolCompleted(_))));
    assert!(matches!(
        outcome,
        TurnOutcome::Completed { usage, .. }
            if usage.input_tokens == 5 && usage.output_tokens == 5
    ));
}

#[test]
fn cancellation_preserves_partial_output() {
    struct CancellingProvider;
    impl ChatProvider for CancellingProvider {
        fn name(&self) -> &str {
            "cancelling"
        }
        fn default_model(&self) -> &str {
            "m"
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
            on_chunk: &mut dyn FnMut(&str) -> Result<()>,
        ) -> Result<(ChatUsage, StreamOutcome)> {
            on_chunk("partial")?;
            on_chunk("ignored")?;
            Ok((ChatUsage::default(), StreamOutcome::Text))
        }
    }

    let token = CancellationToken::default();
    let token_for_event = token.clone();
    let engine = TurnEngine::new(
        Arc::new(CancellingProvider),
        Arc::new(FixedAuthorizer(ToolDecision::Allow)),
        Arc::new(RecordingExecutor {
            calls: Arc::new(AtomicUsize::new(0)),
        }),
    );
    let outcome = engine
        .run(request("s1"), &token, &mut |event| {
            if matches!(&event, RuntimeEvent::TextDelta(chunk) if chunk == "partial") {
                token_for_event.cancel();
            }
        })
        .expect("cancel is an outcome, not a provider failure");

    assert!(matches!(
        outcome,
        TurnOutcome::Cancelled { ref partial } if partial == "partial"
    ));
}

#[test]
fn provider_error_is_typed_and_emitted() {
    let engine = engine(
        MockProvider::new([MockResponse::Error("backend unavailable")]),
        ToolDecision::Allow,
        Arc::new(AtomicUsize::new(0)),
    );
    let mut events = Vec::new();
    let error = engine
        .run(request("s1"), &CancellationToken::default(), &mut |event| {
            events.push(event)
        })
        .expect_err("provider error");

    assert_eq!(
        error,
        TurnError::Provider("backend unavailable".to_string())
    );
    assert!(events.iter().any(
        |event| matches!(event, RuntimeEvent::Error { message } if message.contains("backend unavailable"))
    ));
}

#[test]
fn contexts_are_isolated_between_turns() {
    let engine = engine(
        MockProvider::new([
            MockResponse::Text(vec!["one"]),
            MockResponse::Text(vec!["two"]),
        ]),
        ToolDecision::Allow,
        Arc::new(AtomicUsize::new(0)),
    );
    let mut sessions = Vec::new();
    for session in ["one", "two"] {
        engine
            .run(
                request(session),
                &CancellationToken::default(),
                &mut |event| {
                    if let RuntimeEvent::TurnStarted { context, .. } = event {
                        sessions.push(context.session_id);
                    }
                },
            )
            .expect("isolated turn");
    }
    assert_eq!(sessions, ["one", "two"]);
}

#[test]
fn tool_round_limit_stops_runaway_provider() {
    let provider = MockProvider::new([
        MockResponse::Tool(ToolCall {
            id: "call-1".to_string(),
            name: "read_file".to_string(),
            arguments_json: "{}".to_string(),
        }),
        MockResponse::Tool(ToolCall {
            id: "call-2".to_string(),
            name: "read_file".to_string(),
            arguments_json: "{}".to_string(),
        }),
    ]);
    let engine = engine(provider, ToolDecision::Allow, Arc::new(AtomicUsize::new(0)))
        .with_max_tool_rounds(1);
    let error = engine
        .run(request("s1"), &CancellationToken::default(), &mut |_| {})
        .expect_err("runaway loop blocked");
    assert_eq!(error, TurnError::ToolRoundLimit { limit: 1 });
}
