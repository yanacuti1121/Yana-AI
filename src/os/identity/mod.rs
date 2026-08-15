//! Actor identity normalization (Phase 12 of the host-native-os program).
//!
//! `os::identity` was foreshadowed in `platform::contract`'s own module
//! doc since Phase 1, alongside `os::supervisor` (HALT/quarantine
//! authority) and `os::autonomy` (capability/autonomy policy) as the
//! three modules that own Yana policy decisions.
//!
//! This module does NOT own a fourth identity store. Three
//! identity-bearing shapes already exist and already work: `os::state::
//! ManagedAgent` (the agent registry), `os::service::attribution::
//! ProcessAttribution` (governed-spawn ownership), and a chat session's
//! `session_id`/`provider`/`model` (`chat::history::SessionMetadata`).
//! Phase 12's job, per the program spec, is to "gradually integrate"
//! these — not replace them. `actor::Actor` is a normalized VIEW derived
//! from whichever of those three shapes a caller already has; converting
//! into it is a pure, lossless-where-possible function, never a migration
//! of the underlying stored data. No existing struct field, file format,
//! or schema version changes in this phase — see `actor.rs`'s per-
//! conversion doc comments for exactly what each source can and cannot
//! honestly supply (e.g. `ManagedAgent` has no mission field today, so
//! that conversion leaves `mission_id: None` rather than fabricating one).
//!
//! `lease` (Phase 12 primitive + Phase 13 scope taxonomy) defines a
//! generic, actor-scoped capability lease: `namespace[:path-glob]` scope
//! strings, `grant()`/`is_active()`/`LeaseScope::permits()`. The
//! non-escalation invariant (`grant()` rejects a `sovereign` scope
//! unconditionally) was enforced from the type's first commit in Phase
//! 12, before any real caller existed to need it.
//!
//! `lease_store` (Phase 13) is the persisted store `lease`'s own module
//! doc explicitly deferred in Phase 12 — built now that a real caller
//! (`os::autonomy::evaluate_for_actor`) and the scope taxonomy both
//! exist. It also closes the one gap `ActorLease`'s private-fields fix
//! could not: `#[derive(Deserialize)]` bypasses `grant()`'s validation,
//! so `lease_store::load_store` re-validates every lease against the same
//! rejection on every read, not only at the moment of granting.

pub(crate) mod actor;
pub(crate) mod lease;
pub(crate) mod lease_store;

pub use actor::{Actor, ActorId, ActorKind};
pub use lease::{grant as grant_lease, is_active as lease_is_active, ActorLease, LeaseScope};
pub use lease_store::{
    active_for_actor as active_leases_for_actor, issue as issue_lease, list as list_leases,
    revoke as revoke_lease,
};
