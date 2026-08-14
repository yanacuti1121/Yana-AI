//! Program K — Yana OS Phase 1 local management plane.

mod agent;
mod autonomy;
mod credential;
mod governor;
mod health;
mod monitor;
mod monitor_service;
mod resource;
mod roadmap;
// Not wired into any OsAction/CLI command yet — see src/os/service/mod.rs.
#[allow(dead_code)]
mod service;
mod state;
mod supervisor;

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
    /// Evolution Governor — health, capacity, and portfolio roadmap.
    Governor {
        #[command(subcommand)]
        action: GovernorAction,
    },
    /// Cross-platform host and Yana runtime health monitoring.
    Monitor {
        #[command(subcommand)]
        action: MonitorAction,
    },
    /// Native Giám Thị supervisor, safety modes, dashboard, and receipts.
    Supervisor {
        #[command(subcommand)]
        action: SupervisorAction,
    },
    /// Automatic-operation policy and durable action intent queue.
    Autonomy {
        #[command(subcommand)]
        action: AutonomyAction,
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
pub enum AutonomyAction {
    /// Show or update the autonomy ceiling and verification policy.
    Policy {
        #[command(subcommand)]
        action: AutonomyPolicyAction,
    },
    /// Explain how a typed operation is classified by the current policy.
    Classify {
        operation: autonomy::Operation,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Manage durable action intents. This layer does not execute commands.
    Queue {
        #[command(subcommand)]
        action: AutonomyQueueAction,
    },
}

#[derive(Subcommand, Debug)]
pub enum AutonomyPolicyAction {
    Show {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Set {
        #[arg(long, action = clap::ArgAction::Set)]
        enabled: bool,
        #[arg(long)]
        max_automatic_level: autonomy::AutonomyLevel,
        #[arg(long, default_value_t = 1)]
        max_attempts: u32,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
pub enum AutonomyQueueAction {
    List {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Add {
        operation: autonomy::Operation,
        #[arg(long)]
        summary: String,
        #[arg(long)]
        program: String,
        #[arg(long = "arg")]
        args: Vec<String>,
        #[arg(long)]
        verify_program: Option<String>,
        #[arg(long = "verify-arg")]
        verify_args: Vec<String>,
        #[arg(long)]
        rollback_program: Option<String>,
        #[arg(long = "rollback-arg")]
        rollback_args: Vec<String>,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Approve {
        id: String,
        #[arg(long)]
        approve: bool,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Cancel {
        id: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
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
    /// Manage the approved NOW/NEXT/LATER roadmap.
    Roadmap {
        #[command(subcommand)]
        action: RoadmapAction,
    },
}

#[derive(Subcommand, Debug)]
pub enum MonitorAction {
    /// Collect and persist one CPU, memory, disk, GPU, and Yana health snapshot.
    Sample {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Show the most recently persisted snapshot without collecting again.
    Show {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Install, inspect, or remove the per-user automatic sampler.
    Service {
        #[command(subcommand)]
        action: MonitorServiceAction,
    },
}

#[derive(Subcommand, Debug)]
pub enum MonitorServiceAction {
    /// Explicitly install and start the native per-user scheduler.
    Install {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long, default_value_t = 60)]
        interval_secs: u64,
        #[arg(long)]
        json: bool,
    },
    /// Show whether this project's native sampler definition is installed.
    Status {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Stop and remove this project's native per-user scheduler.
    Uninstall {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Subcommand, Debug)]
pub enum SupervisorAction {
    /// Run one native monitoring and governance heartbeat.
    Tick {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Show the aggregate supervisor dashboard and heartbeat SLO.
    Status {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Run safe synthetic checks without touching the production halt lock.
    SelfTest {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Native hook-event policy check — reads a hook JSON payload from
    /// stdin, checks the shared GIAMTHI_HALT.lock/quarantine state, and
    /// prints the response shape the current hook event requires
    /// (PreToolUse deny-JSON+exit 2, SessionStart continue:false+exit 0,
    /// UserPromptSubmit decision:block+exit 0). This is the canonical
    /// implementation core/hooks/giamthi-halt-check.sh calls first,
    /// falling back to its own jq-based logic only when yana-rt isn't on
    /// PATH — no jq dependency, no degraded path, for any of the three
    /// event shapes.
    HookCheck {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
    },
    /// Create the shared cross-engine halt lock.
    Halt {
        #[arg(long)]
        reason: String,
        #[arg(long)]
        actor: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
    },
    /// Human-only unlock ceremony with an auditable reason.
    Unlock {
        #[arg(long)]
        approve: bool,
        #[arg(long)]
        reason: String,
        #[arg(long)]
        actor: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
    },
    /// Apply or clear a reduced-capability safety mode.
    Quarantine {
        #[command(subcommand)]
        action: SupervisorQuarantineAction,
    },
    /// Working-tree content-hash drift on security-sensitive paths outside
    /// core-lock's LOCKED_DIRS (.claude/settings.json, .claude/hooks/,
    /// .codex/hooks/, .github/workflows/) — closes the acknowledged
    /// commit-SHA-only blind spot in core/scripts/giamthi-watch.sh's own
    /// scope-drift check (an uncommitted, or committed-then-reverted,
    /// edit was previously invisible between ticks).
    Baseline {
        #[command(subcommand)]
        action: SupervisorBaselineAction,
    },
    /// Install, inspect, or remove the native per-user supervisor scheduler.
    ///
    /// This installs a PERIODIC scheduled tick (launchd StartInterval /
    /// systemd timer / Task Scheduler, invoking `yana-rt os supervisor
    /// tick` on an interval) — dispatches to `monitor_service`, the exact
    /// same installer `yana-rt os monitor service` uses. It does not start
    /// a resident, continuously-running process. `src/os/service/` (a
    /// separate, currently-unwired module — see
    /// docs/operations/always-on-service.md) is where that KeepAlive/
    /// Restart=always resident daemon foundation lives; when it gets a CLI
    /// surface, it will not reuse this `Service` name, specifically so the
    /// two are never confusable at the command line the way they
    /// previously were only distinguishable by reading the source.
    Service {
        #[command(subcommand)]
        action: MonitorServiceAction,
    },
}

#[derive(Subcommand, Debug)]
pub enum SupervisorQuarantineAction {
    Set {
        mode: supervisor::QuarantineMode,
        #[arg(long)]
        reason: String,
        #[arg(long)]
        actor: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    Clear {
        #[arg(long)]
        approve: bool,
        #[arg(long)]
        reason: String,
        #[arg(long)]
        actor: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
    },
}

#[derive(Subcommand, Debug)]
pub enum SupervisorBaselineAction {
    /// Compare the working tree against the approved baseline. Never
    /// writes anything. Exits non-zero if drift is found (or bail!s), so
    /// giamthi-watch.sh's capture-exit-code convention works unchanged.
    Check {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Human-only ceremony to set or advance the approved baseline to the
    /// current working tree. A Giám Thị process must never call this on
    /// its own — see supervisor::approve_sensitive_baseline's doc comment.
    Approve {
        #[arg(long)]
        approve: bool,
        #[arg(long)]
        reason: String,
        #[arg(long)]
        actor: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
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

#[derive(Subcommand, Debug)]
pub enum RoadmapAction {
    /// Show every roadmap tier, ordered by priority.
    List {
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Register a complete proposal at NEXT or LATER.
    Add(Box<RoadmapAddArgs>),
    /// Promote NEXT to NOW with explicit human approval.
    Promote {
        #[arg(long)]
        id: String,
        #[arg(long)]
        approve: bool,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Move an existing NOW or NEXT item to LATER.
    Demote {
        #[arg(long)]
        id: String,
        #[arg(long, default_value = ".")]
        dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(clap::Args, Debug)]
pub struct RoadmapAddArgs {
    #[arg(long)]
    tier: roadmap::ProposalTier,
    #[arg(long)]
    action: state::RoadmapItemAction,
    #[arg(long)]
    priority: state::RoadmapPriority,
    #[arg(long)]
    objective: String,
    #[arg(long)]
    evidence: String,
    #[arg(long)]
    scope: String,
    #[arg(long)]
    out_of_scope: String,
    #[arg(long)]
    dependencies: String,
    #[arg(long)]
    risks: String,
    #[arg(long)]
    deliverables: String,
    #[arg(long)]
    owner: String,
    #[arg(long)]
    reviewer: String,
    #[arg(long)]
    acceptance_criteria: String,
    #[arg(long)]
    exit_criteria: String,
    #[arg(long)]
    definition_of_done: String,
    #[arg(long)]
    rollback_path: String,
    #[arg(long, default_value = ".")]
    dir: PathBuf,
    #[arg(long)]
    json: bool,
}
#[derive(Serialize)]
struct OsStatus {
    schema_version: u32,
    state_path: String,
    managed_agents: usize,
    running_agents: usize,
    resource_policy_configured: bool,
    providers: Vec<credential::CredentialStatus>,
    autonomy_ready: usize,
    autonomy_waiting_approval: usize,
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
            let queue = autonomy::load_queue(&root)?;
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
                autonomy_ready: queue
                    .actions
                    .iter()
                    .filter(|action| action.status == autonomy::ActionStatus::Ready)
                    .count(),
                autonomy_waiting_approval: queue
                    .actions
                    .iter()
                    .filter(|action| action.status == autonomy::ActionStatus::WaitingApproval)
                    .count(),
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
                println!("  autonomy ready      {}", report.autonomy_ready);
                println!("  awaiting approval   {}", report.autonomy_waiting_approval);
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
        OsAction::Monitor { action } => dispatch_monitor(action)?,
        OsAction::Supervisor { action } => dispatch_supervisor(action)?,
        OsAction::Autonomy { action } => dispatch_autonomy(action)?,
        OsAction::AgentList { limit } => agent::legacy_list(limit),
        OsAction::CredentialStatus => credential::status(false)?,
        OsAction::ResourceStatus => resource::legacy_status(),
    }
    Ok(())
}

fn dispatch_supervisor(action: SupervisorAction) -> Result<()> {
    match action {
        SupervisorAction::Tick { dir, json } => {
            let root = state::project_root(&dir)?;
            supervisor::print(&supervisor::tick(&root)?, json, "Yana Giám Thị tick")?;
        }
        SupervisorAction::Status { dir, json } => {
            let root = state::project_root(&dir)?;
            supervisor::print(
                &supervisor::dashboard(&root)?,
                json,
                "Yana Giám Thị dashboard",
            )?;
        }
        SupervisorAction::SelfTest { dir, json } => {
            let root = state::project_root(&dir)?;
            let report = supervisor::self_test(&root);
            supervisor::print(&report, json, "Yana Giám Thị self-test")?;
            if !report.passed {
                bail!("Giám Thị self-test found blocking failures");
            }
        }
        SupervisorAction::HookCheck { dir } => {
            let root = state::project_root(&dir)?;
            // Exits directly with the hook-contract-specific code (0 or 2)
            // rather than returning through this function's Result<()> —
            // the caller (core/hooks/giamthi-halt-check.sh) depends on the
            // exact exit code, same as guard::dispatch()'s std::process::exit
            // pattern for the other hot-path hook subcommands. A stdin-read/
            // parse failure still propagates as Err here, which main.rs's
            // existing Commands::Os handler turns into exit 2 — fail closed,
            // not silently allowed, when the input can't be interpreted at
            // all.
            let code = supervisor::cmd_hook_check(&root)?;
            std::process::exit(code);
        }
        SupervisorAction::Halt { reason, actor, dir } => {
            let root = state::project_root(&dir)?;
            supervisor::halt(&root, &reason, &actor)?;
            println!(
                "Giám Thị halted all supported engines for {}",
                root.display()
            );
        }
        SupervisorAction::Unlock {
            approve,
            reason,
            actor,
            dir,
        } => {
            let root = state::project_root(&dir)?;
            supervisor::unlock(&root, approve, &reason, &actor)?;
            println!("Human unlock ceremony completed for {}", root.display());
        }
        SupervisorAction::Quarantine { action } => match action {
            SupervisorQuarantineAction::Set {
                mode,
                reason,
                actor,
                dir,
                json,
            } => {
                let root = state::project_root(&dir)?;
                supervisor::print(
                    &supervisor::set_quarantine(&root, mode, &reason, &actor)?,
                    json,
                    "Yana Giám Thị quarantine",
                )?;
            }
            SupervisorQuarantineAction::Clear {
                approve,
                reason,
                actor,
                dir,
            } => {
                let root = state::project_root(&dir)?;
                supervisor::clear_quarantine(&root, approve, &reason, &actor)?;
                println!("Giám Thị quarantine cleared for {}", root.display());
            }
        },
        SupervisorAction::Baseline { action } => match action {
            SupervisorBaselineAction::Check { dir, json } => {
                let root = state::project_root(&dir)?;
                let report = supervisor::sensitive_drift(&root)?;
                supervisor::print(&report, json, "Yana Giám Thị sensitive-path baseline")?;
                if !report.clean {
                    bail!("sensitive-path drift detected outside the approved baseline");
                }
            }
            SupervisorBaselineAction::Approve {
                approve,
                reason,
                actor,
                dir,
                json,
            } => {
                let root = state::project_root(&dir)?;
                let baseline =
                    supervisor::approve_sensitive_baseline(&root, approve, &reason, &actor)?;
                supervisor::print(
                    &baseline,
                    json,
                    "Yana Giám Thị sensitive-path baseline approved",
                )?;
            }
        },
        SupervisorAction::Service { action } => match action {
            MonitorServiceAction::Install {
                dir,
                interval_secs,
                json,
            } => {
                let root = state::project_root(&dir)?;
                monitor_service::print(&monitor_service::install(&root, interval_secs)?, json)?;
            }
            MonitorServiceAction::Status { dir, json } => {
                let root = state::project_root(&dir)?;
                monitor_service::print(&monitor_service::status(&root)?, json)?;
            }
            MonitorServiceAction::Uninstall { dir, json } => {
                let root = state::project_root(&dir)?;
                monitor_service::print(&monitor_service::uninstall(&root)?, json)?;
            }
        },
    }
    Ok(())
}

fn dispatch_monitor(action: MonitorAction) -> Result<()> {
    match action {
        MonitorAction::Sample { dir, json } => {
            let root = state::project_root(&dir)?;
            let snapshot = monitor::collect(&root);
            monitor::persist(&root, &snapshot)?;
            monitor::print(&snapshot, json)?;
        }
        MonitorAction::Show { dir, json } => {
            let root = state::project_root(&dir)?;
            monitor::print(&monitor::load(&root)?, json)?;
        }
        MonitorAction::Service { action } => match action {
            MonitorServiceAction::Install {
                dir,
                interval_secs,
                json,
            } => {
                let root = state::project_root(&dir)?;
                let report = monitor_service::install(&root, interval_secs)?;
                monitor_service::print(&report, json)?;
            }
            MonitorServiceAction::Status { dir, json } => {
                let root = state::project_root(&dir)?;
                monitor_service::print(&monitor_service::status(&root)?, json)?;
            }
            MonitorServiceAction::Uninstall { dir, json } => {
                let root = state::project_root(&dir)?;
                monitor_service::print(&monitor_service::uninstall(&root)?, json)?;
            }
        },
    }
    Ok(())
}

fn dispatch_autonomy(action: AutonomyAction) -> Result<()> {
    match action {
        AutonomyAction::Policy { action } => match action {
            AutonomyPolicyAction::Show { dir, json } => {
                let root = state::project_root(&dir)?;
                autonomy::print_json_or_debug(&autonomy::load_policy(&root)?, json)?;
            }
            AutonomyPolicyAction::Set {
                enabled,
                max_automatic_level,
                max_attempts,
                dir,
                json,
            } => {
                let root = state::project_root(&dir)?;
                let policy = autonomy::AutonomyPolicy {
                    enabled,
                    max_automatic_level,
                    max_attempts,
                };
                autonomy::save_policy(&root, &policy)?;
                autonomy::print_json_or_debug(&policy, json)?;
            }
        },
        AutonomyAction::Classify {
            operation,
            dir,
            json,
        } => {
            let root = state::project_root(&dir)?;
            let policy = autonomy::load_policy(&root)?;
            autonomy::print_json_or_debug(&autonomy::evaluate(&policy, operation), json)?;
        }
        AutonomyAction::Queue { action } => match action {
            AutonomyQueueAction::List { dir, json } => {
                let root = state::project_root(&dir)?;
                autonomy::print_json_or_debug(&autonomy::load_queue(&root)?, json)?;
            }
            AutonomyQueueAction::Add {
                operation,
                summary,
                program,
                args,
                verify_program,
                verify_args,
                rollback_program,
                rollback_args,
                dir,
                json,
            } => {
                if verify_program.is_none() && !verify_args.is_empty() {
                    bail!("--verify-arg requires --verify-program");
                }
                if rollback_program.is_none() && !rollback_args.is_empty() {
                    bail!("--rollback-arg requires --rollback-program");
                }
                let root = state::project_root(&dir)?;
                let action = autonomy::enqueue(
                    &root,
                    autonomy::NewAction {
                        operation,
                        summary,
                        command: autonomy::ActionCommand { program, args },
                        verification: verify_program.map(|program| autonomy::ActionCommand {
                            program,
                            args: verify_args,
                        }),
                        rollback: rollback_program.map(|program| autonomy::ActionCommand {
                            program,
                            args: rollback_args,
                        }),
                    },
                )?;
                autonomy::print_json_or_debug(&action, json)?;
            }
            AutonomyQueueAction::Approve {
                id,
                approve,
                dir,
                json,
            } => {
                let root = state::project_root(&dir)?;
                autonomy::print_json_or_debug(&autonomy::approve(&root, &id, approve)?, json)?;
            }
            AutonomyQueueAction::Cancel { id, dir, json } => {
                let root = state::project_root(&dir)?;
                autonomy::print_json_or_debug(&autonomy::cancel(&root, &id)?, json)?;
            }
        },
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
        GovernorAction::Roadmap { action } => dispatch_roadmap(action)?,
    }
    Ok(())
}

fn dispatch_roadmap(action: RoadmapAction) -> Result<()> {
    match action {
        RoadmapAction::List { dir, json } => {
            let root = state::project_root(&dir)?;
            roadmap::print_view(&roadmap::list(&root)?, json)?;
        }
        RoadmapAction::Add(args) => {
            let RoadmapAddArgs {
                tier,
                action,
                priority,
                objective,
                evidence,
                scope,
                out_of_scope,
                dependencies,
                risks,
                deliverables,
                owner,
                reviewer,
                acceptance_criteria,
                exit_criteria,
                definition_of_done,
                rollback_path,
                dir,
                json,
            } = *args;
            let root = state::project_root(&dir)?;
            let item = roadmap::add(
                &root,
                roadmap::NewRoadmapItem {
                    tier,
                    action,
                    priority,
                    objective,
                    evidence,
                    scope,
                    out_of_scope,
                    dependencies,
                    risks,
                    deliverables,
                    owner,
                    reviewer,
                    acceptance_criteria,
                    exit_criteria,
                    definition_of_done,
                    rollback_path,
                },
            )?;
            roadmap::print_item(&item, json)?;
        }
        RoadmapAction::Promote {
            id,
            approve,
            dir,
            json,
        } => {
            let root = state::project_root(&dir)?;
            roadmap::print_item(&roadmap::promote(&root, &id, approve)?, json)?;
        }
        RoadmapAction::Demote { id, dir, json } => {
            let root = state::project_root(&dir)?;
            roadmap::print_item(&roadmap::demote(&root, &id)?, json)?;
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use clap::{error::ErrorKind, Parser};

    #[derive(Debug, Parser)]
    struct RoadmapCli {
        #[command(subcommand)]
        action: RoadmapAction,
    }

    #[test]
    fn add_requires_acceptance_criteria_at_the_cli_boundary() {
        let error = RoadmapCli::try_parse_from([
            "roadmap",
            "add",
            "--tier",
            "next",
            "--action",
            "stabilize",
            "--priority",
            "p1",
            "--objective",
            "fix golden path",
            "--evidence",
            "verified failure",
            "--scope",
            "runtime",
            "--out-of-scope",
            "new providers",
            "--dependencies",
            "capability runtime",
            "--risks",
            "regression",
            "--deliverables",
            "passing tests",
            "--owner",
            "runtime maintainer",
            "--reviewer",
            "anh",
            "--exit-criteria",
            "evidence recorded",
            "--definition-of-done",
            "tests pass",
            "--rollback-path",
            "remove wiring",
        ])
        .unwrap_err();

        assert_eq!(error.kind(), ErrorKind::MissingRequiredArgument);
        assert!(error.to_string().contains("--acceptance-criteria"));
    }
}
