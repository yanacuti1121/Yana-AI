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
mod request;

pub(crate) use authority::{
    AuthorityDecision, AuthorityLayer, RuntimeAuthority, YanaAuthorityChain,
};
pub(crate) use controller::{CancellationToken, ToolExecutor, TurnEngine, TurnError};
pub(crate) use events::RuntimeEvent;
pub(crate) use origin::{TurnContext, TurnOrigin};
pub(crate) use outcome::TurnOutcome;
pub(crate) use request::TurnRequest;

#[cfg(test)]
mod tests;
