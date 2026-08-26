use super::TurnContext;
use crate::model::provider::ChatMessage;
use crate::model::tool::ToolSpec;

pub(crate) struct TurnRequest {
    pub context: TurnContext,
    pub model: String,
    pub system: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolSpec>,
    pub tool_rounds_completed: usize,
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
            tool_rounds_completed: 0,
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

    pub(crate) fn with_tool_rounds_completed(mut self, rounds: usize) -> Self {
        self.tool_rounds_completed = rounds;
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
