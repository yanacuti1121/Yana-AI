//! Unified local workspace for Yana runtime context.
//!
//! This is a clean-room implementation of general workspace patterns:
//! event-sourced blocks, bidirectional links, deterministic shared memory,
//! a Signal/Noise projection, Markdown export, and governed operations shared
//! by CLI and MCP. It does not copy code or data models from Macro.

mod domain;
mod markdown;
mod service;
mod store;

#[cfg(feature = "mcp")]
pub use domain::WorkspaceState;
pub use domain::{AttentionClass, BlockKind, RiskLevel};
pub use service::{resolve_block_id, WorkspaceOperation, WorkspaceService};
pub use store::FileEventStore;

use clap::Subcommand;
use markdown::{MarkdownExporter, WorkspaceExporter};
use std::path::PathBuf;

#[derive(Subcommand)]
pub enum WorkspaceAction {
    /// Create a workspace block (message, task, document, agent action, etc.)
    Create {
        #[arg(value_enum)]
        kind: BlockKind,
        title: String,
        #[arg(long, default_value = "")]
        body: String,
        #[arg(long, value_enum, default_value = "review")]
        attention: AttentionClass,
        #[arg(long, default_value = "human:local")]
        actor: String,
    },
    /// Update content or attention without replacing block identity
    Update {
        id: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        body: Option<String>,
        #[arg(long, value_enum)]
        attention: Option<AttentionClass>,
        #[arg(long, default_value = "human:local")]
        actor: String,
    },
    /// Create a directional relation that is navigable from both ends
    Link {
        source: String,
        target: String,
        relation: String,
        #[arg(long, default_value = "human:local")]
        actor: String,
    },
    /// Show one block and all bidirectionally related context
    Show { id: String },
    /// Search titles, bodies, and metadata
    Search { query: String },
    /// Deterministically classify an inbox block; --apply writes the suggested attention
    Triage {
        id: String,
        #[arg(long)]
        apply: bool,
        #[arg(long, default_value = "yana-rt")]
        actor: String,
    },
    /// Signal/Review inbox; Noise is hidden unless explicitly requested
    Inbox {
        #[arg(long)]
        include_noise: bool,
        #[arg(long)]
        json: bool,
    },
    /// Deterministically synthesize a transparent memory block from sources
    Remember {
        title: String,
        source_ids: Vec<String>,
        #[arg(long, default_value = "yana-rt")]
        actor: String,
    },
    /// Request or approve a governed external action
    Action {
        #[command(subcommand)]
        action: WorkspaceGovernanceAction,
    },
    /// Export every block and its links as portable Markdown files
    Export {
        #[arg(long, default_value = ".yana-ai/workspace/export")]
        output: PathBuf,
    },
    /// Show workspace counts and autonomy queue state
    Status {
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand)]
pub enum WorkspaceGovernanceAction {
    /// Low/medium/high auto-approve; critical waits for explicit human approval
    Request {
        block_id: String,
        description: String,
        #[arg(long, value_enum)]
        risk: RiskLevel,
        #[arg(long, default_value = "yana-rt")]
        actor: String,
    },
    /// Approve a pending critical action with `human:<name>` identity
    Approve {
        action_id: String,
        #[arg(long)]
        approver: String,
    },
}

pub fn dispatch(action: WorkspaceAction) {
    if let Err(error) = run(action) {
        eprintln!("yana-rt workspace: {error}");
        std::process::exit(1);
    }
}

fn run(action: WorkspaceAction) -> Result<(), String> {
    let root = std::env::current_dir().map_err(|error| error.to_string())?;
    let service = WorkspaceService::new(FileEventStore::new(&root));
    match action {
        WorkspaceAction::Create {
            kind,
            title,
            body,
            attention,
            actor,
        } => print_event(service.execute(WorkspaceOperation::CreateBlock {
            kind,
            title,
            body,
            attention,
            actor,
        })?),
        WorkspaceAction::Update {
            id,
            title,
            body,
            attention,
            actor,
        } => print_event(service.execute(WorkspaceOperation::UpdateBlock {
            block_id: id,
            title,
            body,
            attention,
            actor,
        })?),
        WorkspaceAction::Link {
            source,
            target,
            relation,
            actor,
        } => print_event(service.execute(WorkspaceOperation::LinkBlocks {
            source,
            target,
            relation,
            actor,
        })?),
        WorkspaceAction::Show { id } => {
            let state = service.state()?;
            let id = resolve_block_id(&state, &id)?;
            let block = state.blocks.get(&id).expect("resolved block");
            println!(
                "{}",
                serde_json::to_string_pretty(block).map_err(|error| error.to_string())?
            );
            let related = state.related(&id);
            if !related.is_empty() {
                println!("\nRelated:");
                for (other, link) in related {
                    println!("  {}  {}  {}", short(&other.id), link.relation, other.title);
                }
            }
        }
        WorkspaceAction::Search { query } => {
            let state = service.state()?;
            for block in state.search(&query) {
                println!(
                    "{}  {:?}  {:?}  {}",
                    short(&block.id),
                    block.kind,
                    block.attention,
                    block.title
                );
            }
        }
        WorkspaceAction::Triage { id, apply, actor } => {
            let state = service.state()?;
            let id = resolve_block_id(&state, &id)?;
            let block = state.blocks.get(&id).expect("resolved block");
            let decision = triage(&format!("{}\n{}", block.title, block.body));
            println!("{}  {:?}\n  reason: {}", short(&id), decision.attention, decision.reason);
            if apply && decision.attention != block.attention {
                print_event(service.execute(WorkspaceOperation::UpdateBlock {
                    block_id: id,
                    title: None,
                    body: None,
                    attention: Some(decision.attention),
                    actor,
                })?);
            }
        }
        WorkspaceAction::Inbox {
            include_noise,
            json,
        } => {
            let state = service.state()?;
            let inbox = state.inbox(include_noise);
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&inbox).map_err(|error| error.to_string())?
                );
            } else if inbox.is_empty() {
                println!("Workspace inbox empty.");
            } else {
                for block in inbox {
                    println!(
                        "{}  {:?}  {:?}  {}",
                        short(&block.id),
                        block.attention,
                        block.kind,
                        block.title
                    );
                }
            }
        }
        WorkspaceAction::Remember {
            title,
            source_ids,
            actor,
        } => print_event(service.execute(WorkspaceOperation::SynthesizeMemory {
            title,
            source_ids,
            actor,
        })?),
        WorkspaceAction::Action { action } => match action {
            WorkspaceGovernanceAction::Request {
                block_id,
                description,
                risk,
                actor,
            } => print_event(service.execute(WorkspaceOperation::RequestAction {
                block_id,
                description,
                risk,
                actor,
            })?),
            WorkspaceGovernanceAction::Approve {
                action_id,
                approver,
            } => print_event(service.execute(WorkspaceOperation::ApproveAction {
                action_id,
                approver,
            })?),
        },
        WorkspaceAction::Export { output } => {
            let state = service.state()?;
            let paths = MarkdownExporter::new(output).export(&state)?;
            println!("exported {} Markdown files", paths.len());
        }
        WorkspaceAction::Status { json } => {
            let state = service.state()?;
            let pending_human = state
                .actions
                .values()
                .filter(|action| action.status == domain::ActionStatus::PendingHuman)
                .count();
            let summary = serde_json::json!({
                "blocks": state.blocks.len(),
                "links": state.links.len(),
                "actions": state.actions.len(),
                "pending_human": pending_human,
                "signal": state.blocks.values().filter(|block| block.attention == AttentionClass::Signal).count(),
                "review": state.blocks.values().filter(|block| block.attention == AttentionClass::Review).count(),
                "noise": state.blocks.values().filter(|block| block.attention == AttentionClass::Noise).count(),
            });
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&summary).map_err(|error| error.to_string())?
                );
            } else {
                println!(
                    "blocks: {} · links: {} · actions: {} · pending human: {}",
                    summary["blocks"],
                    summary["links"],
                    summary["actions"],
                    summary["pending_human"]
                );
                println!(
                    "signal: {} · review: {} · noise: {}",
                    summary["signal"], summary["review"], summary["noise"]
                );
            }
        }
    }
    Ok(())
}

/// Explainable inbox triage. It is deliberately conservative: ordinary
/// messages stay in Review, and only explicit urgency/blocked terms become
/// Signal. Connectors may feed email, issues, or calendar items into the same
/// workspace without receiving a separate hidden classification path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TriageDecision {
    pub attention: AttentionClass,
    pub reason: &'static str,
}

pub fn triage(text: &str) -> TriageDecision {
    let value = text.to_lowercase();
    const SIGNAL: &[&str] = &["urgent", "asap", "blocked", "blocker", "incident", "outage", "deadline", "hôm nay", "khẩn", "gấp", "sự cố"];
    const NOISE: &[&str] = &["unsubscribe", "newsletter", "weekly digest", "marketing", "promotion", "khuyến mãi", "bản tin"];
    if SIGNAL.iter().any(|term| value.contains(term)) {
        TriageDecision { attention: AttentionClass::Signal, reason: "explicit urgency or blocker signal" }
    } else if NOISE.iter().any(|term| value.contains(term)) {
        TriageDecision { attention: AttentionClass::Noise, reason: "newsletter or promotional signal" }
    } else {
        TriageDecision { attention: AttentionClass::Review, reason: "no explicit urgency or noise signal" }
    }
}

fn print_event(event: domain::WorkspaceEvent) {
    println!(
        "{}",
        serde_json::to_string_pretty(&event).expect("serialize workspace event")
    );
}

fn short(id: &str) -> &str {
    &id[..id.len().min(8)]
}

#[cfg(test)]
mod tests;
