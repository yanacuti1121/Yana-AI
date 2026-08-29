//! Canonical Yana turn runtime.
//!
//! Every client eventually submits turns here. Providers supply inference,
//! Yana's control plane authorizes capabilities, and Giám Thị remains the
//! fail-closed root authority above both.

mod authority;
mod controller;
mod events;
mod origin;
mod outcome;
mod pending_approval;
mod receipt;
mod request;

pub(crate) use authority::{
    AuthorityDecision, AuthorityLayer, RuntimeAuthority, YanaAuthorityChain,
};
pub(crate) use controller::{
    execute_approved_tool, push_tool_result, ApprovedTool, CancellationToken, ToolExecutor,
    TurnEngine, TurnError,
};
pub(crate) use events::RuntimeEvent;
pub(crate) use origin::{TurnContext, TurnOrigin};
pub(crate) use outcome::TurnOutcome;
pub(crate) use pending_approval::{
    cmd_pending_approvals, resume_turn, PendingApproval, PendingApprovalStore,
};
pub(crate) use receipt::cmd_authority_executions;
pub(crate) use receipt::cmd_authority_receipts;
pub(crate) use receipt::record as record_authority_decision;
pub(crate) use request::TurnRequest;

#[cfg(test)]
mod tests;
