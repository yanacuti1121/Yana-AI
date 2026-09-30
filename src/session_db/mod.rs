//! Session and memory state, isolated per profile (WS4, see
//! docs/contracts/ws4-state.md).
//!
//! Step 0 of the contract: where state lives. A `StateRoot` is built from an
//! explicit base directory and a `ProfileName`, so nothing in here reads the
//! current directory or the environment, and tests never touch a real home.

// The module is built ahead of its callers (chat and memory are wired in
// later, separately approved steps), so items are unused in the binary for now.
#![allow(dead_code)]

pub mod checkpoint;
pub mod profile;
#[cfg(feature = "session-db")]
pub mod store;

#[allow(unused_imports)]
pub use checkpoint::{
    CheckpointError, CheckpointId, CheckpointInfo, CheckpointStore, PruneReport, PrunePolicy,
    RestoreReport, RestoreScope,
};
#[allow(unused_imports)]
pub use profile::{ProfileError, ProfileName, StateKind, StateRoot};
#[cfg(feature = "session-db")]
#[allow(unused_imports)]
pub use store::{
    EndReason, IntegrityReport, MessageRow, SearchHit, SessionDbError, SessionRow, SessionStore,
    SqliteSessionStore,
};
