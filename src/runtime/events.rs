use super::provider::ChatUsage;
use super::tool_types::{ToolCall, ToolResultRecord};
use super::TurnContext;

#[derive(Debug, Clone)]
pub(crate) enum RuntimeEvent {
    TurnStarted {
        context: TurnContext,
        provider: String,
        model: String,
    },
    MessageStarted,
    TextDelta(String),
    ToolRequested(ToolCall),
    ToolApproved {
        call_id: String,
    },
    ToolDenied {
        call_id: String,
        reason: String,
    },
    ToolStarted {
        call_id: String,
    },
    ToolCompleted(ToolResultRecord),
    Metrics(ChatUsage),
    MessageCompleted(String),
    TurnCompleted {
        tool_rounds: usize,
    },
    Cancelled {
        partial: String,
    },
    Error {
        message: String,
    },
}
