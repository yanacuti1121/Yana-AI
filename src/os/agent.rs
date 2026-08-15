//! Cooperative agent registry for Yana OS Phase 1.

use super::identity::Actor;
use super::state::{self, AgentStatus, ManagedAgent};
use anyhow::{bail, Result};
use serde::Serialize;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct AgentInventory {
    pub managed: Vec<ManagedAgent>,
    pub chat_sessions: Vec<ChatSessionView>,
    /// Normalized actor view over `managed` and `chat_sessions` (Phase 12,
    /// host-native-os program — see `os::identity`'s module doc). Purely
    /// additive and derived: `managed`/`chat_sessions` keep their exact
    /// existing shape, this is computed from them each call, not a new
    /// persisted store. A chat session missing a provider or model is
    /// omitted here rather than represented with a placeholder — an
    /// honest gap, not a fabricated actor.
    pub actors: Vec<Actor>,
}

#[derive(Debug, Serialize)]
pub struct ChatSessionView {
    pub session_id: String,
    pub title: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub turn_count: usize,
    pub last_activity: String,
}

pub fn inventory(root: &Path, include_chat_sessions: bool, limit: usize) -> Result<AgentInventory> {
    let managed = state::load(root)?.agents;
    let chat_sessions = if include_chat_sessions {
        crate::chat::history::list_recent_sessions_at(root, limit)
            .into_iter()
            .map(|session| ChatSessionView {
                session_id: session.session_id,
                title: session.title,
                provider: session.provider,
                model: session.model,
                turn_count: session.turn_count,
                last_activity: session.last_ts,
            })
            .collect()
    } else {
        Vec::new()
    };
    let actors = managed
        .iter()
        .map(Actor::from_managed_agent)
        .chain(chat_sessions.iter().filter_map(|session| {
            Some(Actor::from_chat_session(
                &session.session_id,
                session.provider.as_deref()?,
                session.model.as_deref()?,
            ))
        }))
        .collect();
    Ok(AgentInventory {
        managed,
        chat_sessions,
        actors,
    })
}

pub fn register(
    root: &Path,
    name: String,
    provider: String,
    model: Option<String>,
    session_id: Option<String>,
    owner: Option<String>,
) -> Result<ManagedAgent> {
    let name = validated("agent name", name)?;
    let provider = validated("provider", provider)?;
    if crate::model::catalog::try_select_provider(&provider).is_err() {
        bail!("unknown provider '{provider}'");
    }
    state::mutate(root, |state| {
        let now = state::now();
        let agent = ManagedAgent {
            id: Uuid::new_v4().to_string(),
            name,
            provider,
            model,
            session_id,
            owner,
            status: AgentStatus::Registered,
            created_at: now.clone(),
            updated_at: now,
            last_heartbeat: None,
        };
        state.agents.push(agent.clone());
        Ok(agent)
    })
}

pub fn heartbeat(root: &Path, id: &str) -> Result<ManagedAgent> {
    state::mutate(root, |state| {
        let agent = find_agent(state, id)?;
        if agent.status != AgentStatus::Running {
            bail!(
                "agent {id} is {}; transition it to running before heartbeat",
                agent.status.as_str()
            );
        }
        let now = state::now();
        agent.updated_at = now.clone();
        agent.last_heartbeat = Some(now);
        Ok(agent.clone())
    })
}

pub fn transition(root: &Path, id: &str, target: AgentStatus) -> Result<ManagedAgent> {
    state::mutate(root, |state| {
        let agent = find_agent(state, id)?;
        if !transition_allowed(agent.status, target) {
            bail!(
                "invalid agent transition {} -> {} for {id}",
                agent.status.as_str(),
                target.as_str()
            );
        }
        agent.status = target;
        agent.updated_at = state::now();
        if target == AgentStatus::Running {
            agent.last_heartbeat = Some(agent.updated_at.clone());
        }
        Ok(agent.clone())
    })
}

fn validated(label: &str, value: String) -> Result<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        bail!("{label} must not be empty");
    }
    Ok(value)
}

fn find_agent<'a>(state: &'a mut state::OsState, id: &str) -> Result<&'a mut ManagedAgent> {
    state
        .agents
        .iter_mut()
        .find(|agent| agent.id == id)
        .ok_or_else(|| anyhow::anyhow!("unknown managed agent id '{id}'"))
}

fn transition_allowed(from: AgentStatus, to: AgentStatus) -> bool {
    from == to
        || matches!(
            (from, to),
            (AgentStatus::Registered, AgentStatus::Running)
                | (AgentStatus::Registered, AgentStatus::Stopped)
                | (AgentStatus::Registered, AgentStatus::Failed)
                | (AgentStatus::Running, AgentStatus::Stopped)
                | (AgentStatus::Running, AgentStatus::Failed)
        )
}

pub fn print_inventory(inventory: &AgentInventory, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(inventory)?);
        return Ok(());
    }
    if inventory.managed.is_empty() {
        println!("No managed agents registered.");
    } else {
        println!("Managed agents  ({})", inventory.managed.len());
        println!("{}", "─".repeat(82));
        for agent in &inventory.managed {
            println!(
                "  {}  {:<16} {:<12} {:<10} {}",
                agent.id.chars().take(8).collect::<String>(),
                agent.name,
                agent.provider,
                agent.status.as_str(),
                agent.last_heartbeat.as_deref().unwrap_or("—")
            );
        }
    }
    if !inventory.chat_sessions.is_empty() {
        println!("\nChat sessions  ({})", inventory.chat_sessions.len());
        println!("{}", "─".repeat(82));
        for session in &inventory.chat_sessions {
            println!(
                "  {}  {:<22} {:<12} {:>3} turns  {}",
                session.session_id.chars().take(8).collect::<String>(),
                session.title.chars().take(22).collect::<String>(),
                session.provider.as_deref().unwrap_or("?"),
                session.turn_count,
                session.last_activity
            );
        }
    }
    Ok(())
}

pub fn print_agent(agent: &ManagedAgent, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(agent)?);
    } else {
        println!(
            "{}  {}  {}  {}",
            agent.id,
            agent.name,
            agent.provider,
            agent.status.as_str()
        );
    }
    Ok(())
}

/// Phase 0 compatibility view over chat history.
pub fn legacy_list(limit: usize) {
    let sessions = crate::chat::history::list_recent_sessions(limit);
    if sessions.is_empty() {
        println!("No agent sessions found in .yana-ai/chat-history/");
        return;
    }
    println!("Agent sessions  ({} shown, limit {limit})", sessions.len());
    println!("{}", "─".repeat(70));
    for session in &sessions {
        println!(
            "  {}  {:<12} {:<20} {:>3} turns  {}",
            session.session_id.chars().take(8).collect::<String>(),
            session.provider.as_deref().unwrap_or("?"),
            session.model.as_deref().unwrap_or("?"),
            session.turn_count,
            session.last_ts
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_is_forward_only() {
        assert!(transition_allowed(
            AgentStatus::Registered,
            AgentStatus::Running
        ));
        assert!(transition_allowed(
            AgentStatus::Running,
            AgentStatus::Stopped
        ));
        assert!(!transition_allowed(
            AgentStatus::Stopped,
            AgentStatus::Running
        ));
        assert!(!transition_allowed(
            AgentStatus::Failed,
            AgentStatus::Running
        ));
    }

    #[test]
    fn validation_rejects_blank_identity() {
        assert!(validated("agent name", "  ".into()).is_err());
    }

    #[test]
    fn registration_rejects_unknown_provider_before_state_access() {
        let error = register(
            Path::new("/definitely/missing"),
            "test".into(),
            "unknown-provider".into(),
            None,
            None,
            None,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("unknown provider"));
    }

    #[test]
    fn inventory_normalizes_a_registered_agent_into_an_agent_actor() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join(yana_rt::flock_v1::PROTOCOL_FILE);
        std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
        std::fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        state::initialize(root.path()).unwrap();
        let registered = register(
            root.path(),
            "reviewer".into(),
            "ollama".into(),
            Some("llama3".into()),
            Some("sess-1".into()),
            None,
        )
        .unwrap();
        let inventory = inventory(root.path(), false, 10).unwrap();
        let actor = inventory
            .actors
            .iter()
            .find(|actor| actor.id.0 == registered.id)
            .expect("registered agent must appear as a normalized actor");
        assert_eq!(actor.kind, super::super::identity::ActorKind::Agent);
        assert_eq!(actor.provider.as_deref(), Some("ollama"));
        assert_eq!(actor.session_id.as_deref(), Some("sess-1"));
    }
}
