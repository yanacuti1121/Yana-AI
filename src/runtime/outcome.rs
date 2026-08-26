use crate::model::provider::{ChatMessage, ChatUsage};
use crate::model::tool::{ToolCall, ToolResultRecord};

#[derive(Debug)]
pub(crate) enum TurnOutcome {
    Completed {
        message: String,
        usage: ChatUsage,
        tool_results: Vec<ToolResultRecord>,
        continuation_messages: Vec<ChatMessage>,
        tool_rounds: usize,
    },
    AwaitingApproval {
        call: ToolCall,
        continuation_messages: Vec<ChatMessage>,
        usage: ChatUsage,
        tool_rounds: usize,
    },
    Cancelled {
        partial: String,
    },
}
