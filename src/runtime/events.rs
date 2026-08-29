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
    /// Authority Hardening item #5: emitted by
    /// `pending_approval::resume_turn` right after the paused call's
    /// decision has been acted on (executed or declined), before the
    /// fresh `TurnEngine::run()` for the continuation starts. Distinct
    /// from `ToolApproved`/`ToolDenied` — those fire for a live,
    /// in-process decision; this fires for a decision that arrived from
    /// a durable, out-of-process pause.
    TurnResumed {
        approval_id: String,
    },
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
