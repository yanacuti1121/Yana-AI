use super::super::*;
use crate::runtime::provider::{
    ChatMessage, ChatProvider, ChatUsage, ProviderHealth, Role, RuntimeKind,
};
use crate::runtime::tool_types::{StreamOutcome, ToolCall, ToolResultRecord, ToolSpec};
use anyhow::Result;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

pub(super) struct MockProvider {
    responses: Mutex<VecDeque<MockResponse>>,
}

pub(super) enum MockResponse {
    Text(Vec<&'static str>),
    Tool(ToolCall),
    Error(&'static str),
}

impl MockProvider {
    pub(super) fn new(responses: impl IntoIterator<Item = MockResponse>) -> Self {
        Self {
            responses: Mutex::new(responses.into_iter().collect()),
        }
    }
}

impl ChatProvider for MockProvider {
    fn name(&self) -> &str {
        "mock"
    }

    fn default_model(&self) -> &str {
        "mock-1"
    }

    fn requires_key(&self) -> bool {
        false
    }

    fn env_var(&self) -> &str {
        ""
    }

    fn runtime_kind(&self) -> RuntimeKind {
        RuntimeKind::Local
    }

    fn health(&self, _api_key: Option<&str>) -> ProviderHealth {
        ProviderHealth::Ready
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
        let response = self
            .responses
            .lock()
            .expect("mock response lock")
            .pop_front()
            .expect("mock response");
        match response {
            MockResponse::Text(chunks) => {
                for chunk in chunks {
                    on_chunk(chunk)?;
                }
                Ok((
                    ChatUsage {
                        input_tokens: 3,
                        output_tokens: 4,
                    },
                    StreamOutcome::Text,
                ))
            }
            MockResponse::Tool(call) => Ok((
                ChatUsage {
                    input_tokens: 2,
                    output_tokens: 1,
                },
                StreamOutcome::ToolCalls(vec![call]),
            )),
            MockResponse::Error(message) => anyhow::bail!(message),
        }
    }
}

pub(super) struct FixedAuthorizer(pub(super) ToolDecision);

impl ToolAuthorizer for FixedAuthorizer {
    fn authorize(&self, _context: &TurnContext, _call: &ToolCall) -> ToolDecision {
        self.0.clone()
    }
}

pub(super) struct RecordingExecutor {
    pub(super) calls: Arc<AtomicUsize>,
}

impl ToolExecutor for RecordingExecutor {
    fn execute(&self, _context: &TurnContext, call: &ToolCall) -> ToolResultRecord {
        self.calls.fetch_add(1, Ordering::SeqCst);
        ToolResultRecord {
            call_id: call.id.clone(),
            output: "tool output".to_string(),
            is_error: false,
            denied: false,
        }
    }
}

pub(super) fn context(session: &str, origin: TurnOrigin) -> TurnContext {
    TurnContext::new(session, PathBuf::from("/workspace"), origin, true)
}

pub(super) fn request(session: &str) -> TurnRequest {
    TurnRequest::new(
        context(session, TurnOrigin::Terminal),
        "mock-1",
        vec![ChatMessage::text(Role::User, "hello")],
    )
    .with_system("be concise")
    .with_tools(Vec::new())
    .with_api_key("not-logged")
}

pub(super) fn engine(
    provider: MockProvider,
    decision: ToolDecision,
    calls: Arc<AtomicUsize>,
) -> TurnEngine {
    TurnEngine::new(
        Arc::new(provider),
        Arc::new(FixedAuthorizer(decision)),
        Arc::new(RecordingExecutor { calls }),
    )
}
