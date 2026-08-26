use super::{AuthorityLayer, TurnContext};
use crate::model::provider::ChatUsage;
use crate::model::tool::{ToolCall, ToolResultRecord};

#[derive(Debug, Clone)]
pub(crate) enum RuntimeEvent {
    TurnStarted {
        context: TurnContext,
        provider: String,
        model: String,
    },
    AuthorityDenied {
        authority: AuthorityLayer,
        reason: String,
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
    HumanApprovalRequired {
        call: ToolCall,
        authority: AuthorityLayer,
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
