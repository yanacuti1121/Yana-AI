//! Host-aware compute resource management (Phase 5 of the host-native-os
//! program). Four separate concepts, deliberately not mixed:
//!
//! - `policy`      — what limits are CONFIGURED (agents/tokens/dollars)
//! - `topology`     — what the host HAS (CPU/memory/accelerator shape)
//! - `pressure`     — what the host is doing RIGHT NOW (live utilization)
//! - `reservation`  — what capacity is PROMISED to which actor
//! - `placement`    — given all of the above, can a workload run here
//!
//! `policy` is the pre-Phase-5 `os::resource` module, moved here
//! unchanged and re-exported below so every existing `yana-rt os
//! resource ...` command keeps working without a call-site change.

pub mod placement;
pub mod policy;
pub mod pressure;
pub mod reservation;
pub mod topology;

pub use policy::{
    check, legacy_status, policy as get_policy, print_decision, print_policy, set_policy,
    ResourceDecision,
};
