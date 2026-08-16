use super::tool_types::{StreamOutcome, ToolCallRecord, ToolResultRecord, ToolSpec};
use anyhow::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RuntimeKind {
    Local,
    Remote,
}

impl RuntimeKind {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Local => "LOCAL",
            Self::Remote => "REMOTE",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ModelInfo {
    pub(crate) id: String,
    pub(crate) context_length: Option<u64>,
    pub(crate) size_bytes: Option<u64>,
    pub(crate) quantization: Option<String>,
}

impl ModelInfo {
    pub(crate) fn named(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            context_length: None,
            size_bytes: None,
            quantization: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ProviderHealth {
    Checking,
    Ready,
    Unavailable(String),
}

/// Deliberately has no `System` variant. System prompts are trusted request
/// metadata, never deserialized from persisted conversation history.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone)]
pub(crate) struct ChatMessage {
    pub(crate) role: Role,
    pub(crate) content: String,
    pub(crate) tool_call: Option<ToolCallRecord>,
    pub(crate) tool_result: Option<ToolResultRecord>,
}

impl ChatMessage {
    pub(crate) fn text(role: Role, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
            tool_call: None,
            tool_result: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ChatUsage {
    pub(crate) input_tokens: u64,
    pub(crate) output_tokens: u64,
}

impl ChatUsage {
    /// Merge split usage fragments from one provider response. Anthropic sends
    /// input and output usage in separate SSE events.
    pub(crate) fn merge(&mut self, other: ChatUsage) {
        if other.input_tokens > 0 {
            self.input_tokens = other.input_tokens;
        }
        if other.output_tokens > 0 {
            self.output_tokens = other.output_tokens;
        }
    }
}

/// Provider contract owned by the runtime rather than a particular client.
/// It remains blocking to preserve existing implementations; clients can run
/// it on a worker thread and consume typed [`super::RuntimeEvent`] values.
pub(crate) trait ChatProvider: Send + Sync {
    fn name(&self) -> &str;
    fn default_model(&self) -> &str;
    fn requires_key(&self) -> bool;
    fn env_var(&self) -> &str;
    fn runtime_kind(&self) -> RuntimeKind {
        RuntimeKind::Remote
    }
    fn supports_tool_calling(&self) -> bool {
        true
    }
    fn list_models(&self, _api_key: Option<&str>) -> Result<Vec<ModelInfo>> {
        Ok(vec![ModelInfo::named(self.default_model())])
    }
    fn health(&self, api_key: Option<&str>) -> ProviderHealth {
        match self.list_models(api_key) {
            Ok(_) => ProviderHealth::Ready,
            Err(error) => ProviderHealth::Unavailable(error.to_string()),
        }
    }
    fn stream_chat(
        &self,
        api_key: Option<&str>,
        model: &str,
        system: Option<&str>,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)>;
}
