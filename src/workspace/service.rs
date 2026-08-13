use super::domain::{
    ActionStatus, AttentionClass, Block, BlockKind, GovernedAction, Link, RiskLevel,
    WorkspaceEvent, WorkspaceEventKind, WorkspaceState,
};
use super::store::EventStore;
use chrono::Utc;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicI64, Ordering};
use uuid::Uuid;

static LAST_EVENT_NANOS: AtomicI64 = AtomicI64::new(0);

pub trait ActionGovernor {
    fn initial_status(&self, risk: RiskLevel) -> ActionStatus;
    fn validate_human_approver(&self, approver: &str) -> Result<(), String>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct AutonomyLadderGovernor;

impl ActionGovernor for AutonomyLadderGovernor {
    fn initial_status(&self, risk: RiskLevel) -> ActionStatus {
        if risk == RiskLevel::Critical {
            ActionStatus::PendingHuman
        } else {
            ActionStatus::AutoApproved
        }
    }

    fn validate_human_approver(&self, approver: &str) -> Result<(), String> {
        if approver
            .strip_prefix("human:")
            .is_some_and(|name| !name.trim().is_empty())
        {
            Ok(())
        } else {
            Err("critical action approver must use the explicit human:<name> identity".into())
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "operation", content = "input", rename_all = "snake_case")]
pub enum WorkspaceOperation {
    CreateBlock {
        kind: BlockKind,
        title: String,
        body: String,
        attention: AttentionClass,
        actor: String,
    },
    UpdateBlock {
        block_id: String,
        title: Option<String>,
        body: Option<String>,
        attention: Option<AttentionClass>,
        actor: String,
    },
    LinkBlocks {
        source: String,
        target: String,
        relation: String,
        actor: String,
    },
    RequestAction {
        block_id: String,
        description: String,
        risk: RiskLevel,
        actor: String,
    },
    ApproveAction {
        action_id: String,
        approver: String,
    },
    SynthesizeMemory {
        title: String,
        source_ids: Vec<String>,
        actor: String,
    },
}

pub struct WorkspaceService<S, G = AutonomyLadderGovernor> {
    store: S,
    governor: G,
}

impl<S: EventStore> WorkspaceService<S, AutonomyLadderGovernor> {
    pub fn new(store: S) -> Self {
        Self::with_governor(store, AutonomyLadderGovernor)
    }
}

impl<S: EventStore, G: ActionGovernor> WorkspaceService<S, G> {
    pub fn with_governor(store: S, governor: G) -> Self {
        Self { store, governor }
    }

    pub fn state(&self) -> Result<WorkspaceState, String> {
        WorkspaceState::replay(&self.store.load()?)
    }

    pub fn execute(&self, operation: WorkspaceOperation) -> Result<WorkspaceEvent, String> {
        let state = self.state()?;
        let event = match operation {
            WorkspaceOperation::CreateBlock {
                kind,
                title,
                body,
                attention,
                actor,
            } => {
                require_text("title", &title)?;
                let now = now();
                event(
                    actor,
                    WorkspaceEventKind::BlockCreated {
                        block: Block {
                            id: Uuid::new_v4().to_string(),
                            kind,
                            title,
                            body,
                            attention,
                            created_at: now.clone(),
                            updated_at: now,
                            metadata: BTreeMap::new(),
                        },
                    },
                )
            }
            WorkspaceOperation::UpdateBlock {
                block_id,
                title,
                body,
                attention,
                actor,
            } => {
                resolve_block(&state, &block_id)?;
                if let Some(value) = &title {
                    require_text("title", value)?;
                }
                if title.is_none() && body.is_none() && attention.is_none() {
                    return Err("update requires title, body, or attention".into());
                }
                event(
                    actor,
                    WorkspaceEventKind::BlockUpdated {
                        block_id: resolve_block_id(&state, &block_id)?,
                        title,
                        body,
                        attention,
                        updated_at: now(),
                    },
                )
            }
            WorkspaceOperation::LinkBlocks {
                source,
                target,
                relation,
                actor,
            } => {
                require_text("relation", &relation)?;
                let source = resolve_block_id(&state, &source)?;
                let target = resolve_block_id(&state, &target)?;
                event(
                    actor,
                    WorkspaceEventKind::BlocksLinked {
                        link: Link {
                            source,
                            target,
                            relation,
                            created_at: now(),
                        },
                    },
                )
            }
            WorkspaceOperation::RequestAction {
                block_id,
                description,
                risk,
                actor,
            } => {
                require_text("description", &description)?;
                let block_id = resolve_block_id(&state, &block_id)?;
                let requested_at = now();
                event(
                    actor.clone(),
                    WorkspaceEventKind::ActionRequested {
                        action: GovernedAction {
                            id: Uuid::new_v4().to_string(),
                            block_id,
                            description,
                            risk,
                            status: self.governor.initial_status(risk),
                            requested_by: actor,
                            approved_by: None,
                            requested_at,
                            approved_at: None,
                        },
                    },
                )
            }
            WorkspaceOperation::ApproveAction {
                action_id,
                approver,
            } => {
                self.governor.validate_human_approver(&approver)?;
                let action_id = resolve_action_id(&state, &action_id)?;
                let action = state.actions.get(&action_id).expect("resolved action");
                if action.status != ActionStatus::PendingHuman {
                    return Err("only pending critical actions accept human approval".into());
                }
                event(
                    approver.clone(),
                    WorkspaceEventKind::ActionApproved {
                        action_id,
                        approver,
                        approved_at: now(),
                    },
                )
            }
            WorkspaceOperation::SynthesizeMemory {
                title,
                source_ids,
                actor,
            } => {
                require_text("title", &title)?;
                if source_ids.is_empty() {
                    return Err("memory requires at least one source block".into());
                }
                let mut resolved = Vec::with_capacity(source_ids.len());
                for id in source_ids {
                    let id = resolve_block_id(&state, &id)?;
                    if !resolved.contains(&id) {
                        resolved.push(id);
                    }
                }
                let now = now();
                let memory_id = Uuid::new_v4().to_string();
                let body = render_memory_body(&state, &resolved);
                let links = resolved
                    .iter()
                    .map(|source| Link {
                        source: memory_id.clone(),
                        target: source.clone(),
                        relation: "summarizes".into(),
                        created_at: now.clone(),
                    })
                    .collect();
                event(
                    actor,
                    WorkspaceEventKind::MemorySynthesized {
                        memory: Block {
                            id: memory_id,
                            kind: BlockKind::Memory,
                            title,
                            body,
                            attention: AttentionClass::Signal,
                            created_at: now.clone(),
                            updated_at: now,
                            metadata: BTreeMap::from([(
                                "synthesis".into(),
                                "deterministic-source-summary".into(),
                            )]),
                        },
                        source_ids: resolved,
                        links,
                    },
                )
            }
        };
        let mut projected = state;
        projected.apply(&event)?;
        self.store.append(&event)?;
        Ok(event)
    }
}

fn now() -> String {
    let observed = Utc::now()
        .timestamp_nanos_opt()
        .unwrap_or_else(|| Utc::now().timestamp_micros().saturating_mul(1_000));
    let mut previous = LAST_EVENT_NANOS.load(Ordering::Relaxed);
    let timestamp = loop {
        let next = observed.max(previous.saturating_add(1));
        match LAST_EVENT_NANOS.compare_exchange_weak(
            previous,
            next,
            Ordering::SeqCst,
            Ordering::Relaxed,
        ) {
            Ok(_) => break next,
            Err(actual) => previous = actual,
        }
    };
    chrono::DateTime::<Utc>::from_timestamp(
        timestamp.div_euclid(1_000_000_000),
        timestamp.rem_euclid(1_000_000_000) as u32,
    )
    .expect("current UTC timestamp is representable")
    .to_rfc3339_opts(chrono::SecondsFormat::Nanos, true)
}

fn event(actor: String, kind: WorkspaceEventKind) -> WorkspaceEvent {
    WorkspaceEvent {
        id: Uuid::new_v4().to_string(),
        occurred_at: now(),
        actor,
        kind,
    }
}

#[cfg(test)]
mod timestamp_tests {
    use super::now;

    #[test]
    fn event_timestamps_are_strictly_monotonic_within_a_process() {
        let mut previous = now();
        for _ in 0..10_000 {
            let current = now();
            assert!(current > previous, "{current} must be after {previous}");
            previous = current;
        }
    }
}

fn require_text(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} cannot be empty"))
    } else {
        Ok(())
    }
}

pub fn resolve_block_id(state: &WorkspaceState, prefix: &str) -> Result<String, String> {
    resolve_id(state.blocks.keys(), prefix, "block")
}

pub fn resolve_action_id(state: &WorkspaceState, prefix: &str) -> Result<String, String> {
    resolve_id(state.actions.keys(), prefix, "action")
}

fn resolve_block<'a>(state: &'a WorkspaceState, prefix: &str) -> Result<&'a Block, String> {
    let id = resolve_block_id(state, prefix)?;
    state
        .blocks
        .get(&id)
        .ok_or_else(|| format!("block not found: {prefix}"))
}

fn resolve_id<'a>(
    ids: impl Iterator<Item = &'a String>,
    prefix: &str,
    kind: &str,
) -> Result<String, String> {
    let matches: Vec<_> = ids.filter(|id| id.starts_with(prefix)).cloned().collect();
    match matches.as_slice() {
        [] => Err(format!("no {kind} matches '{prefix}'")),
        [id] => Ok(id.clone()),
        _ => Err(format!(
            "{} {kind}s match '{prefix}'; use a longer prefix",
            matches.len()
        )),
    }
}

fn render_memory_body(state: &WorkspaceState, source_ids: &[String]) -> String {
    let mut body = String::from("Synthesized from explicit workspace sources:\n");
    for id in source_ids {
        if let Some(block) = state.blocks.get(id) {
            body.push_str(&format!(
                "\n- [{}](yana://block/{}) — {}",
                block.title,
                block.id,
                excerpt(&block.body)
            ));
        }
    }
    body
}

fn excerpt(value: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= 160 {
        normalized
    } else {
        format!("{}…", normalized.chars().take(159).collect::<String>())
    }
}
