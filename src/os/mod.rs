//! Program K — Yana OS Phase 1 local management plane.

mod agent;
mod credential;
mod governor;
mod health;
mod resource;
mod state;

use anyhow::{bail, Result};
use clap::Subcommand;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Subcommand, Debug)]
pub enum OsAction {
    /// Initialize versioned Yana OS state for a project.
    Init {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Show aggregate management-plane status.
    Status {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Inspect management-plane evidence without mutating or repairing it.
    Doctor {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Cooperative agent registry and lifecycle metadata.
    Agent {
        #[command(subcommand)]
        action: AgentAction,
    },
    /// Credential presence (never credential values).
    Credential {
        #[command(subcommand)]
        action: CredentialAction,
    },
    /// Explicit resource policy and preflight.
    Resource {
        #[command(subcommand)]
        action: ResourceAction,
    },
    /// Evolution Governor — status and absorption capacity.
    /// docs/EVOLUTION_GOVERNOR.md. The `roadmap` piece of that design is
    /// intentionally not here — built separately to avoid two agents
    /// editing this same enum at once.
    Governor {
        #[command(subcommand)]
        action: GovernorAction,
    },
    /// Phase 0 compatibility: list chat sessions.
    AgentList {
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    /// Phase 0 compatibility: provider credential presence.
    CredentialStatus,
    /// Phase 0 compatibility: existing token/cost ledger summary.
    ResourceStatus,
}

#[derive(Subcommand, Debug)]
pub enum AgentAction {
    List {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
        #[arg(long)]
        include_chat_sessions: bool,
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    Register {
        name: String,
        #[arg(long)]
        provider: String,
        #[arg(long)]
        model: Option<String>,
        #[arg(long)]
        session_id: Option<String>,
        #[arg(long)]
        owner: Option<String>,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Heartbeat {
        id: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Transition {
        id: String,
        status: state::AgentStatus,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
pub enum CredentialAction {
    Status {
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
pub enum ResourceAction {
    Show {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Set {
        #[arg(long)]
        max_active_agents: Option<usize>,
        #[arg(long)]
        max_tokens_per_request: Option<u64>,
        #[arg(long)]
        max_daily_cost_usd: Option<f64>,
        #[arg(long, default_value_t = 300)]
        stale_after_secs: u64,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Check {
        #[arg(long, default_value_t = 1)]
        requested_agents: usize,
        #[arg(long, default_value_t = 0)]
        estimated_tokens: u64,
        #[arg(long, default_value_t = 0.0)]
        estimated_cost_usd: f64,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
pub enum GovernorAction {
    /// Health Map — mechanically checkable signals only (drift-check,
    /// core-lock, manifest counts; --deep adds cargo test + hook suite).
    Status {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
        #[arg(long)]
        deep: bool,
    },
    /// Absorption capacity policy (docs/EVOLUTION_GOVERNOR.md's YAML
    /// example) — how much new work the project can take on right now.
    Capacity {
        #[command(subcommand)]
        action: CapacityAction,
    },
}

#[derive(Subcommand, Debug)]
pub enum CapacityAction {
    Show {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Set {
        #[arg(long, default_value = "convergence")]
        mode: String,
        #[arg(long, default_value_t = 2)]
        max_active_programs: usize,
        #[arg(long, default_value_t = 0)]
        max_architecture_changes: usize,
        #[arg(long, default_value_t = 0)]
        max_new_dependencies: usize,
        #[arg(long, default_value_t = 1)]
        max_active_experiments: usize,
        #[arg(long, default_value_t = 70)]
        allocation_consolidation_pct: u8,
        #[arg(long, default_value_t = 20)]
        allocation_onboarding_and_packaging_pct: u8,
        #[arg(long, default_value_t = 10)]
        allocation_experiments_pct: u8,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Serialize)]
struct OsStatus {
    schema_version: u32,
    state_path: String,
    managed_agents: usize,
    running_agents: usize,
    resource_policy_configured: bool,
    providers: Vec<credential::CredentialStatus>,
}

pub fn dispatch(action: OsAction) -> Result<()> {
    match action {
        OsAction::Init { dir, json } => {
            let root = state::project_root(&dir)?;
            let current = state::initialize(&root)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&current)?);
            } else {
                println!(
                    "Initialized Yana OS state at {}",
                    state::state_path(&root).display()
                );
                println!(
                    "Resource policy is unset; preflight remains fail-closed until configured."
                );
            }
        }
        OsAction::Status { dir, json } => {
            let root = state::project_root(&dir)?;
            let current = state::load(&root)?;
            let report = OsStatus {
                schema_version: current.schema_version,
                state_path: state::state_path(&root).display().to_string(),
                managed_agents: current.agents.len(),
                running_agents: current
                    .agents
                    .iter()
                    .filter(|agent| agent.status == state::AgentStatus::Running)
                    .count(),
                resource_policy_configured: current.resource_policy.is_some(),
                providers: credential::inventory(),
            };
            if json {
                println!("{}", serde_json::to_string_pretty(&report)?);
            } else {
                println!("Yana OS management plane");
                println!("  schema              {}", report.schema_version);
                println!("  state               {}", report.state_path);
                println!("  managed agents      {}", report.managed_agents);
                println!("  running agents      {}", report.running_agents);
                println!(
                    "  resource policy     {}",
                    if report.resource_policy_configured {
                        "configured"
                    } else {
                        "UNSET (preflight denies)"
                    }
                );
            }
        }
        OsAction::Doctor { dir, json } => {
            let root = state::project_root(&dir)?;
            let report = health::inspect(&root);
            health::print(&report, json)?;
            if report.failed() {
                bail!("Yana OS doctor found blocking failures");
            }
        }
        OsAction::Agent { action } => dispatch_agent(action)?,
        OsAction::Credential { action } => match action {
            CredentialAction::Status { json } => credential::status(json)?,
        },
        OsAction::Resource { action } => dispatch_resource(action)?,
        OsAction::Governor { action } => dispatch_governor(action)?,
        OsAction::AgentList { limit } => agent::legacy_list(limit),
        OsAction::CredentialStatus => credential::status(false)?,
        OsAction::ResourceStatus => resource::legacy_status(),
    }
    Ok(())
}

fn dispatch_agent(action: AgentAction) -> Result<()> {
    match action {
        AgentAction::List {
            dir,
            json,
            include_chat_sessions,
            limit,
        } => {
            let root = state::project_root(&dir)?;
            let inventory = agent::inventory(&root, include_chat_sessions, limit)?;
            agent::print_inventory(&inventory, json)?;
        }
        AgentAction::Register {
            name,
            provider,
            model,
            session_id,
            owner,
            dir,
            json,
        } => {
            let root = state::project_root(&dir)?;
            let record = agent::register(&root, name, provider, model, session_id, owner)?;
            agent::print_agent(&record, json)?;
        }
        AgentAction::Heartbeat { id, dir, json } => {
            let root = state::project_root(&dir)?;
            agent::print_agent(&agent::heartbeat(&root, &id)?, json)?;
        }
        AgentAction::Transition {
            id,
            status,
            dir,
            json,
        } => {
            let root = state::project_root(&dir)?;
            agent::print_agent(&agent::transition(&root, &id, status)?, json)?;
        }
    }
    Ok(())
}

fn dispatch_resource(action: ResourceAction) -> Result<()> {
    match action {
        ResourceAction::Show { dir, json } => {
            let root = state::project_root(&dir)?;
            resource::print_policy(&resource::policy(&root)?, json)?;
        }
        ResourceAction::Set {
            max_active_agents,
            max_tokens_per_request,
            max_daily_cost_usd,
            stale_after_secs,
            dir,
            json,
        } => {
            let root = state::project_root(&dir)?;
            let policy = resource::set_policy(
                &root,
                state::ResourcePolicy {
                    max_active_agents,
                    max_tokens_per_request,
                    max_daily_cost_usd,
                    stale_after_secs,
                },
            )?;
            resource::print_policy(&policy, json)?;
        }
        ResourceAction::Check {
            requested_agents,
            estimated_tokens,
            estimated_cost_usd,
            dir,
            json,
        } => {
            let root = state::project_root(&dir)?;
            let decision = resource::check(
                &root,
                requested_agents,
                estimated_tokens,
                estimated_cost_usd,
            )?;
            resource::print_decision(&decision, json)?;
            if !decision.allowed {
                bail!("resource preflight denied");
            }
        }
    }
    Ok(())
}

fn dispatch_governor(action: GovernorAction) -> Result<()> {
    match action {
        GovernorAction::Status { dir, json, deep } => {
            let root = state::project_root(&dir)?;
            let report = governor::status(&root, deep);
            governor::print_status(&report, json)?;
            if report.failed() {
                bail!("Evolution Governor status found blocking failures");
            }
        }
        GovernorAction::Capacity { action } => match action {
            CapacityAction::Show { dir, json } => {
                let root = state::project_root(&dir)?;
                governor::print_capacity(&governor::load_capacity(&root)?, json)?;
            }
            CapacityAction::Set {
                mode,
                max_active_programs,
                max_architecture_changes,
                max_new_dependencies,
                max_active_experiments,
                allocation_consolidation_pct,
                allocation_onboarding_and_packaging_pct,
                allocation_experiments_pct,
                dir,
                json,
            } => {
                let root = state::project_root(&dir)?;
                let capacity = governor::set_capacity(
                    &root,
                    governor::GovernorCapacity {
                        mode,
                        max_active_programs,
                        max_architecture_changes,
                        max_new_dependencies,
                        max_active_experiments,
                        allocation_consolidation_pct,
                        allocation_onboarding_and_packaging_pct,
                        allocation_experiments_pct,
                    },
                )?;
                governor::print_capacity(&capacity, json)?;
            }
        },
    }
    Ok(())
}
