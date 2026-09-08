//! Compatibility re-export (Phase 2, Provider Gateway unification). The
//! real content moved to `crate::model::circuit_breaker` — same rationale
//! `crate::model::provider`'s own doc comment documents for its own
//! promotion out of `chat::`: model plane owns provider state, chat
//! consumes it. Every pre-existing internal caller (`chat/tui.rs`,
//! `chat/tui/tabs.rs`, `chat/tui/model_command.rs`) keeps resolving
//! through this re-export unchanged; new code should reach these types via
//! `crate::model::circuit_breaker` directly.

pub(crate) use crate::model::circuit_breaker::*;
