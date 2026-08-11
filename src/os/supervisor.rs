//! Native Giám Thị supervisor state, receipts, and human safety controls.

use super::{agent, health, monitor, monitor_service, state};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
}
