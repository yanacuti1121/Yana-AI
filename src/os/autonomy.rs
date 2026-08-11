//! Durable autonomy policy and action queue for Yana OS.
//!
//! This module owns classification and intent persistence only. Execution is a
//! separate layer so callers cannot turn a user-provided command into an
//! automatic action merely by labeling it as low risk.

use crate::os::state;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

const POLICY_RELATIVE_PATH: &str = ".yana-ai/os/autonomy-policy.json";
const QUEUE_RELATIVE_PATH: &str = ".yana-ai/os/autonomy-queue.json";
const POLICY_LOCK_IDENTITY: &str = "key:yana-os/autonomy-policy.json";
const QUEUE_LOCK_IDENTITY: &str = "key:yana-os/autonomy-queue.json";
const QUEUE_SCHEMA_VERSION: u32 = 1;

#[derive(
    Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, clap::ValueEnum,
)]
#[serde(rename_all = "snake_case")]
pub enum AutonomyLevel {
    Observe,
    Diagnose,
    Reversible,
    Bounded,
    Sovereign,
}

impl AutonomyLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Observe => "observe",
            Self::Diagnose => "diagnose",
            Self::Reversible => "reversible",
            Self::Bounded => "bounded",
            Self::Sovereign => "sovereign",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, clap::ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    ObserveSystem,
    DiagnoseFailure,
    RunVerification,
    ApplyReversibleFix,
    CreateWorktree,
    CreateBranch,
    LocalCommit,
    OpenDraftPullRequest,
    MergeProtectedBranch,
    PublishRelease,
    DeployProduction,
    RotateSecret,
    DeletePersistentData,
    ChangeSecurityPolicy,
}

impl Operation {
    pub fn required_level(self) -> AutonomyLevel {
        match self {
            Self::ObserveSystem => AutonomyLevel::Observe,
            Self::DiagnoseFailure => AutonomyLevel::Diagnose,
            Self::RunVerification | Self::ApplyReversibleFix => AutonomyLevel::Reversible,
            Self::CreateWorktree
            | Self::CreateBranch
            | Self::LocalCommit
            | Self::OpenDraftPullRequest => AutonomyLevel::Bounded,
            Self::MergeProtectedBranch
            | Self::PublishRelease
            | Self::DeployProduction
            | Self::RotateSecret
            | Self::DeletePersistentData
            | Self::ChangeSecurityPolicy => AutonomyLevel::Sovereign,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutonomyPolicy {
    pub enabled: bool,
    pub max_automatic_level: AutonomyLevel,
    pub max_attempts: u32,
}

impl Default for AutonomyPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            max_automatic_level: AutonomyLevel::Bounded,
            max_attempts: 1,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DecisionKind {
    Automatic,
    HumanApprovalRequired,
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PolicyDecision {
    pub operation: Operation,
    pub required_level: AutonomyLevel,
    pub decision: DecisionKind,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActionCommand {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NewAction {
    pub operation: Operation,
    pub summary: String,
    pub command: ActionCommand,
    pub verification: Option<ActionCommand>,
    pub rollback: Option<ActionCommand>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionStatus {
    Ready,
    WaitingApproval,
    Running,
    Succeeded,
    Failed,
    RolledBack,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct QueuedAction {
    pub id: String,
    pub operation: Operation,
    pub level: AutonomyLevel,
    pub status: ActionStatus,
    pub summary: String,
    pub command: ActionCommand,
    pub verification: Option<ActionCommand>,
    pub rollback: Option<ActionCommand>,
    pub attempts: u32,
    pub created_at: String,
    pub updated_at: String,
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActionQueue {
    pub schema_version: u32,
    pub actions: Vec<QueuedAction>,
}

impl Default for ActionQueue {
    fn default() -> Self {
        Self {
            schema_version: QUEUE_SCHEMA_VERSION,
            actions: Vec::new(),
        }
    }
}

pub fn policy_path(root: &Path) -> PathBuf {
    root.join(POLICY_RELATIVE_PATH)
}

pub fn queue_path(root: &Path) -> PathBuf {
    root.join(QUEUE_RELATIVE_PATH)
}

pub fn evaluate(policy: &AutonomyPolicy, operation: Operation) -> PolicyDecision {
    let required_level = operation.required_level();
    let (decision, reason) = if required_level == AutonomyLevel::Sovereign {
        (
            DecisionKind::HumanApprovalRequired,
            "sovereign operations are never automatic".to_string(),
        )
    } else if !policy.enabled {
        (
            DecisionKind::Disabled,
            "autonomous execution is disabled by policy".to_string(),
        )
    } else if required_level <= policy.max_automatic_level {
        (
            DecisionKind::Automatic,
            format!(
                "{} is within the configured automatic ceiling {}",
                required_level.as_str(),
                policy.max_automatic_level.as_str()
            ),
        )
    } else {
        (
            DecisionKind::HumanApprovalRequired,
            format!(
                "{} exceeds the configured automatic ceiling {}",
                required_level.as_str(),
                policy.max_automatic_level.as_str()
            ),
        )
    };
    PolicyDecision {
        operation,
        required_level,
        decision,
        reason,
    }
}

pub fn load_policy(root: &Path) -> Result<AutonomyPolicy> {
    let path = policy_path(root);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .with_context(|| format!("invalid autonomy policy {}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AutonomyPolicy::default()),
        Err(error) => Err(error).with_context(|| format!("cannot read {}", path.display())),
    }
}

pub fn save_policy(root: &Path, policy: &AutonomyPolicy) -> Result<()> {
    if policy.max_attempts == 0 {
        bail!("max_attempts must be at least 1");
    }
    if policy.max_automatic_level == AutonomyLevel::Sovereign {
        bail!("sovereign operations cannot be configured as automatic");
    }
    state::initialize(root)?;
    let _guard = yana_rt::flock_v1::acquire(POLICY_LOCK_IDENTITY, root, Duration::from_secs(10))?;
    write_private_json(&policy_path(root), policy)
}

pub fn load_queue(root: &Path) -> Result<ActionQueue> {
    let path = queue_path(root);
    let queue = match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .with_context(|| format!("invalid autonomy queue {}", path.display()))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => ActionQueue::default(),
        Err(error) => return Err(error).with_context(|| format!("cannot read {}", path.display())),
    };
    validate_queue(&queue, &path)?;
    Ok(queue)
}

pub fn enqueue(root: &Path, action: NewAction) -> Result<QueuedAction> {
    validate_new_action(&action)?;
    with_queue_lock(root, || {
        let policy = load_policy(root)?;
        let decision = evaluate(&policy, action.operation);
        let status = match decision.decision {
            DecisionKind::Automatic => ActionStatus::Ready,
            DecisionKind::HumanApprovalRequired | DecisionKind::Disabled => {
                ActionStatus::WaitingApproval
            }
        };
        let timestamp = state::now();
        let queued = QueuedAction {
            id: Uuid::new_v4().to_string(),
            operation: action.operation,
            level: decision.required_level,
            status,
            summary: action.summary.trim().to_string(),
            command: action.command,
            verification: action.verification,
            rollback: action.rollback,
            attempts: 0,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            approved_at: None,
        };
        let mut queue = load_queue(root)?;
        queue.actions.push(queued.clone());
        write_private_json(&queue_path(root), &queue)?;
        Ok(queued)
    })
}

pub fn approve(root: &Path, id: &str, approved: bool) -> Result<QueuedAction> {
    if !approved {
        bail!("approval requires --approve in this exact invocation");
    }
    mutate_action(root, id, |action| {
        if action.status != ActionStatus::WaitingApproval {
            bail!("action {} is not waiting for approval", action.id);
        }
        action.status = ActionStatus::Ready;
        action.approved_at = Some(state::now());
        Ok(())
    })
}

pub fn cancel(root: &Path, id: &str) -> Result<QueuedAction> {
    mutate_action(root, id, |action| match action.status {
        ActionStatus::Ready | ActionStatus::WaitingApproval | ActionStatus::Failed => {
            action.status = ActionStatus::Cancelled;
            Ok(())
        }
        _ => bail!(
            "action {} cannot be cancelled from its current state",
            action.id
        ),
    })
}

fn mutate_action(
    root: &Path,
    id: &str,
    operation: impl FnOnce(&mut QueuedAction) -> Result<()>,
) -> Result<QueuedAction> {
    with_queue_lock(root, || {
        let mut queue = load_queue(root)?;
        let matches: Vec<usize> = queue
            .actions
            .iter()
            .enumerate()
            .filter_map(|(index, action)| {
                (action.id == id || action.id.starts_with(id)).then_some(index)
            })
            .collect();
        let index = match matches.as_slice() {
            [] => bail!("no autonomy action matching '{id}'"),
            [index] => *index,
            _ => bail!("multiple autonomy actions match '{id}'; use a longer id"),
        };
        let action = &mut queue.actions[index];
        operation(action)?;
        action.updated_at = state::now();
        let updated = action.clone();
        write_private_json(&queue_path(root), &queue)?;
        Ok(updated)
    })
}

fn validate_new_action(action: &NewAction) -> Result<()> {
    if action.summary.trim().is_empty() {
        bail!("action summary must not be empty");
    }
    validate_command(&action.command, "command")?;
    if let Some(command) = &action.verification {
        validate_command(command, "verification command")?;
    }
    if let Some(command) = &action.rollback {
        validate_command(command, "rollback command")?;
    }
    let level = action.operation.required_level();
    if level >= AutonomyLevel::Reversible && action.verification.is_none() {
        bail!("{} actions require a verification command", level.as_str());
    }
    if action.operation == Operation::ApplyReversibleFix && action.rollback.is_none() {
        bail!("reversible fixes require a rollback command");
    }
    Ok(())
}

fn validate_command(command: &ActionCommand, label: &str) -> Result<()> {
    if command.program.trim().is_empty() {
        bail!("{label} program must not be empty");
    }
    if command.program.contains('\0') || command.args.iter().any(|arg| arg.contains('\0')) {
        bail!("{label} contains a NUL byte");
    }
    Ok(())
}

fn validate_queue(queue: &ActionQueue, path: &Path) -> Result<()> {
    if queue.schema_version != QUEUE_SCHEMA_VERSION {
        bail!(
            "unsupported autonomy queue schema {} in {}; expected {}",
            queue.schema_version,
            path.display(),
            QUEUE_SCHEMA_VERSION
        );
    }
    let mut ids = std::collections::HashSet::new();
    for action in &queue.actions {
        if !ids.insert(&action.id) {
            bail!(
                "duplicate autonomy action id '{}' in {}",
                action.id,
                path.display()
            );
        }
    }
    Ok(())
}

fn with_queue_lock<T>(root: &Path, operation: impl FnOnce() -> Result<T>) -> Result<T> {
    state::initialize(root)?;
    let _guard = yana_rt::flock_v1::acquire(QUEUE_LOCK_IDENTITY, root, Duration::from_secs(10))?;
    operation()
}

fn write_private_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let directory = path
        .parent()
        .with_context(|| format!("path has no parent: {}", path.display()))?;
    fs::create_dir_all(directory)?;
    #[cfg(unix)]
    fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            bail!("refusing to replace non-regular file: {}", path.display())
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).context("inspecting autonomy state"),
    }
    let temporary = directory.join(format!(".autonomy.{}.tmp", Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(&temporary)?;
    let result = (|| -> Result<()> {
        serde_json::to_writer_pretty(&mut file, value)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        File::open(directory)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn print_json_or_debug(value: &(impl Serialize + std::fmt::Debug), json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(value)?);
    } else {
        println!("{value:#?}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        root
    }

    fn command(program: &str) -> ActionCommand {
        ActionCommand {
            program: program.into(),
            args: Vec::new(),
        }
    }

    #[test]
    fn sovereign_operations_never_become_automatic() {
        let mut policy = AutonomyPolicy::default();
        policy.max_automatic_level = AutonomyLevel::Bounded;
        let decision = evaluate(&policy, Operation::MergeProtectedBranch);
        assert_eq!(decision.decision, DecisionKind::HumanApprovalRequired);
        assert_eq!(decision.required_level, AutonomyLevel::Sovereign);
    }

    #[test]
    fn bounded_operations_are_automatic_by_default() {
        let decision = evaluate(&AutonomyPolicy::default(), Operation::OpenDraftPullRequest);
        assert_eq!(decision.decision, DecisionKind::Automatic);
    }

    #[test]
    fn policy_rejects_sovereign_automatic_ceiling() {
        let root = root();
        let error = save_policy(
            root.path(),
            &AutonomyPolicy {
                max_automatic_level: AutonomyLevel::Sovereign,
                ..AutonomyPolicy::default()
            },
        )
        .unwrap_err();
        assert!(error
            .to_string()
            .contains("sovereign operations cannot be configured as automatic"));
    }

    #[test]
    fn reversible_fix_requires_verification_and_rollback() {
        let root = root();
        let error = enqueue(
            root.path(),
            NewAction {
                operation: Operation::ApplyReversibleFix,
                summary: "repair generated adapter".into(),
                command: command("sync-codex"),
                verification: None,
                rollback: None,
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("verification command"));
    }

    #[test]
    fn queue_round_trip_and_explicit_sovereign_approval() {
        let root = root();
        let action = enqueue(
            root.path(),
            NewAction {
                operation: Operation::PublishRelease,
                summary: "publish verified release".into(),
                command: command("release"),
                verification: Some(command("verify")),
                rollback: None,
            },
        )
        .unwrap();
        assert_eq!(action.status, ActionStatus::WaitingApproval);
        assert!(approve(root.path(), &action.id, false).is_err());
        let approved = approve(root.path(), &action.id, true).unwrap();
        assert_eq!(approved.status, ActionStatus::Ready);
        assert!(approved.approved_at.is_some());
        assert_eq!(load_queue(root.path()).unwrap().actions.len(), 1);
    }

    #[test]
    fn disabled_policy_queues_actions_for_review() {
        let root = root();
        save_policy(
            root.path(),
            &AutonomyPolicy {
                enabled: false,
                ..AutonomyPolicy::default()
            },
        )
        .unwrap();
        let action = enqueue(
            root.path(),
            NewAction {
                operation: Operation::ObserveSystem,
                summary: "sample health".into(),
                command: command("health"),
                verification: None,
                rollback: None,
            },
        )
        .unwrap();
        assert_eq!(action.status, ActionStatus::WaitingApproval);
    }
}
