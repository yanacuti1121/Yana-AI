//! Native Giám Thị supervisor state, receipts, and human safety controls.

use super::{agent, health, monitor, monitor_service, state};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
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
const SENSITIVE_BASELINE_PATH: &str = ".yana-ai/os/sensitive-baseline.json";
/// Security-sensitive paths outside core-lock's LOCKED_DIRS (core/rules,
/// core/gates, core/hooks, core/scripts, src/guard —
/// core/scripts/verify-core-lock.sh) — content-hash checked against the
/// working tree, closing `core/scripts/giamthi-watch.sh`'s own documented
/// commit-SHA-only blind spot (an edit made and never committed, or
/// committed and reverted before the next tick, was previously invisible
/// for the gap between ticks).
///
/// Must stay a superset of (ideally identical to) `giamthi-watch.sh`'s own
/// `RISKY` grep pattern — a divergence here is a silent coverage
/// regression on any machine where this native check is used in
/// preference to that fallback (SECURITY FIX 2026-08-14, security-auditor
/// review: `.cursor/hooks` was missing here despite already being in the
/// bash fallback's pattern, meaning tampering with
/// `.cursor/hooks/giamthi-halt-check.js` — the Cursor bridge to this same
/// HALT authority — would go undetected once yana-rt is on PATH).
const SENSITIVE_WATCH_PATHS: &[&str] = &[
    ".claude/settings.json",
    ".claude/hooks",
    ".codex/hooks",
    ".cursor/hooks",
    ".github/workflows",
];

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
    pub service: monitor_service::ServiceReport,
    pub latest_health: Option<monitor::SystemHealthSnapshot>,
    pub health_checks: health::HealthReport,
    pub receipt_chain_valid: bool,
    pub receipt_count: usize,
    pub managed_agents: usize,
    pub chat_sessions: usize,
    pub native_helper: NativeHelperStatus,
}

#[derive(Debug, Serialize)]
pub struct NativeHelperStatus {
    pub binary: String,
    pub native_scheduler: bool,
    pub signature_status: String,
    pub detail: String,
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

pub fn tick(root: &Path) -> Result<SupervisorState> {
    let snapshot = monitor::collect(root);
    monitor::persist(root, &snapshot)?;
    let inventory =
        agent::inventory(root, true, usize::MAX).unwrap_or_else(|_| agent::AgentInventory {
            managed: Vec::new(),
            chat_sessions: Vec::new(),
        });
    let report = health::inspect(root);
    let tick_id = Uuid::new_v4().to_string();
    let current = SupervisorState {
        schema_version: 1,
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
    Ok(current)
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
        });
    let mode = if halt_reason.is_some() {
        "halted".to_string()
    } else if let Some(record) = &quarantine {
        format!("quarantine:{}", record.mode.as_str())
    } else {
        "normal".to_string()
    };
    Ok(SupervisorDashboard {
        project_root: root.display().to_string(),
        mode,
        halt_reason,
        quarantine,
        heartbeat,
        heartbeat_age_secs,
        heartbeat_slo_secs: HEARTBEAT_SLO_SECS,
        heartbeat_healthy,
        service: monitor_service::status(root)?,
        latest_health: monitor::load(root).ok(),
        health_checks: health::inspect(root),
        receipt_chain_valid,
        receipt_count,
        managed_agents: inventory.managed.len(),
        chat_sessions: inventory.chat_sessions.len(),
        native_helper: native_helper_status(),
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

/// What `hook_check` decided, independent of which hook event asked. The
/// event-shape mapping (which JSON keys, which exit code) is a separate,
/// pure concern handled by `cmd_hook_check` below — `hook_check` itself
/// only answers "does the shared HALT/quarantine state allow this."
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HookCheckOutcome {
    Allow,
    Deny(String),
}

/// Bound on lock-content text embedded in a denial message — matches the
/// canonical shell hook's `head -c 1500` behavior, but truncates by
/// Unicode scalar value rather than raw byte, so multi-byte UTF-8 (this
/// message is Vietnamese) can never be cut mid-character the way a byte
/// truncation can.
const LOCK_MESSAGE_MAX_CHARS: usize = 1500;

/// Same tool-scoped quarantine table `core/hooks/giamthi-halt-check.sh`
/// encodes as a `case "$MODE:$TOOL_NAME"` — ported 1:1, not redesigned.
fn quarantine_denies(mode: QuarantineMode, tool_name: &str) -> bool {
    matches!(
        (mode, tool_name),
        (QuarantineMode::ReadOnly, "Write")
            | (QuarantineMode::ReadOnly, "Edit")
            | (QuarantineMode::ReadOnly, "NotebookEdit")
            | (QuarantineMode::ReadOnly, "Bash")
            | (QuarantineMode::NoShell, "Bash")
            | (QuarantineMode::NoNetwork, "WebFetch")
            | (QuarantineMode::NoNetwork, "WebSearch")
    )
}

/// The native equivalent of `core/hooks/giamthi-halt-check.sh`'s policy
/// decision — everything after "does a lock/quarantine file exist" and
/// before "what JSON shape does this hook event need." No `jq` dependency,
/// no degraded path: this is the canonical implementation the shell script
/// now calls first, falling back to its own jq-based logic only when
/// `yana-rt` isn't on PATH.
///
/// `tool_name` is `None` for events that don't carry one (`SessionStart`,
/// `UserPromptSubmit`) — quarantine is tool-scoped and never matches for
/// those, exactly like the shell version's empty-`TOOL_NAME` case.
pub fn hook_check(root: &Path, tool_name: Option<&str>) -> Result<HookCheckOutcome> {
    let halt_path = root.join(HALT_PATH);
    if let Some(body) = read_regular_text(&halt_path)? {
        let truncated: String = body.chars().take(LOCK_MESSAGE_MAX_CHARS).collect();
        let truncated = if truncated.trim().is_empty() {
            "(khoá tồn tại nhưng không đọc được nội dung)".to_string()
        } else {
            truncated
        };
        return Ok(HookCheckOutcome::Deny(format!(
            "Giám thị đã khoá phiên này — chỉ con người mới gỡ được (xoá {} sau khi đã kiểm tra). Nội dung: {truncated}",
            halt_path.display()
        )));
    }

    let quarantine_path = root.join(QUARANTINE_PATH);
    if let Some(record) = read_json_optional::<QuarantineRecord>(&quarantine_path)? {
        if let Some(tool) = tool_name.filter(|tool| !tool.is_empty()) {
            if quarantine_denies(record.mode, tool) {
                return Ok(HookCheckOutcome::Deny(format!(
                    "Giám thị quarantine '{}' blocked tool '{tool}'. A human must review and clear {}.",
                    record.mode.as_str(),
                    quarantine_path.display()
                )));
            }
        }
    }

    Ok(HookCheckOutcome::Allow)
}

#[derive(Deserialize, Default)]
struct HookCheckInput {
    #[serde(default)]
    hook_event_name: String,
    #[serde(default)]
    tool_name: Option<String>,
    #[serde(default, rename = "toolName")]
    tool_name_camel: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

impl HookCheckInput {
    fn resolved_tool_name(&self) -> Option<&str> {
        self.tool_name
            .as_deref()
            .or(self.tool_name_camel.as_deref())
            .or(self.name.as_deref())
            .filter(|value| !value.is_empty())
    }
}

/// Reads the hook JSON payload from stdin, runs `hook_check`, and prints
/// the response shape the current hook event actually requires — same
/// three shapes `core/hooks/giamthi-halt-check.sh`'s `emit_denial()`
/// implements (PreToolUse deny-JSON+exit 2, SessionStart
/// continue:false+exit 0, UserPromptSubmit decision:block+exit 0) — before
/// this function existed, only the shell script (and only when `jq` was
/// installed) could produce the SessionStart/UserPromptSubmit shapes at
/// all. Returns the process exit code; does not exit directly, so callers
/// (and tests) control when the process actually terminates.
pub fn cmd_hook_check(root: &Path) -> Result<i32> {
    let mut buf = String::new();
    std::io::stdin()
        .read_to_string(&mut buf)
        .context("reading hook payload from stdin")?;
    let input: HookCheckInput = if buf.trim().is_empty() {
        HookCheckInput::default()
    } else {
        serde_json::from_str(&buf).context("hook payload on stdin is not valid JSON")?
    };

    let outcome = hook_check(root, input.resolved_tool_name())?;
    let reason = match outcome {
        HookCheckOutcome::Allow => return Ok(0),
        HookCheckOutcome::Deny(reason) => reason,
    };

    match input.hook_event_name.as_str() {
        "SessionStart" => {
            println!(
                "{}",
                serde_json::json!({ "continue": false, "stopReason": reason })
            );
            Ok(0)
        }
        "UserPromptSubmit" => {
            println!(
                "{}",
                serde_json::json!({ "decision": "block", "reason": reason })
            );
            Ok(0)
        }
        _ => {
            println!(
                "{}",
                serde_json::json!({
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": reason
                    }
                })
            );
            Ok(2)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensitiveBaseline {
    pub schema_version: u32,
    /// Relative path (as recorded in `SENSITIVE_WATCH_PATHS`'s walk) ->
    /// SHA-256 hex digest of its content. A symlink's "content" is the
    /// digest of its target path string, prefixed `symlink:` — so a
    /// symlink swapped for a regular file (or vice versa) always changes
    /// the recorded value, never silently matches.
    pub manifest: BTreeMap<String, String>,
    pub approved_by: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SensitiveDriftReport {
    pub baseline_exists: bool,
    pub added: Vec<String>,
    pub modified: Vec<String>,
    pub removed: Vec<String>,
    pub clean: bool,
}

fn hash_bytes(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Walks `SENSITIVE_WATCH_PATHS`, recording a stable relative path (using
/// `/` separators regardless of host OS, so a baseline approved on one
/// platform compares correctly on another) -> content-hash entry for every
/// regular file and symlink found. A watched path that doesn't exist at
/// all contributes no entries — same "absence isn't tampering" reasoning
/// `core/scripts/giamthi-watch.sh`'s own SOURCE_CHECKOUT guard already
/// uses for core-lock.
fn compute_sensitive_manifest(root: &Path) -> Result<BTreeMap<String, String>> {
    let mut manifest = BTreeMap::new();
    for watched in SENSITIVE_WATCH_PATHS {
        collect_sensitive_hashes(root, &root.join(watched), &mut manifest)?;
    }
    Ok(manifest)
}

fn collect_sensitive_hashes(
    root: &Path,
    path: &Path,
    out: &mut BTreeMap<String, String>,
) -> Result<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error).with_context(|| format!("inspecting {}", path.display())),
    };
    let relative = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    if metadata.file_type().is_symlink() {
        let target =
            fs::read_link(path).with_context(|| format!("reading symlink {}", path.display()))?;
        out.insert(
            relative,
            format!(
                "symlink:{}",
                hash_bytes(target.to_string_lossy().as_bytes())
            ),
        );
        return Ok(());
    }
    if metadata.is_file() {
        let bytes = fs::read(path).with_context(|| format!("reading {}", path.display()))?;
        out.insert(relative, hash_bytes(&bytes));
        return Ok(());
    }
    if metadata.is_dir() {
        let mut entries: Vec<PathBuf> = fs::read_dir(path)
            .with_context(|| format!("reading directory {}", path.display()))?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .collect();
        entries.sort();
        for entry in entries {
            collect_sensitive_hashes(root, &entry, out)?;
        }
    }
    Ok(())
}

/// Compares the current working tree against the approved baseline. If no
/// baseline has ever been approved, this reports `baseline_exists: false,
/// clean: true` — absence of a baseline is a "not configured yet" state,
/// never treated as drift itself. A Giám Thị process (this function, or
/// giamthi-watch.sh calling it) can only ever produce this report; nothing
/// here writes a baseline. See `approve_sensitive_baseline` for the only,
/// explicitly human-gated, path that does.
pub fn sensitive_drift(root: &Path) -> Result<SensitiveDriftReport> {
    let baseline = read_json_optional::<SensitiveBaseline>(&root.join(SENSITIVE_BASELINE_PATH))?;
    let current = compute_sensitive_manifest(root)?;
    let Some(baseline) = baseline else {
        return Ok(SensitiveDriftReport {
            baseline_exists: false,
            added: Vec::new(),
            modified: Vec::new(),
            removed: Vec::new(),
            clean: true,
        });
    };

    let mut added = Vec::new();
    let mut modified = Vec::new();
    for (path, hash) in &current {
        match baseline.manifest.get(path) {
            None => added.push(path.clone()),
            Some(previous) if previous != hash => modified.push(path.clone()),
            _ => {}
        }
    }
    let removed: Vec<String> = baseline
        .manifest
        .keys()
        .filter(|path| !current.contains_key(*path))
        .cloned()
        .collect();
    let clean = added.is_empty() && modified.is_empty() && removed.is_empty();
    Ok(SensitiveDriftReport {
        baseline_exists: true,
        added,
        modified,
        removed,
        clean,
    })
}

/// The only path that may write `SENSITIVE_BASELINE_PATH`. Requires
/// `--approve` plus a non-empty actor and reason — identical signature
/// discipline to `unlock()` and `clear_quarantine()` above, deliberately:
/// a Giám Thị process completing a run (automated, no human present) must
/// never be able to call this and silently re-bless a changed baseline
/// just because a check happened to run to completion.
pub fn approve_sensitive_baseline(
    root: &Path,
    approve: bool,
    reason: &str,
    actor: &str,
) -> Result<SensitiveBaseline> {
    if !approve {
        bail!("advancing the sensitive-path baseline requires --approve");
    }
    let reason = required("reason", reason)?;
    let actor = required("actor", actor)?;
    let manifest = compute_sensitive_manifest(root)?;
    let baseline = SensitiveBaseline {
        schema_version: 1,
        manifest,
        approved_by: actor.to_string(),
        reason: reason.to_string(),
        created_at: state::now(),
    };
    append_receipt(
        root,
        "supervisor.sensitive_baseline.approve",
        actor,
        &format!("reason={reason}; files={}", baseline.manifest.len()),
    )?;
    write_json_atomic(&root.join(SENSITIVE_BASELINE_PATH), &baseline)?;
    Ok(baseline)
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
        native_scheduler: true,
        signature_status,
        detail,
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

fn append_receipt_at(path: &Path, event: &str, actor: &str, detail: &str) -> Result<()> {
    let (valid, _) = verify_receipts_at(path)?;
    if !valid {
        bail!(
            "refusing to append to tampered receipt chain: {}",
            path.display()
        );
    }
    let existing = read_regular_text(path)?.unwrap_or_default();
    let mut previous_hash = "GENESIS".to_string();
    let mut sequence = 1;
    for line in existing.lines().filter(|line| !line.trim().is_empty()) {
        let receipt: Receipt = serde_json::from_str(line)
            .with_context(|| format!("invalid receipt chain {}", path.display()))?;
        previous_hash = receipt.hash;
        sequence = receipt.payload.sequence + 1;
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

fn verify_receipts(root: &Path) -> Result<(bool, usize)> {
    verify_receipts_at(&root.join(RECEIPTS_PATH))
}

fn verify_receipts_at(path: &Path) -> Result<(bool, usize)> {
    let Some(text) = read_regular_text(path)? else {
        return Ok((true, 0));
    };
    let mut previous_hash = "GENESIS".to_string();
    let mut expected_sequence = 1;
    let mut count = 0;
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let receipt: Receipt = serde_json::from_str(line)
            .with_context(|| format!("invalid receipt chain {}", path.display()))?;
        if receipt.payload.sequence != expected_sequence
            || receipt.payload.previous_hash != previous_hash
            || receipt.hash != hash_payload(&receipt.payload)?
        {
            return Ok((false, count));
        }
        previous_hash = receipt.hash;
        expected_sequence += 1;
        count += 1;
    }
    Ok((true, count))
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
    fn hook_check_allows_when_neither_halt_nor_quarantine_exists() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        assert_eq!(
            hook_check(&root, Some("Bash")).unwrap(),
            HookCheckOutcome::Allow
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_denies_on_halt_regardless_of_tool() {
        let root = root();
        fs::create_dir_all(root.join(".claude/state")).unwrap();
        fs::write(
            root.join(HALT_PATH),
            "actor: human\nreason: investigating\n",
        )
        .unwrap();
        let outcome = hook_check(&root, None).unwrap();
        match outcome {
            HookCheckOutcome::Deny(reason) => {
                assert!(reason.contains("investigating"));
                assert!(reason.contains("Giám thị"));
            }
            HookCheckOutcome::Allow => panic!("expected Deny"),
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_halt_message_falls_back_when_content_unreadable() {
        let root = root();
        fs::create_dir_all(root.join(".claude/state")).unwrap();
        fs::write(root.join(HALT_PATH), "   \n  ").unwrap();
        let outcome = hook_check(&root, None).unwrap();
        match outcome {
            HookCheckOutcome::Deny(reason) => {
                assert!(reason.contains("không đọc được nội dung"));
            }
            HookCheckOutcome::Allow => panic!("expected Deny"),
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_truncates_a_very_long_halt_message() {
        let root = root();
        fs::create_dir_all(root.join(".claude/state")).unwrap();
        let long_reason = "x".repeat(LOCK_MESSAGE_MAX_CHARS * 2);
        fs::write(root.join(HALT_PATH), &long_reason).unwrap();
        let outcome = hook_check(&root, None).unwrap();
        match outcome {
            HookCheckOutcome::Deny(reason) => {
                assert!(reason.len() < long_reason.len());
            }
            HookCheckOutcome::Allow => panic!("expected Deny"),
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_read_only_quarantine_denies_write_but_allows_read() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        set_quarantine(&root, QuarantineMode::ReadOnly, "investigating", "human").unwrap();
        assert!(matches!(
            hook_check(&root, Some("Write")).unwrap(),
            HookCheckOutcome::Deny(_)
        ));
        assert_eq!(
            hook_check(&root, Some("Read")).unwrap(),
            HookCheckOutcome::Allow
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_no_shell_quarantine_denies_bash_only() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        set_quarantine(&root, QuarantineMode::NoShell, "investigating", "human").unwrap();
        assert!(matches!(
            hook_check(&root, Some("Bash")).unwrap(),
            HookCheckOutcome::Deny(_)
        ));
        assert_eq!(
            hook_check(&root, Some("Write")).unwrap(),
            HookCheckOutcome::Allow
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_no_network_quarantine_denies_web_tools() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        set_quarantine(&root, QuarantineMode::NoNetwork, "investigating", "human").unwrap();
        assert!(matches!(
            hook_check(&root, Some("WebFetch")).unwrap(),
            HookCheckOutcome::Deny(_)
        ));
        assert!(matches!(
            hook_check(&root, Some("WebSearch")).unwrap(),
            HookCheckOutcome::Deny(_)
        ));
        assert_eq!(
            hook_check(&root, Some("Bash")).unwrap(),
            HookCheckOutcome::Allow
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_quarantine_never_matches_a_tool_less_event() {
        // SessionStart/UserPromptSubmit carry no tool_name — quarantine is
        // tool-scoped and must never fire for them, same as the shell
        // version's empty-TOOL_NAME case.
        let root = root();
        fs::create_dir_all(&root).unwrap();
        set_quarantine(&root, QuarantineMode::ReadOnly, "investigating", "human").unwrap();
        assert_eq!(hook_check(&root, None).unwrap(), HookCheckOutcome::Allow);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_check_halt_takes_priority_over_quarantine() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        set_quarantine(&root, QuarantineMode::ReadOnly, "investigating", "human").unwrap();
        fs::write(root.join(HALT_PATH), "actor: human\nreason: full halt\n").unwrap();
        let outcome = hook_check(&root, Some("Read")).unwrap();
        match outcome {
            HookCheckOutcome::Deny(reason) => assert!(reason.contains("full halt")),
            HookCheckOutcome::Allow => {
                panic!("HALT must win over quarantine and over Read normally being allowed")
            }
        }
        fs::remove_dir_all(root).unwrap();
    }

    fn write_sensitive_fixture(root: &Path) {
        fs::create_dir_all(root.join(".claude")).unwrap();
        fs::write(root.join(".claude/settings.json"), "{\"hooks\":{}}").unwrap();
        fs::create_dir_all(root.join(".claude/hooks")).unwrap();
        fs::write(
            root.join(".claude/hooks/example.sh"),
            "#!/bin/sh\necho hi\n",
        )
        .unwrap();
    }

    #[test]
    fn sensitive_drift_with_no_baseline_is_not_treated_as_drift() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        let report = sensitive_drift(&root).unwrap();
        assert!(!report.baseline_exists);
        assert!(report.clean);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn approve_sensitive_baseline_requires_approve_reason_and_actor() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        assert!(approve_sensitive_baseline(&root, false, "reviewed", "human").is_err());
        assert!(approve_sensitive_baseline(&root, true, "", "human").is_err());
        assert!(approve_sensitive_baseline(&root, true, "reviewed", "").is_err());
        assert!(!root.join(SENSITIVE_BASELINE_PATH).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sensitive_drift_is_clean_immediately_after_approval() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();
        let report = sensitive_drift(&root).unwrap();
        assert!(report.baseline_exists);
        assert!(report.clean);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sensitive_drift_detects_an_uncommitted_modification() {
        // The exact gap giamthi-watch.sh's commit-SHA-only check could not
        // close: this never touches git at all, only file content.
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();
        fs::write(
            root.join(".claude/settings.json"),
            "{\"hooks\":{\"evil\":true}}",
        )
        .unwrap();
        let report = sensitive_drift(&root).unwrap();
        assert!(!report.clean);
        assert!(report
            .modified
            .iter()
            .any(|path| path == ".claude/settings.json"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sensitive_drift_detects_an_added_file() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();
        fs::write(root.join(".claude/hooks/new-hook.sh"), "#!/bin/sh\n").unwrap();
        let report = sensitive_drift(&root).unwrap();
        assert!(!report.clean);
        assert!(report
            .added
            .iter()
            .any(|path| path == ".claude/hooks/new-hook.sh"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sensitive_drift_detects_a_removed_file() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();
        fs::remove_file(root.join(".claude/hooks/example.sh")).unwrap();
        let report = sensitive_drift(&root).unwrap();
        assert!(!report.clean);
        assert!(report
            .removed
            .iter()
            .any(|path| path == ".claude/hooks/example.sh"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sensitive_drift_covers_cursor_hooks_same_as_the_bash_fallback() {
        // Regression guard for the 2026-08-14 security-auditor finding:
        // SENSITIVE_WATCH_PATHS must not silently drop a path
        // giamthi-watch.sh's own bash RISKY pattern still watches.
        let root = root();
        fs::create_dir_all(root.join(".cursor/hooks")).unwrap();
        fs::write(
            root.join(".cursor/hooks/giamthi-halt-check.js"),
            "// original",
        )
        .unwrap();
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();
        fs::write(
            root.join(".cursor/hooks/giamthi-halt-check.js"),
            "// tampered",
        )
        .unwrap();
        let report = sensitive_drift(&root).unwrap();
        assert!(!report.clean);
        assert!(report
            .modified
            .iter()
            .any(|path| path == ".cursor/hooks/giamthi-halt-check.js"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn sensitive_drift_detects_symlink_substitution() {
        use std::os::unix::fs::symlink;

        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();

        let outside = root.join("outside-target");
        fs::write(&outside, "not the real hook").unwrap();
        fs::remove_file(root.join(".claude/hooks/example.sh")).unwrap();
        symlink(&outside, root.join(".claude/hooks/example.sh")).unwrap();

        let report = sensitive_drift(&root).unwrap();
        assert!(!report.clean);
        assert!(report
            .modified
            .iter()
            .any(|path| path == ".claude/hooks/example.sh"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn approving_a_new_baseline_after_a_reviewed_change_clears_drift() {
        // The recovery ceremony: a legitimate reviewed change must not
        // cause an endless flag with no defined path forward.
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();
        fs::write(
            root.join(".claude/settings.json"),
            "{\"hooks\":{\"new\":true}}",
        )
        .unwrap();
        assert!(!sensitive_drift(&root).unwrap().clean);

        approve_sensitive_baseline(&root, true, "reviewed and approved the new hook", "human")
            .unwrap();
        assert!(sensitive_drift(&root).unwrap().clean);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sensitive_baseline_approval_is_receipted() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        write_sensitive_fixture(&root);
        approve_sensitive_baseline(&root, true, "initial review", "human").unwrap();
        let (valid, count) = verify_receipts(&root).unwrap();
        assert!(valid);
        assert_eq!(count, 1);
        fs::remove_dir_all(root).unwrap();
    }
}
