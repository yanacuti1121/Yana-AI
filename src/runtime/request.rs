use super::provider::ChatMessage;
use super::tool_types::ToolSpec;
use super::TurnContext;

pub(crate) struct TurnRequest {
    pub(crate) context: TurnContext,
    pub(crate) model: String,
    pub(crate) system: Option<String>,
    pub(crate) messages: Vec<ChatMessage>,
    pub(crate) tools: Vec<ToolSpec>,
    api_key: Option<String>,
}

impl TurnRequest {
    pub(crate) fn new(
        context: TurnContext,
        model: impl Into<String>,
        messages: Vec<ChatMessage>,
    ) -> Self {
        Self {
            context,
            model: model.into(),
            system: None,
            messages,
            tools: Vec::new(),
            api_key: None,
        }
    }

    pub(crate) fn with_system(mut self, system: impl Into<String>) -> Self {
        self.system = Some(system.into());
        self
    }

    pub(crate) fn with_tools(mut self, tools: Vec<ToolSpec>) -> Self {
        self.tools = tools;
        self
    }

    pub(crate) fn with_api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    pub(super) fn api_key(&self) -> Option<&str> {
        self.api_key.as_deref()
    }
}
