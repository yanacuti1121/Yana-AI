#[derive(Debug, Clone)]
pub(crate) struct ToolSpec {
    pub(crate) name: &'static str,
    pub(crate) description: &'static str,
    pub(crate) parameters_schema: serde_json::Value,
}

#[derive(Debug, Clone)]
pub(crate) struct ToolCall {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) arguments_json: String,
}

#[derive(Debug, Clone)]
pub(crate) enum StreamOutcome {
    Text,
    ToolCalls(Vec<ToolCall>),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct ToolCallRecord {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) arguments_json: String,
}

impl From<ToolCall> for ToolCallRecord {
    fn from(call: ToolCall) -> Self {
        Self {
            id: call.id,
            name: call.name,
            arguments_json: call.arguments_json,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct ToolResultRecord {
    pub(crate) call_id: String,
    pub(crate) output: String,
    pub(crate) is_error: bool,
    pub(crate) denied: bool,
}
