//! Canonical, client-agnostic chat turn orchestration.
//!
//! Terminal, desktop, daemon, and adapter clients should eventually submit a
//! [`TurnRequest`] here instead of owning separate provider/tool loops. This
//! foundation is deliberately synchronous because the existing
//! [`crate::chat::provider::ChatProvider`] contract is synchronous; clients
//! remain free to run a turn on their own worker thread.

mod controller;
mod events;
mod origin;
mod outcome;
pub(crate) mod provider;
mod request;
pub(crate) mod tool_types;

pub(crate) use controller::{
    CancellationToken, ToolAuthorizer, ToolDecision, ToolExecutor, TurnEngine, TurnError,
};
pub(crate) use events::RuntimeEvent;
pub(crate) use origin::{TurnContext, TurnOrigin};
pub(crate) use outcome::TurnOutcome;
pub(crate) use request::TurnRequest;

#[cfg(test)]
mod tests;
