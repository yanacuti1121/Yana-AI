use super::provider::ChatUsage;
use super::tool_types::ToolResultRecord;

#[derive(Debug, Clone)]
pub(crate) enum TurnOutcome {
    Completed {
        message: String,
        usage: ChatUsage,
        tool_results: Vec<ToolResultRecord>,
    },
    Cancelled {
        partial: String,
    },
}
