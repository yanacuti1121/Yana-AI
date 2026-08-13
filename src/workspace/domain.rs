use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Message,
    Document,
    Task,
    AgentAction,
    PullRequest,
    Memory,
    Email,
    Call,
    Contact,
    Company,
    Custom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum AttentionClass {
    Signal,
    Review,
    Noise,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Block {
    pub id: String,
    pub kind: BlockKind,
    pub title: String,
    pub body: String,
    pub attention: AttentionClass,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Link {
    pub source: String,
    pub target: String,
    pub relation: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionStatus {
    AutoApproved,
    PendingHuman,
    HumanApproved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GovernedAction {
    pub id: String,
    pub block_id: String,
    pub description: String,
    pub risk: RiskLevel,
    pub status: ActionStatus,
    pub requested_by: String,
    pub approved_by: Option<String>,
    pub requested_at: String,
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceEvent {
    pub id: String,
    pub occurred_at: String,
    pub actor: String,
    #[serde(flatten)]
    pub kind: WorkspaceEventKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "event", content = "data", rename_all = "snake_case")]
pub enum WorkspaceEventKind {
    BlockCreated {
        block: Block,
    },
    BlockUpdated {
        block_id: String,
        title: Option<String>,
        body: Option<String>,
        attention: Option<AttentionClass>,
        updated_at: String,
    },
    BlocksLinked {
        link: Link,
    },
    ActionRequested {
        action: GovernedAction,
    },
    ActionApproved {
        action_id: String,
        approver: String,
        approved_at: String,
    },
    MemorySynthesized {
        memory: Block,
        source_ids: Vec<String>,
        links: Vec<Link>,
    },
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub blocks: HashMap<String, Block>,
    pub links: Vec<Link>,
    pub actions: HashMap<String, GovernedAction>,
}

impl WorkspaceState {
    pub fn replay(events: &[WorkspaceEvent]) -> Result<Self, String> {
        let mut state = Self::default();
        for event in events {
            state.apply(event)?;
        }
        Ok(state)
    }

    pub fn apply(&mut self, event: &WorkspaceEvent) -> Result<(), String> {
        match &event.kind {
            WorkspaceEventKind::BlockCreated { block } => {
                if self.blocks.contains_key(&block.id) {
                    return Err(format!("block already exists: {}", block.id));
                }
                self.blocks.insert(block.id.clone(), block.clone());
            }
            WorkspaceEventKind::BlockUpdated {
                block_id,
                title,
                body,
                attention,
                updated_at,
            } => {
                let block = self
                    .blocks
                    .get_mut(block_id)
                    .ok_or_else(|| format!("block not found: {block_id}"))?;
                if let Some(value) = title {
                    block.title.clone_from(value);
                }
                if let Some(value) = body {
                    block.body.clone_from(value);
                }
                if let Some(value) = attention {
                    block.attention = *value;
                }
                block.updated_at.clone_from(updated_at);
            }
            WorkspaceEventKind::BlocksLinked { link } => {
                self.validate_link(link)?;
                if !self.links.iter().any(|existing| {
                    existing.source == link.source
                        && existing.target == link.target
                        && existing.relation == link.relation
                }) {
                    self.links.push(link.clone());
                }
            }
            WorkspaceEventKind::ActionRequested { action } => {
                if !self.blocks.contains_key(&action.block_id) {
                    return Err(format!("action block not found: {}", action.block_id));
                }
                self.actions.insert(action.id.clone(), action.clone());
            }
            WorkspaceEventKind::ActionApproved {
                action_id,
                approver,
                approved_at,
            } => {
                let action = self
                    .actions
                    .get_mut(action_id)
                    .ok_or_else(|| format!("action not found: {action_id}"))?;
                match action.status {
                    ActionStatus::PendingHuman => {
                        action.status = ActionStatus::HumanApproved;
                        action.approved_by = Some(approver.clone());
                        action.approved_at = Some(approved_at.clone());
                    }
                    ActionStatus::HumanApproved => {}
                    ActionStatus::AutoApproved => {
                        return Err(format!(
                            "action does not require human approval: {action_id}"
                        ));
                    }
                }
            }
            WorkspaceEventKind::MemorySynthesized {
                memory,
                source_ids,
                links,
            } => {
                if source_ids.is_empty() {
                    return Err("memory requires at least one source".into());
                }
                for source in source_ids {
                    if !self.blocks.contains_key(source) {
                        return Err(format!("memory source not found: {source}"));
                    }
                }
                self.blocks.insert(memory.id.clone(), memory.clone());
                for link in links {
                    self.validate_link(link)?;
                    self.links.push(link.clone());
                }
            }
        }
        Ok(())
    }

    fn validate_link(&self, link: &Link) -> Result<(), String> {
        if link.source == link.target {
            return Err("self-links are not allowed".into());
        }
        if !self.blocks.contains_key(&link.source) {
            return Err(format!("link source not found: {}", link.source));
        }
        if !self.blocks.contains_key(&link.target) {
            return Err(format!("link target not found: {}", link.target));
        }
        if link.relation.trim().is_empty() {
            return Err("link relation cannot be empty".into());
        }
        Ok(())
    }

    pub fn related<'a>(&'a self, id: &str) -> Vec<(&'a Block, &'a Link)> {
        let mut output = Vec::new();
        for link in &self.links {
            let other = if link.source == id {
                Some(link.target.as_str())
            } else if link.target == id {
                Some(link.source.as_str())
            } else {
                None
            };
            if let Some(other) = other {
                if let Some(block) = self.blocks.get(other) {
                    output.push((block, link));
                }
            }
        }
        output.sort_by(|(left, _), (right, _)| left.title.cmp(&right.title));
        output
    }

    pub fn inbox(&self, include_noise: bool) -> Vec<&Block> {
        let mut blocks: Vec<_> = self
            .blocks
            .values()
            .filter(|block| include_noise || block.attention != AttentionClass::Noise)
            .collect();
        blocks.sort_by(|left, right| {
            left.attention
                .cmp(&right.attention)
                .then_with(|| right.updated_at.cmp(&left.updated_at))
        });
        blocks
    }

    pub fn search(&self, query: &str) -> Vec<&Block> {
        let needle = query.to_lowercase();
        let mut blocks: Vec<_> = self
            .blocks
            .values()
            .filter(|block| {
                block.title.to_lowercase().contains(&needle)
                    || block.body.to_lowercase().contains(&needle)
                    || block.metadata.iter().any(|(key, value)| {
                        key.to_lowercase().contains(&needle)
                            || value.to_lowercase().contains(&needle)
                    })
            })
            .collect();
        blocks.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        blocks
    }
}
