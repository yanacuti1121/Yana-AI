//! Program K (Yana OS) — first implementation slice.
//!
//! Explicit note on process: `docs/programs/README.md`'s own rule is that
//! nothing in `docs/programs/` may be implemented before ADS v1 Phase 1-9
//! (Specification → Capability Inventory → Architecture → Workflow →
//! Readiness → ADR → Research → Design Review → Implementation Plan). None
//! of those phases have run for Program K. Anh Tâm explicitly overrode that
//! gate on 2026-08-09 ("Có, anh muốn huỷ scope lock, code ngay") after this
//! session flagged the contradiction with his own Phase 0 Scope note. See
//! `docs/programs/PROGRAM-K-YANA-OS-SKELETON.md`'s Implementation section
//! for the full record.
//!
//! Given that, this slice deliberately stays small and read-only: it does
//! not invent architecture for the three confirmed management areas (agent/
//! credential/resource), it surfaces state that already exists elsewhere in
//! the crate under one `yana-rt os` namespace, matching Yana OS's stated
//! relationship to `yana-rt` ("builds on top of it, doesn't replace it").
//! No sandboxing, scheduling, policy enforcement, or mutation — that's real
//! Yana OS scope for a later, properly-specified phase.

mod agent;
mod credential;
mod resource;

use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub enum OsAction {
    /// Agent management — list known agent chat sessions (id, provider,
    /// model, turn count, last activity) from `.yana-ai/chat-history/`.
    AgentList {
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    /// Credential management — which providers have an API key configured
    /// via environment variable. Never prints the key value itself.
    CredentialStatus,
    /// Resource management — token/cost usage summary. Thin wrapper over
    /// the existing `yana-rt cost show` ledger.
    ResourceStatus,
}

pub fn dispatch(action: OsAction) {
    match action {
        OsAction::AgentList { limit } => agent::list(limit),
        OsAction::CredentialStatus => credential::status(),
        OsAction::ResourceStatus => resource::status(),
    }
}
