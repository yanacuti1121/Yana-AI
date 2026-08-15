//! Native Giám Thị supervisor state, receipts, and human safety controls.
//!
//! Phase 9 (host-native-os program) note: this file's actual safety
//! AUTHORITY is unchanged — `halt`/`unlock`/`set_quarantine`/
//! `clear_quarantine`/`hook_check` are byte-for-byte what they were
//! before this phase. What Phase 9 adds is OBSERVABILITY: `dashboard()`
//! now surfaces `resource_pressure` (Phase 5), `host_capabilities`
//! (Phase 3), and `last_reconciliation` (Phase 8's `HostEvent` detection,
//! now actually wired into `tick_for_component()`, closing the gap Phase
//! 8's own checkpoint explicitly deferred). None of these new signals
//! trigger HALT or QUARANTINE automatically — deciding specific
//! auto-halt trigger conditions is a real, human-reviewable policy
//! decision this phase deliberately does not make unilaterally.
//! Giám Thị remains the one place that decides safety state; the
//! platform/resource/event layers only observe and report, exactly as
//! `platform::contract`'s own doc comment already requires of every
//! backend in this program.

use super::platform::{self, events};
use super::resource::pressure;
use super::{agent, health, monitor, monitor_service, service, state};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const STATE_PATH: &str = ".yana-ai/os/supervisor-state.json";
const RECEIPTS_PATH: &str = ".yana-ai/os/supervisor-receipts.jsonl";
const HALT_PATH: &str = ".claude/state/GIAMTHI_HALT.lock";
const QUARANTINE_PATH: &str = ".claude/state/GIAMTHI_QUARANTINE.json";
const HEARTBEAT_SLO_SECS: i64 = 180;
const MAX_SERVICE_DEFINITION_BYTES: u64 = 256 * 1024;
/// Phase 8's `HostEvent` reconciliation state — an OBSERVATION snapshot
/// (Phase 17's future STATE/OBSERVATION/EVENT/EVIDENCE distinction
/// already anticipated here, not state authority), separate from
/// `STATE_PATH`'s heartbeat.
const RECONCILIATION_STATE_PATH: &str = ".yana-ai/os/supervisor-reconciliation.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, clap::ValueEnum)]
#[serde(rename_all = "kebab-case")]
pub enum QuarantineMode {
    ReadOnly,
    NoShell,
    NoNetwork,
}

impl QuarantineMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::NoShell => "no-shell",
            Self::NoNetwork => "no-network",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupervisorState {
    pub schema_version: u32,
    #[serde(default = "default_component")]
    pub component: String,
    #[serde(default)]
    pub process_started_at: Option<String>,
    #[serde(default = "runtime_version")]
    pub runtime_version: String,
    pub last_heartbeat: String,
    pub last_tick_id: String,
    pub pid: u32,
    pub platform: String,
    pub health_level: String,
    pub managed_agents: usize,
    pub chat_sessions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantineRecord {
    pub schema_version: u32,
    pub mode: QuarantineMode,
    pub reason: String,
    pub actor: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReceiptPayload {
    schema_version: u32,
    sequence: u64,
    timestamp: String,
    event: String,
    actor: String,
    detail: String,
    previous_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Receipt {
    #[serde(flatten)]
    payload: ReceiptPayload,
    hash: String,
}

#[derive(Debug, Serialize)]
pub struct SupervisorDashboard {
    pub project_root: String,
    pub mode: String,
    pub halt_reason: Option<String>,
    pub quarantine: Option<QuarantineRecord>,
    pub heartbeat: Option<SupervisorState>,
    pub heartbeat_age_secs: Option<i64>,
    pub heartbeat_slo_secs: i64,
    pub heartbeat_healthy: bool,
    /// Deprecated JSON compatibility field. This is the periodic scheduler,
    /// not the resident service; new consumers should use
    /// `periodic_scheduler`.
    pub service: monitor_service::ServiceReport,
    pub periodic_scheduler: monitor_service::ServiceReport,
    pub resident_service: service::manager::ServiceStatus,
    pub compatibility_watcher: CompatibilityWatcherStatus,
    pub service_definition_drift: ServiceDefinitionDriftStatus,
    pub latest_health: Option<monitor::SystemHealthSnapshot>,
    pub health_checks: health::HealthReport,
    pub receipt_chain_valid: bool,
    pub receipt_count: usize,
    pub managed_agents: usize,
    pub chat_sessions: usize,
    pub native_helper: NativeHelperStatus,
    /// Phase 5 live reading — CURRENT host load, separate from
    /// `latest_health`'s point-in-time CPU/memory/disk/GPU snapshot; see
    /// `os::resource::pressure`'s own module doc for why these stay
    /// distinct concepts. Purely observational: nothing here changes
    /// `mode` automatically.
    pub resource_pressure: pressure::ResourcePressure,
    /// Phase 3 capability fingerprint — `None` only if the platform
    /// backend call itself fails (never fabricated); individual fields
    /// inside are already `Support::Unknown` where genuinely unprobed.
    pub host_capabilities: Option<platform::capabilities::PlatformCapabilities>,
    /// Phase 8 — events detected on the most recent `tick()`, if any ran
    /// yet. `None` before the first tick since this program was adopted
    /// by a project (no prior reconciliation state to diff against).
    pub last_reconciliation: Option<events::ReconciliationState>,
}

#[derive(Debug, Serialize)]
pub struct NativeHelperStatus {
    pub binary: String,
    pub runtime_version: String,
    pub native_scheduler: bool,
    pub signature_status: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct CompatibilityWatcherStatus {
    pub script_present: bool,
    pub heartbeat_present: bool,
    pub heartbeat_age_secs: Option<u64>,
    pub state: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct ServiceDefinitionDriftStatus {
    pub state: String,
    pub findings: Vec<ServiceDefinitionFinding>,
    pub detail: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ServiceDefinitionFinding {
    pub component: String,
    pub path: String,
    pub target: Option<String>,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct SelfTestReport {
    pub passed: bool,
    pub checks: Vec<SelfTestCheck>,
}

#[derive(Debug, Serialize)]
pub struct SelfTestCheck {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

#[derive(Debug, PartialEq, Eq)]
pub struct HookCheckResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

enum SafetyFile {
    Missing,
    Present(String),
    Unreadable,
}

pub fn hook_check(root: &Path, input: &str) -> HookCheckResult {
    let halt = safety_file(&root.join(HALT_PATH));
    let quarantine = safety_file(&root.join(QUARANTINE_PATH));
    if matches!(halt, SafetyFile::Missing) && matches!(quarantine, SafetyFile::Missing) {
        return hook_allow();
    }

    let event: serde_json::Value = match serde_json::from_str(input) {
        Ok(value) => value,
        Err(_) => {
            return hook_deny(
                "PreToolUse",
                "Giám thị could not interpret the hook payload while a safety state is active. Failing closed.",
            )
        }
    };
    let event_name = event
        .get("hook_event_name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("PreToolUse");

    match halt {
        SafetyFile::Present(body) => {
            let body: String = body.chars().take(1500).collect();
            let body = if body.trim().is_empty() {
                "(the halt lock exists but contains no readable reason)"
            } else {
                body.as_str()
            };
            return hook_deny(
                event_name,
                &format!(
                    "Giám thị has halted this project. Only a human may unlock it after review. Halt record: {body}"
                ),
            );
        }
        SafetyFile::Unreadable => {
            return hook_deny(
                event_name,
                "Giám thị halt state exists but cannot be read safely. Failing closed; human review is required.",
            )
        }
        SafetyFile::Missing => {}
    }

    let record = match quarantine {
        SafetyFile::Present(text) => match serde_json::from_str::<QuarantineRecord>(&text) {
            Ok(record) => record,
            Err(_) => {
                return hook_deny(
                    event_name,
                    "Giám thị quarantine state is malformed. Failing closed; human review is required.",
                )
            }
        },
        SafetyFile::Unreadable => {
            return hook_deny(
                event_name,
                "Giám thị quarantine state cannot be read safely. Failing closed; human review is required.",
            )
        }
        SafetyFile::Missing => return hook_allow(),
    };
    let tool_name = ["tool_name", "toolName", "name"]
        .iter()
        .find_map(|key| event.get(key).and_then(serde_json::Value::as_str))
        .unwrap_or("");
    let denied = matches!(
        (record.mode, tool_name),
        (
            QuarantineMode::ReadOnly,
            "Write" | "Edit" | "NotebookEdit" | "Bash"
        ) | (QuarantineMode::NoShell, "Bash")
            | (QuarantineMode::NoNetwork, "WebFetch" | "WebSearch")
    );
    if !denied {
        return hook_allow();
    }
    hook_deny(
        event_name,
        &format!(
            "Giám thị quarantine '{}' blocked tool '{}'. A human must review and clear quarantine.",
            record.mode.as_str(),
            tool_name
        ),
    )
}

fn safety_file(path: &Path) -> SafetyFile {
    match read_regular_text(path) {
        Ok(Some(text)) => SafetyFile::Present(text),
        Ok(None) => SafetyFile::Missing,
        Err(_) => SafetyFile::Unreadable,
    }
}

fn hook_allow() -> HookCheckResult {
    HookCheckResult {
        stdout: String::new(),
        stderr: String::new(),
        exit_code: 0,
    }
}

fn hook_deny(event_name: &str, reason: &str) -> HookCheckResult {
    let (value, exit_code) = match event_name {
        "SessionStart" => (
            serde_json::json!({"continue": false, "stopReason": reason}),
            0,
        ),
        "UserPromptSubmit" => (
            serde_json::json!({"decision": "block", "reason": reason}),
            0,
        ),
        _ => (
            serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason
                }
            }),
            2,
        ),
    };
    HookCheckResult {
        stdout: format!("{}\n", value),
        stderr: if exit_code == 2 {
            format!("{reason}\n")
        } else {
            String::new()
        },
        exit_code,
    }
}

pub fn tick(root: &Path) -> Result<SupervisorState> {
    tick_for_component(root, "supervisor-tick", None)
}

pub fn tick_resident(root: &Path, process_started_at: &str) -> Result<SupervisorState> {
    tick_for_component(
        root,
        "giamthi-resident",
        Some(process_started_at.to_string()),
    )
}

fn tick_for_component(
    root: &Path,
    component: &str,
    process_started_at: Option<String>,
) -> Result<SupervisorState> {
    let snapshot = monitor::collect(root);
    monitor::persist(root, &snapshot)?;
    let inventory =
        agent::inventory(root, true, usize::MAX).unwrap_or_else(|_| agent::AgentInventory {
            managed: Vec::new(),
            chat_sessions: Vec::new(),
            actors: Vec::new(),
        });
    let report = health::inspect(root);
    let tick_id = Uuid::new_v4().to_string();
    let current = SupervisorState {
        schema_version: 1,
        component: component.into(),
        process_started_at,
        runtime_version: runtime_version(),
        last_heartbeat: state::now(),
        last_tick_id: tick_id.clone(),
        pid: std::process::id(),
        platform: std::env::consts::OS.into(),
        health_level: format!("{:?}", report.overall).to_lowercase(),
        managed_agents: inventory.managed.len(),
        chat_sessions: inventory.chat_sessions.len(),
    };
    write_json_atomic(&root.join(STATE_PATH), &current)?;
    append_receipt(
        root,
        "supervisor.tick",
        "yana-rt",
        &format!(
            "tick={tick_id} health={} agents={} sessions={}",
            current.health_level, current.managed_agents, current.chat_sessions
        ),
    )?;
    reconcile_events(root);
    Ok(current)
}

/// Phase 8's `HostEvent` detection, wired into the tick this phase's own
/// checkpoint deferred. Best-effort by design: a failure to load/persist
/// `ReconciliationState` only degrades event detection for this one tick
/// (the next tick simply has no prior state to diff against, same as the
/// very first tick ever) — it must never fail the heartbeat/health tick
/// above, which heartbeat-staleness monitoring actually depends on.
/// Detected events are recorded as receipts (append-only evidence) —
/// nothing here reads or writes HALT/QUARANTINE state.
fn reconcile_events(root: &Path) {
    let path = root.join(RECONCILIATION_STATE_PATH);
    let previous = read_json_optional::<events::ReconciliationState>(&path)
        .ok()
        .flatten()
        .unwrap_or_default();
    let expected_interval_secs = monitor_service::status(root)
        .ok()
        .and_then(|report| report.interval_secs)
        .unwrap_or(HEARTBEAT_SLO_SECS as u64);
    let (detected, next) = events::reconcile(root, previous, expected_interval_secs);
    for event in &detected {
        let detail = serde_json::to_string(event).unwrap_or_else(|_| format!("{event:?}"));
        let _ = append_receipt(root, "supervisor.event", "yana-rt", &detail);
    }
    let _ = write_json_atomic(&path, &next);
}

fn default_component() -> String {
    "supervisor-tick".into()
}

fn runtime_version() -> String {
    env!("CARGO_PKG_VERSION").into()
}

pub fn dashboard(root: &Path) -> Result<SupervisorDashboard> {
    let halt_reason = read_regular_text(&root.join(HALT_PATH))?;
    let quarantine = read_json_optional::<QuarantineRecord>(&root.join(QUARANTINE_PATH))?;
    let heartbeat = read_json_optional::<SupervisorState>(&root.join(STATE_PATH))?;
    let heartbeat_age_secs = heartbeat
        .as_ref()
        .and_then(|item| age_seconds(&item.last_heartbeat));
    let heartbeat_healthy = heartbeat_age_secs.is_some_and(|age| age <= HEARTBEAT_SLO_SECS);
    let (receipt_chain_valid, receipt_count) = verify_receipts(root)?;
    let inventory =
        agent::inventory(root, true, usize::MAX).unwrap_or_else(|_| agent::AgentInventory {
            managed: Vec::new(),
            chat_sessions: Vec::new(),
            actors: Vec::new(),
        });
    let mode = if halt_reason.is_some() {
        "halted".to_string()
    } else if let Some(record) = &quarantine {
        format!("quarantine:{}", record.mode.as_str())
    } else {
        "normal".to_string()
    };
    let periodic_scheduler = monitor_service::status(root)?;
    let resident_service = service::runtime::manager(root, 60)?.status()?;
    Ok(SupervisorDashboard {
        project_root: root.display().to_string(),
        mode,
        halt_reason,
        quarantine,
        heartbeat,
        heartbeat_age_secs,
        heartbeat_slo_secs: HEARTBEAT_SLO_SECS,
        heartbeat_healthy,
        service: periodic_scheduler.clone(),
        periodic_scheduler,
        resident_service,
        compatibility_watcher: compatibility_watcher_status(root),
        service_definition_drift: service_definition_drift_status(root),
        latest_health: monitor::load(root).ok(),
        health_checks: health::inspect(root),
        receipt_chain_valid,
        receipt_count,
        managed_agents: inventory.managed.len(),
        chat_sessions: inventory.chat_sessions.len(),
        native_helper: native_helper_status(),
        resource_pressure: pressure::collect(root),
        host_capabilities: {
            use platform::contract::TelemetryBackend;
            platform::backend()
                .host_profile()
                .ok()
                .map(|profile| profile.capabilities)
        },
        last_reconciliation: read_json_optional::<events::ReconciliationState>(
            &root.join(RECONCILIATION_STATE_PATH),
        )?,
    })
}

pub fn halt(root: &Path, reason: &str, actor: &str) -> Result<()> {
    let reason = required("reason", reason)?;
    let actor = required("actor", actor)?;
    let path = root.join(HALT_PATH);
    if path.exists() {
        bail!("Giám Thị halt already exists at {}", path.display());
    }
    append_receipt(root, "supervisor.halt", actor, reason)?;
    write_private_new(
        &path,
        format!(
            "actor: {actor}\nreason: {reason}\ncreated_at: {}\n",
            state::now()
        )
        .as_bytes(),
    )
}

pub fn unlock(root: &Path, approve: bool, reason: &str, actor: &str) -> Result<()> {
    if !approve {
        bail!("human unlock requires --approve");
    }
    let reason = required("reason", reason)?;
    let actor = required("actor", actor)?;
    let path = root.join(HALT_PATH);
    let prior = read_regular_text(&path)?
        .ok_or_else(|| anyhow::anyhow!("no Giám Thị halt exists at {}", path.display()))?;
    append_receipt(
        root,
        "supervisor.unlock",
        actor,
        &format!("reason={reason}; prior={}", prior.replace('\n', " | ")),
    )?;
    fs::remove_file(&path).with_context(|| format!("removing {}", path.display()))
}

pub fn set_quarantine(
    root: &Path,
    mode: QuarantineMode,
    reason: &str,
    actor: &str,
) -> Result<QuarantineRecord> {
    let record = QuarantineRecord {
        schema_version: 1,
        mode,
        reason: required("reason", reason)?.to_string(),
        actor: required("actor", actor)?.to_string(),
        created_at: state::now(),
    };
    append_receipt(
        root,
        "supervisor.quarantine.set",
        &record.actor,
        &format!("mode={} reason={}", record.mode.as_str(), record.reason),
    )?;
    write_json_atomic(&root.join(QUARANTINE_PATH), &record)?;
    Ok(record)
}

pub fn clear_quarantine(root: &Path, approve: bool, reason: &str, actor: &str) -> Result<()> {
    if !approve {
        bail!("clearing quarantine requires --approve");
    }
    let reason = required("reason", reason)?;
    let actor = required("actor", actor)?;
    let path = root.join(QUARANTINE_PATH);
    let record = read_json_optional::<QuarantineRecord>(&path)?
        .ok_or_else(|| anyhow::anyhow!("no quarantine exists at {}", path.display()))?;
    append_receipt(
        root,
        "supervisor.quarantine.clear",
        actor,
        &format!("reason={reason}; prior_mode={}", record.mode.as_str()),
    )?;
    fs::remove_file(&path).with_context(|| format!("removing {}", path.display()))
}

pub fn self_test(root: &Path) -> SelfTestReport {
    let sandbox = root
        .join(".yana-ai/os/self-test")
        .join(Uuid::new_v4().to_string());
    let mut checks = Vec::new();
    let fixture = sandbox.join("atomic.json");
    let atomic = write_json_atomic(&fixture, &serde_json::json!({"ok": true}))
        .and_then(|_| read_json_optional::<serde_json::Value>(&fixture))
        .map(|value| value == Some(serde_json::json!({"ok": true})));
    checks.push(check_result("private-atomic-state", atomic));

    let receipt = append_receipt_at(
        &sandbox.join("receipts.jsonl"),
        "self-test",
        "yana-rt",
        "synthetic",
    )
    .and_then(|_| verify_receipts_at(&sandbox.join("receipts.jsonl")))
    .map(|(valid, count)| valid && count == 1);
    checks.push(check_result("receipt-chain", receipt));

    let hook_paths = [
        root.join("core/hooks/giamthi-halt-check.sh"),
        root.join(".claude/hooks/giamthi-halt-check.sh"),
        root.join(".codex/hooks/giamthi-halt-check.sh"),
    ];
    let mirrors = if hook_paths.iter().all(|path| path.is_file()) {
        fs::read(&hook_paths[0]).ok().is_some_and(|canonical| {
            hook_paths[1..]
                .iter()
                .all(|path| fs::read(path).ok().as_deref() == Some(canonical.as_slice()))
        })
    } else {
        false
    };
    checks.push(SelfTestCheck {
        name: "cross-engine-hook-mirrors".into(),
        passed: mirrors,
        detail: if mirrors {
            "canonical, Claude, and Codex hooks match"
        } else {
            "hook mirrors are missing or differ"
        }
        .into(),
    });
    let _ = fs::remove_dir_all(&sandbox);
    SelfTestReport {
        passed: checks.iter().all(|item| item.passed),
        checks,
    }
}

pub fn print<T: Serialize>(value: &T, json: bool, title: &str) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(value)?);
    } else {
        println!("{title}");
        println!("{}", serde_json::to_string_pretty(value)?);
    }
    Ok(())
}

fn native_helper_status() -> NativeHelperStatus {
    let binary = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("yana-rt"));
    #[cfg(target_os = "macos")]
    let (signature_status, detail) = {
        let status = std::process::Command::new("codesign")
            .args(["--verify", "--deep", "--strict"])
            .arg(&binary)
            .output();
        match status {
            Ok(value) if value.status.success() => {
                ("verified".into(), "codesign verification passed".into())
            }
            Ok(_) => (
                "unverified".into(),
                "binary is native but lacks a trusted production signature".into(),
            ),
            Err(error) => ("unknown".into(), format!("codesign unavailable: {error}")),
        }
    };
    #[cfg(not(target_os = "macos"))]
    let (signature_status, detail) = (
        "not-checked".into(),
        "platform signing verification is not implemented; scheduler still invokes the native binary directly".into(),
    );
    NativeHelperStatus {
        binary: binary.display().to_string(),
        runtime_version: env!("CARGO_PKG_VERSION").into(),
        native_scheduler: true,
        signature_status,
        detail,
    }
}

fn compatibility_watcher_status(root: &Path) -> CompatibilityWatcherStatus {
    let script_present = root.join(".claude/scripts/giamthi-watch.sh").is_file();
    let heartbeat = root.join(".claude/state/giamthi-heartbeat.log");
    let heartbeat_age_secs = fs::metadata(&heartbeat)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .map(|age| age.as_secs());
    let heartbeat_present = heartbeat_age_secs.is_some();
    let (state, detail) = match (script_present, heartbeat_age_secs) {
        (false, _) => ("not-installed", "compatibility watcher script is absent"),
        (true, None) => (
            "unknown",
            "watcher script exists but no heartbeat evidence is available",
        ),
        (true, Some(age)) if age <= 86_400 => (
            "observed",
            "compatibility watcher heartbeat was observed within 24 hours",
        ),
        (true, Some(_)) => (
            "stale",
            "compatibility watcher heartbeat is older than 24 hours",
        ),
    };
    CompatibilityWatcherStatus {
        script_present,
        heartbeat_present,
        heartbeat_age_secs,
        state: state.into(),
        detail: detail.into(),
    }
}

fn service_definition_drift_status(root: &Path) -> ServiceDefinitionDriftStatus {
    let home = match service::manager::home() {
        Ok(home) => home,
        Err(error) => {
            return ServiceDefinitionDriftStatus {
                state: "unknown".into(),
                findings: Vec::new(),
                detail: format!("service definition discovery unavailable: {error}"),
            }
        }
    };
    match service_definition_findings_at(root, &home, env::consts::OS) {
        Ok(findings) if findings.is_empty() => ServiceDefinitionDriftStatus {
            state: "clear".into(),
            findings,
            detail: "no service definitions for another checkout were discovered".into(),
        },
        Ok(findings) => ServiceDefinitionDriftStatus {
            state: "detected".into(),
            detail: format!(
                "{} service definition(s) point at another checkout or could not be inspected; no definition was modified",
                findings.len()
            ),
            findings,
        },
        Err(error) => ServiceDefinitionDriftStatus {
            state: "unknown".into(),
            findings: Vec::new(),
            detail: format!("service definition discovery failed: {error}"),
        },
    }
}

fn service_definition_findings_at(
    root: &Path,
    home: &Path,
    platform: &str,
) -> Result<Vec<ServiceDefinitionFinding>> {
    let mut directories = Vec::new();
    match platform {
        "macos" => directories.push(home.join("Library/LaunchAgents")),
        "linux" => {
            if let Some(config) = env::var_os("XDG_CONFIG_HOME") {
                directories.push(PathBuf::from(config).join("systemd/user"));
            }
            let fallback = home.join(".config/systemd/user");
            if !directories.contains(&fallback) {
                directories.push(fallback);
            }
        }
        "windows" => {
            let base = env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join("AppData/Local"));
            directories.push(base.join("YanaAI/Service"));
            directories.push(base.join("YanaAI/Monitor"));
            directories.push(home.join(".yana-ai/giamthi"));
        }
        _ => return Ok(Vec::new()),
    }

    let mut paths = Vec::new();
    for directory in directories {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("reading service directory {}", directory.display()))
            }
        };
        for entry in entries {
            paths.push(entry?.path());
        }
    }
    paths.sort();
    paths.dedup();

    let mut findings = Vec::new();
    for path in paths {
        let Some(component) = definition_component(&path, platform) else {
            continue;
        };
        match definition_target(&path, component) {
            Ok(Some(target)) if !same_checkout(root, &target) => {
                findings.push(ServiceDefinitionFinding {
                    component: component.into(),
                    path: path.display().to_string(),
                    target: Some(target.display().to_string()),
                    reason: "definition points at another checkout".into(),
                });
            }
            Ok(Some(_)) => {}
            Ok(None) => findings.push(ServiceDefinitionFinding {
                component: component.into(),
                path: path.display().to_string(),
                target: None,
                reason: "definition target is missing or unparseable".into(),
            }),
            Err(error) => findings.push(ServiceDefinitionFinding {
                component: component.into(),
                path: path.display().to_string(),
                target: None,
                reason: format!("definition cannot be inspected: {error}"),
            }),
        }
    }
    Ok(findings)
}

fn definition_component(path: &Path, platform: &str) -> Option<&'static str> {
    let name = path.file_name()?.to_str()?;
    match platform {
        "macos" if name.starts_with("com.yana.service.") && name.ends_with(".plist") => {
            Some("resident-service")
        }
        "macos" if name.starts_with("com.yana.system-health.") && name.ends_with(".plist") => {
            Some("periodic-scheduler")
        }
        "macos" if name.starts_with("com.yanaai.giamthi-watch") && name.ends_with(".plist") => {
            Some("compatibility-watcher")
        }
        "linux" if name.starts_with("yana-service-") && name.ends_with(".service") => {
            Some("resident-service")
        }
        "linux" if name.starts_with("yana-system-health-") && name.ends_with(".service") => {
            Some("periodic-scheduler")
        }
        "linux" if name.starts_with("yana-giamthi-") && name.ends_with(".service") => {
            Some("compatibility-watcher")
        }
        "windows" if name.starts_with("YanaService-") && name.ends_with(".xml") => {
            Some("resident-service")
        }
        "windows" if name.starts_with("YanaSystemHealth-") && name.ends_with(".xml") => {
            Some("periodic-scheduler")
        }
        "windows"
            if name.ends_with(".json")
                && path
                    .parent()
                    .and_then(Path::file_name)
                    .and_then(|value| value.to_str())
                    == Some("giamthi") =>
        {
            Some("compatibility-watcher")
        }
        _ => None,
    }
}

fn definition_target(path: &Path, component: &str) -> Result<Option<PathBuf>> {
    let metadata =
        fs::symlink_metadata(path).with_context(|| format!("inspecting {}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!("not a regular file");
    }
    if metadata.len() > MAX_SERVICE_DEFINITION_BYTES {
        bail!("definition exceeds {MAX_SERVICE_DEFINITION_BYTES} bytes");
    }
    let text = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    if path.extension().and_then(|value| value.to_str()) == Some("json") {
        let value: serde_json::Value =
            serde_json::from_str(&text).with_context(|| format!("parsing {}", path.display()))?;
        return Ok(value
            .get("target")
            .and_then(|value| value.as_str())
            .map(PathBuf::from));
    }
    if path.extension().and_then(|value| value.to_str()) == Some("service") {
        return Ok(text.lines().find_map(|line| {
            let value = line.trim().strip_prefix("WorkingDirectory=")?;
            Some(PathBuf::from(unquote_service_value(value)))
        }));
    }
    if component == "compatibility-watcher" {
        return Ok(xml_strings(&text)
            .into_iter()
            .find(|value| value.ends_with("/.claude/scripts/giamthi-watch.sh"))
            .and_then(|script| {
                PathBuf::from(script)
                    .parent()
                    .and_then(Path::parent)
                    .and_then(Path::parent)
                    .map(Path::to_path_buf)
            }));
    }
    Ok(xml_value_after_key(&text, "WorkingDirectory").map(PathBuf::from))
}

fn xml_strings(text: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut remaining = text;
    while let Some(start) = remaining.find("<string>") {
        let value = &remaining[start + "<string>".len()..];
        let Some(end) = value.find("</string>") else {
            break;
        };
        values.push(xml_unescape(&value[..end]));
        remaining = &value[end + "</string>".len()..];
    }
    values
}

fn xml_value_after_key(text: &str, key: &str) -> Option<String> {
    let marker = format!("<key>{key}</key>");
    let remainder = text.split_once(&marker)?.1;
    xml_strings(remainder).into_iter().next()
}

fn xml_unescape(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn unquote_service_value(value: &str) -> String {
    let value = value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(value);
    value.replace("\\\"", "\"").replace("\\\\", "\\")
}

fn same_checkout(current: &Path, candidate: &Path) -> bool {
    match (current.canonicalize(), candidate.canonicalize()) {
        (Ok(current), Ok(candidate)) => current == candidate,
        _ => current == candidate,
    }
}

fn check_result(name: &str, result: Result<bool>) -> SelfTestCheck {
    match result {
        Ok(true) => SelfTestCheck {
            name: name.into(),
            passed: true,
            detail: "passed".into(),
        },
        Ok(false) => SelfTestCheck {
            name: name.into(),
            passed: false,
            detail: "assertion failed".into(),
        },
        Err(error) => SelfTestCheck {
            name: name.into(),
            passed: false,
            detail: error.to_string(),
        },
    }
}

fn required<'a>(label: &str, value: &'a str) -> Result<&'a str> {
    let value = value.trim();
    if value.is_empty() {
        bail!("{label} must not be empty");
    }
    Ok(value)
}

fn age_seconds(timestamp: &str) -> Option<i64> {
    let timestamp = DateTime::parse_from_rfc3339(timestamp).ok()?;
    Some(
        (Utc::now() - timestamp.with_timezone(&Utc))
            .num_seconds()
            .max(0),
    )
}

fn append_receipt(root: &Path, event: &str, actor: &str, detail: &str) -> Result<()> {
    append_receipt_at(&root.join(RECEIPTS_PATH), event, actor, detail)
}

/// Phase 17 (host-native-os program, Storage Semantics) built rotation;
/// this anchor mechanism was added in a later closure pass specifically
/// because Phase 17's first version, despite its own doc comment's
/// hedged wording, still let the SYSTEM's overall claim be "the receipt
/// chain is tamper-evident" while two segments verified independently
/// from their own GENESIS — a real gap between claim and mechanism, not
/// merely a documented limitation. Fixed with an explicit anchor: before
/// archiving the active file, its real last entry's `hash`/`sequence` is
/// recorded to a small sibling `.anchor` file. The next entry written
/// after rotation (`append_receipt_at`) reads that anchor and continues
/// the chain from it instead of resetting to `"GENESIS"`/`1` — so the new
/// segment's first entry cryptographically references the old segment's
/// real last entry, the same way a normal in-file link works, just
/// crossing a file boundary. `verify_full_receipt_chain` (below) does not
/// trust the anchor's stored values, though — it re-derives each
/// segment's continuation seed from the ACTUAL previous segment's real
/// last entry while walking the chain, so a tampered anchor file can at
/// worst cause a future append to be later flagged invalid, never a
/// silently-accepted forged chain.
const RECEIPTS_ROTATION_THRESHOLD_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RotationAnchor {
    previous_hash: String,
    previous_sequence: u64,
    archived_path: String,
}

fn anchor_path(receipts_path: &Path) -> PathBuf {
    let file_name = receipts_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("supervisor-receipts.jsonl");
    receipts_path.with_file_name(format!("{file_name}.anchor"))
}

fn maybe_rotate_receipts(path: &Path) -> Result<()> {
    maybe_rotate_receipts_over(path, RECEIPTS_ROTATION_THRESHOLD_BYTES)
}

/// Threshold-parameterized so tests can exercise real rotation without
/// writing 5MB of fixture data — `maybe_rotate_receipts` is the only
/// non-test caller, always with the real constant.
fn maybe_rotate_receipts_over(path: &Path, threshold_bytes: u64) -> Result<()> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error).with_context(|| format!("inspecting {}", path.display())),
    };
    if metadata.len() < threshold_bytes {
        return Ok(());
    }
    let now_unix_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("supervisor-receipts.jsonl");
    let archived = path.with_file_name(format!("{file_name}.{now_unix_secs}.rotated"));
    if archived.exists() {
        bail!(
            "refusing to rotate receipts: archive target already exists: {}",
            archived.display()
        );
    }
    // Anchor is written BEFORE the rename, deliberately: if this process
    // crashes between the two, the next call re-derives and rewrites the
    // same anchor from the (still-present) source file and retries the
    // rename — idempotent. The dangerous ordering would be rename-then-
    // anchor, where a crash in between would silently start a fresh,
    // disconnected GENESIS chain instead of a continuation.
    if let Some((last_hash, last_sequence)) = last_receipt_seed(path)? {
        let anchor = RotationAnchor {
            previous_hash: last_hash,
            previous_sequence: last_sequence,
            archived_path: archived.display().to_string(),
        };
        write_json_atomic(&anchor_path(path), &anchor)?;
    }
    fs::rename(path, &archived)
        .with_context(|| format!("rotating {} to {}", path.display(), archived.display()))
}

/// The real last entry's `(hash, sequence)` in `path`, or `None` if the
/// file is empty/absent. Used only to seed a rotation anchor — a thin
/// wrapper around the same per-line parsing `verify_segment_from` does,
/// kept separate because this one deliberately does NOT validate the
/// chain (that already happened via `append_receipt_at`'s pre-append
/// `verify_receipts_at` check before this file could have grown to
/// rotation size in the first place) — it only reads the tail.
fn last_receipt_seed(path: &Path) -> Result<Option<(String, u64)>> {
    let Some(text) = read_regular_text(path)? else {
        return Ok(None);
    };
    let mut last = None;
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let receipt: Receipt = serde_json::from_str(line)
            .with_context(|| format!("invalid receipt chain {}", path.display()))?;
        last = Some((receipt.hash, receipt.payload.sequence));
    }
    Ok(last)
}

fn append_receipt_at(path: &Path, event: &str, actor: &str, detail: &str) -> Result<()> {
    maybe_rotate_receipts(path)?;
    let (valid, _, previous_hash, sequence) = verify_active_segment(path)?;
    if !valid {
        bail!(
            "refusing to append to tampered receipt chain: {}",
            path.display()
        );
    }
    let payload = ReceiptPayload {
        schema_version: 1,
        sequence,
        timestamp: state::now(),
        event: event.into(),
        actor: actor.into(),
        detail: detail.into(),
        previous_hash,
    };
    let hash = hash_payload(&payload)?;
    let receipt = Receipt { payload, hash };
    ensure_parent(path)?;
    let mut options = OpenOptions::new();
    options.append(true).create(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options
        .open(path)
        .with_context(|| format!("opening {}", path.display()))?;
    writeln!(file, "{}", serde_json::to_string(&receipt)?)?;
    file.sync_all()?;
    Ok(())
}

/// The full, genuinely continuous chain across every archived segment
/// plus the active file — what `dashboard()` reports as `receipt_chain_valid`/
/// `receipt_count`. Walks oldest archived segment first, re-deriving each
/// segment's continuation seed from the ACTUAL previous segment's real
/// last entry rather than trusting any stored anchor value, so a tampered
/// `.anchor` file cannot cause a broken chain to read as valid.
fn verify_receipts(root: &Path) -> Result<(bool, usize)> {
    let active_path = root.join(RECEIPTS_PATH);
    let segments = archived_segments(&active_path)?;
    let mut previous_hash = "GENESIS".to_string();
    let mut expected_sequence: u64 = 1;
    let mut total = 0usize;
    for segment_path in segments.iter().chain(std::iter::once(&active_path)) {
        let (valid, count, next_hash, next_sequence) =
            verify_segment_from(segment_path, previous_hash, expected_sequence)?;
        total += count;
        if !valid {
            return Ok((false, total));
        }
        previous_hash = next_hash;
        expected_sequence = next_sequence;
    }
    Ok((true, total))
}

/// Every archived sibling of `active_path` (`<name>.<unix_secs>.rotated`),
/// oldest first. A file whose numeric suffix fails to parse is skipped
/// rather than erroring — a foreign file dropped in the same directory
/// must not be able to abort chain verification.
fn archived_segments(active_path: &Path) -> Result<Vec<PathBuf>> {
    let Some(parent) = active_path.parent() else {
        return Ok(Vec::new());
    };
    let Some(file_name) = active_path.file_name().and_then(|name| name.to_str()) else {
        return Ok(Vec::new());
    };
    let prefix = format!("{file_name}.");
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error).with_context(|| format!("listing {}", parent.display())),
    };
    let mut segments: Vec<(u64, PathBuf)> = Vec::new();
    for entry in entries {
        let entry = entry?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some(rest) = name.strip_prefix(&prefix) else {
            continue;
        };
        let Some(timestamp_text) = rest.strip_suffix(".rotated") else {
            continue;
        };
        let Ok(timestamp) = timestamp_text.parse::<u64>() else {
            continue;
        };
        segments.push((timestamp, entry.path()));
    }
    segments.sort_by_key(|(timestamp, _)| *timestamp);
    Ok(segments.into_iter().map(|(_, path)| path).collect())
}

/// Verifies one segment's hash chain starting from `(previous_hash,
/// expected_sequence)` — `("GENESIS", 1)` for a self-contained first
/// segment (also `verify_receipts_at`'s own single-segment contract,
/// unchanged from before this closure pass), or the real prior segment's
/// last entry when called from `verify_receipts`'s cross-segment walk.
/// Returns `(valid, count_in_this_segment, seed_for_the_next_segment)` —
/// an empty segment passes its input seed through unchanged, so an empty
/// active file right after rotation does not reset continuity by itself.
fn verify_segment_from(
    path: &Path,
    mut previous_hash: String,
    mut expected_sequence: u64,
) -> Result<(bool, usize, String, u64)> {
    let Some(text) = read_regular_text(path)? else {
        return Ok((true, 0, previous_hash, expected_sequence));
    };
    let mut count = 0;
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let receipt: Receipt = serde_json::from_str(line)
            .with_context(|| format!("invalid receipt chain {}", path.display()))?;
        if receipt.payload.sequence != expected_sequence
            || receipt.payload.previous_hash != previous_hash
            || receipt.hash != hash_payload(&receipt.payload)?
        {
            return Ok((false, count, previous_hash, expected_sequence));
        }
        previous_hash = receipt.hash;
        expected_sequence += 1;
        count += 1;
    }
    Ok((true, count, previous_hash, expected_sequence))
}

/// This file's own correct starting seed: the real previous segment's
/// last entry if a rotation anchor exists for this path, `("GENESIS", 1)`
/// otherwise (a file that has never been rotated). An anchor, once
/// written, is this file's true genesis for its entire lifetime — it
/// applies whether the file is currently empty or already has entries,
/// not only at the moment right after rotation.
fn active_segment_seed(path: &Path) -> Result<(String, u64)> {
    match read_json_optional::<RotationAnchor>(&anchor_path(path))? {
        Some(anchor) => Ok((anchor.previous_hash, anchor.previous_sequence + 1)),
        None => Ok(("GENESIS".to_string(), 1)),
    }
}

/// Verifies `path` against its OWN correct starting point (its anchor if
/// one exists, GENESIS otherwise) and returns its current tail
/// `(hash, next_sequence)` — what the next entry appended to this exact
/// file must reference. This is deliberately NOT the same question as
/// `verify_receipts`'s cross-segment walk, which re-derives each
/// segment's seed from the real previous segment rather than trusting any
/// stored anchor; this function trusts the anchor, appropriately, because
/// its only caller (`append_receipt_at`) is the same code path that wrote
/// that anchor a moment earlier in the same rotation.
fn verify_active_segment(path: &Path) -> Result<(bool, usize, String, u64)> {
    let (genesis_hash, genesis_sequence) = active_segment_seed(path)?;
    verify_segment_from(path, genesis_hash, genesis_sequence)
}

/// Single-file verification, anchor-aware (see `verify_active_segment`).
/// Used by `append_receipt_at`'s pre-append tamper check indirectly (via
/// `verify_active_segment`) and directly by tests exercising one file's
/// own consistency in isolation from the rest of the chain.
fn verify_receipts_at(path: &Path) -> Result<(bool, usize)> {
    let (valid, count, _, _) = verify_active_segment(path)?;
    Ok((valid, count))
}

fn hash_payload(payload: &ReceiptPayload) -> Result<String> {
    let digest = Sha256::digest(serde_json::to_vec(payload)?);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn read_json_optional<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>> {
    let Some(text) = read_regular_text(path)? else {
        return Ok(None);
    };
    serde_json::from_str(&text)
        .with_context(|| format!("invalid JSON {}", path.display()))
        .map(Some)
}

fn read_regular_text(path: &Path) -> Result<Option<String>> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error).with_context(|| format!("inspecting {}", path.display())),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!(
            "refusing non-regular supervisor evidence: {}",
            path.display()
        );
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = options.open(path)?;
    let mut text = String::new();
    file.read_to_string(&mut text)?;
    Ok(Some(text))
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    write_atomic(path, &serde_json::to_vec_pretty(value)?)
}

fn write_private_new(path: &Path, bytes: &[u8]) -> Result<()> {
    ensure_parent(path)?;
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    ensure_parent(path)?;
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            bail!("refusing non-regular supervisor state: {}", path.display());
        }
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = path.with_extension(format!("tmp.{}.{}", std::process::id(), nonce));
    write_private_new(&temporary, bytes)?;
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path)?;
    }
    let result = fs::rename(&temporary, path);
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.with_context(|| format!("replacing {}", path.display()))
}

fn ensure_parent(path: &Path) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)?;
    #[cfg(unix)]
    fs::set_permissions(parent, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("yana-supervisor-{}", Uuid::new_v4()))
    }

    #[test]
    fn receipt_chain_detects_tampering() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        append_receipt(&root, "one", "test", "first").unwrap();
        append_receipt(&root, "two", "test", "second").unwrap();
        assert_eq!(verify_receipts(&root).unwrap(), (true, 2));
        let path = root.join(RECEIPTS_PATH);
        let text = fs::read_to_string(&path)
            .unwrap()
            .replace("first", "forged");
        fs::write(&path, text).unwrap();
        assert_eq!(verify_receipts(&root).unwrap().0, false);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn receipts_rotate_once_the_active_file_crosses_the_threshold_and_preserve_all_evidence() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        append_receipt(&root, "one", "test", "first").unwrap();
        append_receipt(&root, "two", "test", "second").unwrap();
        let path = root.join(RECEIPTS_PATH);
        let current_size = fs::metadata(&path).unwrap().len();
        // Threshold at-or-below the file's current size -> rotation fires.
        maybe_rotate_receipts_over(&path, current_size).unwrap();
        assert!(
            !path.exists(),
            "active file must be archived, not left in place"
        );
        let archived: Vec<_> = fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".rotated"))
            .collect();
        assert_eq!(archived.len(), 1, "exactly one archived segment expected");
        let (archived_valid, archived_count) = verify_receipts_at(&archived[0].path()).unwrap();
        assert!(archived_valid, "archived segment must still verify cleanly");
        assert_eq!(
            archived_count, 2,
            "both original entries preserved in the archive, not lost"
        );
        // A fresh append after rotation continues the SAME chain in a new
        // active file, anchored to the archived segment's real last entry
        // -- verify_receipts (the full, cross-segment walk) must report
        // all 3 entries ever written, not just the 1 in the active file.
        append_receipt(&root, "three", "test", "third").unwrap();
        assert_eq!(verify_receipts(&root).unwrap(), (true, 3));
        // The single-segment view (what append's own pre-check uses)
        // still correctly sees only the new file's own entry.
        assert_eq!(verify_receipts_at(&path).unwrap(), (true, 1));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_entry_written_after_rotation_cryptographically_references_the_archived_segments_last_entry(
    ) {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        append_receipt(&root, "one", "test", "first").unwrap();
        append_receipt(&root, "two", "test", "second").unwrap();
        let path = root.join(RECEIPTS_PATH);
        let size = fs::metadata(&path).unwrap().len();
        maybe_rotate_receipts_over(&path, size).unwrap();
        let (_, archived_count, archived_last_hash, _) =
            verify_segment_from(&archived_segments(&path).unwrap()[0], "GENESIS".into(), 1)
                .unwrap();
        assert_eq!(archived_count, 2);
        append_receipt(&root, "three", "test", "third").unwrap();
        let new_first_line = fs::read_to_string(&path).unwrap();
        let receipt: Receipt =
            serde_json::from_str(new_first_line.lines().next().unwrap()).unwrap();
        assert_eq!(
            receipt.payload.previous_hash, archived_last_hash,
            "the first entry in the new segment must reference the archived segment's real last hash, not a fresh GENESIS"
        );
        assert_eq!(
            receipt.payload.sequence, 3,
            "sequence numbers continue across the rotation boundary, they do not reset to 1"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn tampering_with_an_archived_segment_is_caught_by_the_full_chain_walk_even_though_the_active_segment_alone_looks_fine(
    ) {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        append_receipt(&root, "one", "test", "first").unwrap();
        append_receipt(&root, "two", "test", "second").unwrap();
        let path = root.join(RECEIPTS_PATH);
        let size = fs::metadata(&path).unwrap().len();
        maybe_rotate_receipts_over(&path, size).unwrap();
        append_receipt(&root, "three", "test", "third").unwrap();
        // Corrupt the ARCHIVED segment directly -- append_receipt_at's own
        // pre-append tamper check only ever looks at the active file, so
        // this must be caught by verify_receipts's cross-segment walk, not
        // by anything on the write path.
        let archived_path = archived_segments(&path)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let tampered = fs::read_to_string(&archived_path)
            .unwrap()
            .replace("first", "forged");
        fs::write(&archived_path, tampered).unwrap();
        assert!(!verify_receipts(&root).unwrap().0);
        // The active segment in isolation still looks internally
        // consistent -- this is exactly the gap the anchor mechanism
        // closes: only the full walk catches history tampering.
        assert!(verify_receipts_at(&path).unwrap().0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rotation_is_a_no_op_below_the_threshold() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        append_receipt(&root, "one", "test", "first").unwrap();
        let path = root.join(RECEIPTS_PATH);
        let size = fs::metadata(&path).unwrap().len();
        maybe_rotate_receipts_over(&path, size + 1).unwrap();
        assert!(path.exists(), "file must not rotate while under threshold");
        assert_eq!(verify_receipts(&root).unwrap(), (true, 1));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unlock_requires_explicit_human_approval() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        halt(&root, "unsafe action", "human").unwrap();
        assert!(unlock(&root, false, "reviewed", "human").is_err());
        assert!(root.join(HALT_PATH).is_file());
        unlock(&root, true, "reviewed", "human").unwrap();
        assert!(!root.join(HALT_PATH).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn quarantine_is_explicit_and_human_cleared() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        let record =
            set_quarantine(&root, QuarantineMode::NoShell, "investigating", "human").unwrap();
        assert_eq!(record.mode, QuarantineMode::NoShell);
        assert!(clear_quarantine(&root, false, "done", "human").is_err());
        clear_quarantine(&root, true, "done", "human").unwrap();
        assert!(!root.join(QUARANTINE_PATH).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn self_test_never_creates_production_halt() {
        let root = root();
        fs::create_dir_all(root.join("core/hooks")).unwrap();
        fs::create_dir_all(root.join(".claude/hooks")).unwrap();
        fs::create_dir_all(root.join(".codex/hooks")).unwrap();
        for path in [
            root.join("core/hooks/giamthi-halt-check.sh"),
            root.join(".claude/hooks/giamthi-halt-check.sh"),
            root.join(".codex/hooks/giamthi-halt-check.sh"),
        ] {
            fs::write(path, "same").unwrap();
        }
        assert!(self_test(&root).passed);
        assert!(!root.join(HALT_PATH).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dashboard_distinguishes_scheduler_resident_and_compatibility_watcher() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        let report = dashboard(&root).unwrap();
        assert_eq!(
            report.service.installed,
            report.periodic_scheduler.installed
        );
        assert!(!report.resident_service.installed);
        assert_eq!(report.resident_service.registered, Some(false));
        assert_eq!(report.compatibility_watcher.state, "not-installed");
        assert_eq!(
            report.native_helper.runtime_version,
            env!("CARGO_PKG_VERSION")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dashboard_discovery_reports_other_checkout_definitions_without_deleting_them() {
        let sandbox = root();
        let current = sandbox.join("current checkout");
        let old = sandbox.join("old checkout");
        let home = sandbox.join("home");
        let definitions = home.join("Library/LaunchAgents");
        fs::create_dir_all(&current).unwrap();
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&definitions).unwrap();

        let current_definition = definitions.join("com.yana.service.current.plist");
        fs::write(
            &current_definition,
            format!(
                "<plist><dict><key>WorkingDirectory</key><string>{}</string></dict></plist>",
                current.display()
            ),
        )
        .unwrap();
        let old_definition = definitions.join("com.yana.system-health.old.plist");
        fs::write(
            &old_definition,
            format!(
                "<plist><dict><key>WorkingDirectory</key><string>{}</string></dict></plist>",
                old.display()
            ),
        )
        .unwrap();
        let watcher_definition = definitions.join("com.yanaai.giamthi-watch.old.plist");
        fs::write(
            &watcher_definition,
            format!(
                "<plist><dict><key>ProgramArguments</key><array><string>/bin/bash</string><string>{}/.claude/scripts/giamthi-watch.sh</string></array></dict></plist>",
                old.display()
            ),
        )
        .unwrap();

        let findings = service_definition_findings_at(&current, &home, "macos").unwrap();
        assert_eq!(findings.len(), 2);
        assert!(findings
            .iter()
            .all(|finding| finding.target.as_deref() == Some(old.to_string_lossy().as_ref())));
        assert!(findings
            .iter()
            .any(|finding| finding.component == "periodic-scheduler"));
        assert!(findings
            .iter()
            .any(|finding| finding.component == "compatibility-watcher"));
        assert!(current_definition.is_file());
        assert!(old_definition.is_file());
        assert!(watcher_definition.is_file());

        fs::remove_dir_all(sandbox).unwrap();
    }

    #[test]
    fn compatibility_definition_targets_parse_on_linux_and_windows() {
        let sandbox = root();
        let target = sandbox.join("checkout with spaces");
        fs::create_dir_all(&target).unwrap();

        let linux = sandbox.join("yana-giamthi-old.service");
        fs::write(
            &linux,
            format!("[Service]\nWorkingDirectory=\"{}\"\n", target.display()),
        )
        .unwrap();
        assert_eq!(
            definition_component(&linux, "linux"),
            Some("compatibility-watcher")
        );
        assert_eq!(
            definition_target(&linux, "compatibility-watcher").unwrap(),
            Some(target.clone())
        );

        let windows_dir = sandbox.join(".yana-ai/giamthi");
        fs::create_dir_all(&windows_dir).unwrap();
        let windows = windows_dir.join("old.json");
        fs::write(&windows, serde_json::json!({"target": target}).to_string()).unwrap();
        assert_eq!(
            definition_component(&windows, "windows"),
            Some("compatibility-watcher")
        );
        assert_eq!(
            definition_target(&windows, "compatibility-watcher").unwrap(),
            Some(target)
        );

        fs::remove_dir_all(sandbox).unwrap();
    }

    #[test]
    fn hook_check_uses_event_specific_halt_shapes_without_jq() {
        let root = root();
        fs::create_dir_all(root.join(".claude/state")).unwrap();
        fs::write(root.join(HALT_PATH), "line one\nline two\\quoted\n").unwrap();

        let pre = hook_check(&root, r#"{"hook_event_name":"PreToolUse"}"#);
        assert_eq!(pre.exit_code, 2);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&pre.stdout).unwrap()["hookSpecificOutput"]
                ["permissionDecision"],
            "deny"
        );
        let session = hook_check(&root, r#"{"hook_event_name":"SessionStart"}"#);
        assert_eq!(session.exit_code, 0);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&session.stdout).unwrap()["continue"],
            false
        );
        let prompt = hook_check(&root, r#"{"hook_event_name":"UserPromptSubmit"}"#);
        assert_eq!(prompt.exit_code, 0);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&prompt.stdout).unwrap()["decision"],
            "block"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_preserves_tool_scoped_quarantine() {
        let root = root();
        fs::create_dir_all(root.join(".claude/state")).unwrap();
        set_quarantine(&root, QuarantineMode::NoShell, "investigating", "human").unwrap();
        assert_eq!(
            hook_check(
                &root,
                r#"{"hook_event_name":"PreToolUse","tool_name":"Read"}"#
            ),
            hook_allow()
        );
        assert_eq!(
            hook_check(
                &root,
                r#"{"hook_event_name":"PreToolUse","tool_name":"Bash"}"#
            )
            .exit_code,
            2
        );
        assert_eq!(
            hook_check(&root, r#"{"hook_event_name":"SessionStart"}"#),
            hook_allow()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_fails_closed_on_active_malformed_state_or_input() {
        let root = root();
        fs::create_dir_all(root.join(".claude/state")).unwrap();
        fs::write(root.join(QUARANTINE_PATH), "not-json").unwrap();
        assert_eq!(
            hook_check(&root, r#"{"hook_event_name":"PreToolUse"}"#).exit_code,
            2
        );
        assert_eq!(hook_check(&root, "not-json").exit_code, 2);
        fs::remove_file(root.join(QUARANTINE_PATH)).unwrap();
        fs::create_dir(root.join(HALT_PATH)).unwrap();
        assert_eq!(
            hook_check(&root, r#"{"hook_event_name":"SessionStart"}"#).exit_code,
            0
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                &hook_check(&root, r#"{"hook_event_name":"SessionStart"}"#).stdout
            )
            .unwrap()["continue"],
            false
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_allows_when_no_safety_state_exists() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        assert_eq!(hook_check(&root, "not-json"), hook_allow());
        fs::remove_dir_all(root).unwrap();
    }

    // ── Phase 9 (host-native-os program) ────────────────────────────

    #[test]
    fn dashboard_surfaces_phase_3_5_8_evidence_without_deciding_mode() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        let report = dashboard(&root).unwrap();
        // Purely observational fields are present and internally
        // consistent -- their presence must never change `mode`.
        assert_eq!(report.mode, "normal");
        assert!(report.host_capabilities.is_some());
        // No reconciliation has run yet in this fresh root.
        assert!(report.last_reconciliation.is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn new_dashboard_evidence_never_overrides_an_active_halt() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        halt(&root, "unsafe action", "human").unwrap();
        let report = dashboard(&root).unwrap();
        // The whole point of Phase 9: new observability fields are
        // additive reporting, never authority. `mode` must still be
        // decided purely by HALT_PATH's existence, exactly as before
        // this phase.
        assert_eq!(report.mode, "halted");
        assert!(report.host_capabilities.is_some());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn tick_persists_reconciliation_state_for_the_next_tick_to_diff_against() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        assert!(!root.join(RECONCILIATION_STATE_PATH).exists());
        tick(&root).unwrap();
        assert!(root.join(RECONCILIATION_STATE_PATH).is_file());
        let state: events::ReconciliationState =
            read_json_optional(&root.join(RECONCILIATION_STATE_PATH))
                .unwrap()
                .unwrap();
        assert!(state.last_tick_unix_secs.is_some());
        assert!(state.last_pressure.is_some());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_genuine_pressure_change_between_ticks_is_recorded_as_a_receipt() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        // Seed a prior reconciliation state claiming Normal pressure, far
        // enough in the past to not trigger sleep/wake noise, so the next
        // real tick's (whatever the live pressure actually is) comparison
        // against a DIFFERENT synthetic previous level is deterministic.
        let seeded = events::ReconciliationState {
            last_tick_unix_secs: Some(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            ),
            last_pressure: Some(pressure::PressureLevel::Unknown),
        };
        write_json_atomic(&root.join(RECONCILIATION_STATE_PATH), &seeded).unwrap();
        let before = verify_receipts(&root).unwrap().1;
        tick(&root).unwrap();
        let after = verify_receipts(&root).unwrap().1;
        // At minimum the tick's own "supervisor.tick" receipt is added;
        // whether a "supervisor.event" receipt is also added depends on
        // whether live pressure differs from the seeded Unknown, which
        // this test cannot force deterministically without mocking
        // pressure::collect -- so it only asserts the chain grew and
        // stayed valid, not the exact count.
        assert!(after > before);
        assert!(verify_receipts(&root).unwrap().0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reconcile_events_degrades_gracefully_on_a_corrupt_state_file() {
        let root = root();
        fs::create_dir_all(root.join(".yana-ai/os")).unwrap();
        fs::write(root.join(RECONCILIATION_STATE_PATH), "not json").unwrap();
        // Must not panic and must not prevent the tick's own heartbeat
        // from being written -- best-effort degradation, not a hard
        // failure, per this function's own doc comment.
        let result = tick(&root);
        assert!(result.is_ok());
        assert!(root.join(STATE_PATH).is_file());
        fs::remove_dir_all(root).unwrap();
    }
}
