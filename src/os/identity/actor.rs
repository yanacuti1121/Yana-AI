//! Normalized actor identity — see `identity` module doc for why this is
//! a derived view over three existing identity-bearing shapes, not a new
//! store.

use crate::os::service::attribution::ProcessAttribution;
use crate::os::state::ManagedAgent;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ActorId(pub String);

impl std::fmt::Display for ActorId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<&str> for ActorId {
    fn from(value: &str) -> Self {
        ActorId(value.to_string())
    }
}

/// Who is acting, not how privileged they are. `ActorKind` is descriptive
/// metadata for audit/observability; it MUST NOT be read as an authority
/// tier anywhere — Sovereign/human-approval decisions stay exactly where
/// `platform::contract`'s module doc already puts them (`os::supervisor`,
/// `os::autonomy`), never derived from `ActorKind` alone. An `Agent` actor
/// is not automatically less trusted than a `Human` one just by virtue of
/// this enum; that judgment belongs to the modules named above.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActorKind {
    Human,
    Agent,
    Service,
}

impl ActorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Human => "human",
            Self::Agent => "agent",
            Self::Service => "service",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Actor {
    pub id: ActorId,
    pub kind: ActorKind,
    pub session_id: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    /// Mission ownership metadata (program spec's "mission" field). There
    /// is no separate `Actor::from_mission(...)` conversion — `mission::
    /// Mission` itself carries no owning-actor field today (confirmed by
    /// reading `src/mission/mod.rs`), so the only real source of a
    /// mission id an actor is currently bound to is `ProcessAttribution`
    /// (see `from_process_attribution`). This field exists so that source
    /// has somewhere honest to go, not to promise a Mission-side
    /// integration that doesn't exist yet.
    pub mission_id: Option<String>,
    pub parent: Option<ActorId>,
}

impl Actor {
    /// A human actor identified only by a caller-supplied label (e.g. an
    /// OS username, or "sovereign" for CLI invocations not yet threaded
    /// through a more specific identity source). No file backs this —
    /// there is no human registry to derive from yet.
    pub fn human(id: impl Into<String>) -> Self {
        Actor {
            id: ActorId(id.into()),
            kind: ActorKind::Human,
            session_id: None,
            provider: None,
            model: None,
            mission_id: None,
            parent: None,
        }
    }

    /// Derived from the agent registry (`os::agent` / `os::state::
    /// ManagedAgent`). Read-only view — does not touch
    /// `.yana-ai/os/state.json` itself; the caller already has the
    /// `ManagedAgent` (e.g. from `os::agent::inventory()`).
    pub fn from_managed_agent(agent: &ManagedAgent) -> Self {
        Actor {
            id: ActorId(agent.id.clone()),
            kind: ActorKind::Agent,
            session_id: agent.session_id.clone(),
            provider: Some(agent.provider.clone()),
            model: agent.model.clone(),
            // ManagedAgent has no mission field today — an honest None,
            // not a fabricated value. This program's own "never equate
            // UNKNOWN with FALSE" instruction extends to Option::None
            // here: absence of data, not a claim that no mission exists.
            mission_id: None,
            parent: agent.owner.clone().map(ActorId),
        }
    }

    /// Derived from a governed-spawn `ProcessAttribution`
    /// (`os::service::attribution`) — flagged at the end of Phase 11 as
    /// "already exactly the shape Phase 12's Actor concept needs for the
    /// Agent/Service cases." A spawned, governed process is modeled as a
    /// Service actor: it is code the system launched and supervises, not
    /// an interactive agent session.
    pub fn from_process_attribution(attribution: &ProcessAttribution) -> Self {
        Actor {
            id: ActorId(attribution.agent_id.clone()),
            kind: ActorKind::Service,
            session_id: attribution.session_id.clone(),
            provider: None,
            model: None,
            mission_id: attribution.mission_id.clone(),
            parent: None,
        }
    }

    /// Derived from a chat session (`chat::history::SessionMetadata`'s
    /// `session_id`/`provider`/`model`) — the "chat session actor" case
    /// the program spec names explicitly. Modeled as Human: today every
    /// chat session in this codebase is a human operating the CLI
    /// interactively through it. That is a judgment call recorded here,
    /// not a structural guarantee — a future autonomous chat-driven agent
    /// session would need its own conversion, not reuse of this one.
    /// Takes the three fields by value rather than `&SessionMetadata` so
    /// `os::identity` does not need a dependency on `chat::history` for a
    /// single call — the caller (already holding a `SessionMetadata`)
    /// supplies the three fields it normalizes.
    pub fn from_chat_session(session_id: &str, provider: &str, model: &str) -> Self {
        Actor {
            id: ActorId(session_id.to_string()),
            kind: ActorKind::Human,
            session_id: Some(session_id.to_string()),
            provider: Some(provider.to_string()),
            model: Some(model.to_string()),
            mission_id: None,
            parent: None,
        }
    }

    /// Formats this actor into the plain-string shape every existing
    /// audit/receipt call site already expects (e.g. `os::supervisor::
    /// append_receipt`'s `actor: &str` parameter). Lets a caller that has
    /// adopted `Actor` pass it through today's string-based audit sites
    /// without those call sites needing to change — the "gradually
    /// integrate ... audit actor" case from the program spec, satisfied
    /// without touching `append_receipt`'s signature or any of its
    /// existing callers this phase.
    pub fn as_receipt_actor(&self) -> String {
        match &self.session_id {
            Some(session_id) => format!("{}:{}:{session_id}", self.kind.as_str(), self.id),
            None => format!("{}:{}", self.kind.as_str(), self.id),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::state::AgentStatus;

    fn managed_agent() -> ManagedAgent {
        ManagedAgent {
            id: "agent-abc".into(),
            name: "reviewer".into(),
            provider: "anthropic".into(),
            model: Some("claude-sonnet-5".into()),
            session_id: Some("sess-1".into()),
            owner: Some("human:tam".into()),
            status: AgentStatus::Running,
            created_at: "2026-08-15T00:00:00Z".into(),
            updated_at: "2026-08-15T00:00:00Z".into(),
            last_heartbeat: None,
        }
    }

    fn process_attribution() -> ProcessAttribution {
        ProcessAttribution {
            agent_id: "watchdog".into(),
            session_id: Some("sess-2".into()),
            mission_id: Some("mission-9".into()),
        }
    }

    #[test]
    fn from_managed_agent_normalizes_as_an_agent_actor_with_an_honest_none_mission() {
        let actor = Actor::from_managed_agent(&managed_agent());
        assert_eq!(actor.kind, ActorKind::Agent);
        assert_eq!(actor.id, ActorId("agent-abc".into()));
        assert_eq!(actor.session_id.as_deref(), Some("sess-1"));
        assert_eq!(actor.provider.as_deref(), Some("anthropic"));
        assert_eq!(actor.model.as_deref(), Some("claude-sonnet-5"));
        assert_eq!(actor.mission_id, None);
        assert_eq!(actor.parent, Some(ActorId("human:tam".into())));
    }

    #[test]
    fn from_process_attribution_normalizes_as_a_service_actor_carrying_mission_id() {
        let actor = Actor::from_process_attribution(&process_attribution());
        assert_eq!(actor.kind, ActorKind::Service);
        assert_eq!(actor.id, ActorId("watchdog".into()));
        assert_eq!(actor.session_id.as_deref(), Some("sess-2"));
        assert_eq!(actor.mission_id.as_deref(), Some("mission-9"));
        assert_eq!(actor.provider, None);
    }

    #[test]
    fn from_chat_session_normalizes_as_a_human_actor() {
        let actor = Actor::from_chat_session("sess-3", "openai", "gpt-5");
        assert_eq!(actor.kind, ActorKind::Human);
        assert_eq!(actor.id, ActorId("sess-3".into()));
        assert_eq!(actor.provider.as_deref(), Some("openai"));
        assert_eq!(actor.model.as_deref(), Some("gpt-5"));
    }

    #[test]
    fn as_receipt_actor_includes_session_when_present_and_omits_it_otherwise() {
        let with_session = Actor::from_managed_agent(&managed_agent());
        assert_eq!(with_session.as_receipt_actor(), "agent:agent-abc:sess-1");

        let without_session = Actor::human("tam");
        assert_eq!(without_session.as_receipt_actor(), "human:tam");
    }
}
