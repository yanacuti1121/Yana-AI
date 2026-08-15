//! Governed spawn: every process this service starts is launched via an
//! argv array (never a shell string, per `shell-sanitize-law.md`), and its
//! PID + owner + redacted argv is recorded to an append-only JSONL
//! receipt.
//!
//! This receipt log is operational spawn attribution, not a safety-critical
//! tamper-evidence chain — it is plain append-only JSONL, not hash-chained
//! like `os::supervisor`'s halt/unlock/quarantine receipts. If this log
//! ever needs the same tamper-evidence guarantee, that is a deliberate
//! follow-up, not an oversight here.
//!
//! Phase 17 (host-native-os program, Storage Semantics) note: this JSONL
//! log has no retention/rotation, unlike `os::supervisor`'s receipt chain
//! (rotated in that same phase). Left unfixed here deliberately, not
//! silently: `spawn()` has no live, reachable caller anywhere in this
//! program today (`os::service::*` is written but not yet wired into a
//! real CLI command — a pre-existing, already-known gap), so this file
//! never actually grows in production yet. Building rotation for a path
//! nothing calls would be exactly the "only create persistent files
//! actually needed" over-scoping this phase's own instruction warns
//! against. Whichever phase wires a real caller to `spawn()` must add
//! rotation before that caller runs unattended for any length of time.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;
use std::process::{Child, Command};
use std::time::{SystemTime, UNIX_EPOCH};

const RECEIPTS_RELATIVE_PATH: &str = ".yana-ai/os/service-spawn-receipts.jsonl";
const REDACTED_PLACEHOLDER: &str = "[REDACTED]";
const SENSITIVE_PREFIXES: &[&str] = &[
    "--token=",
    "--key=",
    "--api-key=",
    "--password=",
    "--secret=",
    "--auth=",
];
/// Same set as `SENSITIVE_PREFIXES`, without the trailing `=` — covers the
/// two-token `--flag value` CLI form, where the flag name and its value
/// are separate argv elements rather than one `--flag=value` token.
const SENSITIVE_FLAG_NAMES: &[&str] = &[
    "--token",
    "--key",
    "--api-key",
    "--password",
    "--secret",
    "--auth",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessAttribution {
    pub agent_id: String,
    pub session_id: Option<String>,
    pub mission_id: Option<String>,
}

pub struct GovernedChild {
    pub child: Child,
    pub pid: u32,
    pub owner: ProcessAttribution,
    pub started_at_unix_secs: u64,
    process_group_isolated: bool,
}

impl GovernedChild {
    pub fn terminate_and_reap(&mut self) {
        kill_and_reap(&mut self.child, self.process_group_isolated);
    }
}

impl Drop for GovernedChild {
    fn drop(&mut self) {
        // The spawned process owns an isolated process group on Unix. Always
        // tear that group down, even if the direct child already exited, so
        // it cannot leave untracked descendants behind while the watchdog
        // restarts another copy.
        kill_and_reap(&mut self.child, self.process_group_isolated);
    }
}

#[derive(Debug, Serialize)]
struct SpawnReceipt<'a> {
    schema_version: u32,
    timestamp_unix_secs: u64,
    pid: u32,
    owner: &'a ProcessAttribution,
    argv_redacted: Vec<String>,
}

/// Spawn `argv[0]` with `argv[1..]` as arguments (never through a shell)
/// and record a redacted receipt of the spawn before returning the child.
///
/// If the receipt cannot be recorded, the child is killed and reaped
/// before this function returns — an unattributed process is never left
/// running just because its receipt write failed.
pub fn spawn(root: &Path, argv: &[String], owner: ProcessAttribution) -> Result<GovernedChild> {
    let (program, args) = argv.split_first().context("argv must not be empty")?;
    let mut command = Command::new(program);
    command.args(args);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let child = command
        .spawn()
        .with_context(|| format!("spawning {program}"))?;
    let pid = child.id();
    let started_at_unix_secs = now_unix();
    let record_result = record_spawn(root, pid, &owner, argv, started_at_unix_secs);
    finish_spawn(
        child,
        pid,
        owner,
        started_at_unix_secs,
        cfg!(unix),
        record_result,
    )
}

/// Decides what to do with an already-spawned child based on whether its
/// attribution receipt was recorded. Split out from `spawn` specifically
/// so this policy — kill on failure, never leak an unattributed process —
/// can be unit tested deterministically against a synthetic
/// `record_result`, instead of racing a real filesystem failure against
/// how quickly the child gets scheduled to run.
fn finish_spawn(
    mut child: Child,
    pid: u32,
    owner: ProcessAttribution,
    started_at_unix_secs: u64,
    process_group_isolated: bool,
    record_result: Result<()>,
) -> Result<GovernedChild> {
    if let Err(error) = record_result {
        kill_and_reap(&mut child, process_group_isolated);
        return Err(error);
    }
    Ok(GovernedChild {
        child,
        pid,
        owner,
        started_at_unix_secs,
        process_group_isolated,
    })
}

/// Best-effort kill and reap. Both steps are best-effort: the child may
/// have already exited on its own between the two calls, which is not an
/// error condition here — the goal is simply that nothing is left running
/// unattributed, not that this reports success/failure of the kill.
fn kill_and_reap(child: &mut Child, process_group_isolated: bool) {
    #[cfg(unix)]
    if process_group_isolated {
        // `spawn` puts the child in a process group whose id is the child's
        // pid. A negative pid targets the whole group, including descendants.
        unsafe {
            let _ = libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
    }
    // Also target the direct child. This is redundant for children spawned
    // through `spawn`, but keeps cleanup correct if process-group setup was
    // unavailable or a test exercises `finish_spawn` with a raw Child.
    let _ = child.kill();
    let _ = child.wait();
}

fn record_spawn(
    root: &Path,
    pid: u32,
    owner: &ProcessAttribution,
    argv: &[String],
    timestamp_unix_secs: u64,
) -> Result<()> {
    let receipt = SpawnReceipt {
        schema_version: 1,
        timestamp_unix_secs,
        pid,
        owner,
        argv_redacted: redact_argv(argv),
    };
    let path = root.join(RECEIPTS_RELATIVE_PATH);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    let mut options = OpenOptions::new();
    options.append(true).create(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        if let Some(parent) = path.parent() {
            let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
        }
    }
    let mut file = options
        .open(&path)
        .with_context(|| format!("opening {}", path.display()))?;
    writeln!(file, "{}", serde_json::to_string(&receipt)?)?;
    file.sync_all()?;
    Ok(())
}

/// Redacts both the `--flag=value` single-token form (via
/// `SENSITIVE_PREFIXES`) and the `--flag value` two-token form: a bare
/// sensitive flag name is left visible (it carries no secret on its own),
/// but the argv element immediately following it is always redacted,
/// regardless of what it looks like.
fn redact_argv(argv: &[String]) -> Vec<String> {
    let mut redacted = Vec::with_capacity(argv.len());
    let mut redact_next = false;
    for token in argv {
        let lower = token.to_ascii_lowercase();
        let is_sensitive_assignment = SENSITIVE_PREFIXES
            .iter()
            .any(|prefix| lower.starts_with(prefix));
        let is_sensitive_flag_name = SENSITIVE_FLAG_NAMES.iter().any(|name| lower == *name);
        if redact_next || is_sensitive_assignment || looks_like_secret_literal(token) {
            redacted.push(REDACTED_PLACEHOLDER.to_string());
        } else {
            redacted.push(token.clone());
        }
        redact_next = is_sensitive_flag_name;
    }
    redacted
}

/// Deliberately conservative: a long, no-whitespace, mixed alphanumeric
/// token (the common shape of a bearer token or API key literal) is
/// redacted even at some risk of over-redacting an innocuous long token
/// such as a hash. This is an audit-log hygiene heuristic, not a security
/// boundary in itself — see `52-secrets-vault-law.md` for the boundary
/// that actually is one.
fn looks_like_secret_literal(token: &str) -> bool {
    token.len() > 20
        && !token.contains(char::is_whitespace)
        && token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && token.chars().any(|c| c.is_ascii_digit())
        && token
            .chars()
            .any(|c| c.is_ascii_uppercase() || c.is_ascii_lowercase())
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("yana-service-attribution-{}", Uuid::new_v4()))
    }

    fn owner() -> ProcessAttribution {
        ProcessAttribution {
            agent_id: "watchdog".into(),
            session_id: Some("session-1".into()),
            mission_id: None,
        }
    }

    #[test]
    fn redacts_flagged_prefixes_and_bearer_like_tokens() {
        let argv = vec![
            "yana-rt".to_string(),
            "--token=abcdef123456".to_string(),
            "--dir".to_string(),
            ".".to_string(),
            "sk-ABCdef1234567890ghijk".to_string(),
        ];
        let redacted = redact_argv(&argv);
        assert_eq!(redacted[0], "yana-rt");
        assert_eq!(redacted[1], REDACTED_PLACEHOLDER);
        assert_eq!(redacted[2], "--dir");
        assert_eq!(redacted[3], ".");
        assert_eq!(redacted[4], REDACTED_PLACEHOLDER);
    }

    #[test]
    fn does_not_redact_ordinary_short_arguments() {
        let argv = vec!["yana-rt".to_string(), "--json".to_string()];
        assert_eq!(redact_argv(&argv), argv);
    }

    #[test]
    fn redacts_space_separated_flag_and_value_pairs() {
        let argv = vec![
            "yana-rt".to_string(),
            "--token".to_string(),
            "abc123".to_string(),
            "--password".to_string(),
            "hunter2".to_string(),
            "--dir".to_string(),
            ".".to_string(),
        ];
        let redacted = redact_argv(&argv);
        assert_eq!(redacted[0], "yana-rt");
        assert_eq!(redacted[1], "--token");
        assert_eq!(redacted[2], REDACTED_PLACEHOLDER);
        assert_eq!(redacted[3], "--password");
        assert_eq!(redacted[4], REDACTED_PLACEHOLDER);
        assert_eq!(redacted[5], "--dir");
        assert_eq!(redacted[6], ".");
    }

    #[cfg(unix)]
    #[test]
    fn spawn_records_a_receipt_with_pid_and_owner_but_no_env() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let mut governed = spawn(
            &root,
            &[
                "/bin/sh".to_string(),
                "-c".to_string(),
                "exit 0".to_string(),
            ],
            owner(),
        )
        .unwrap();
        let status = governed.child.wait().unwrap();
        assert!(status.success());
        assert!(governed.pid > 0);
        let receipts = fs::read_to_string(root.join(RECEIPTS_RELATIVE_PATH)).unwrap();
        let line = receipts.lines().next().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(line).unwrap();
        assert_eq!(parsed["pid"], governed.pid);
        assert_eq!(parsed["owner"]["agent_id"], "watchdog");
        assert!(parsed.get("env").is_none());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn empty_argv_is_rejected_before_spawning() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        assert!(spawn(&root, &[], owner()).is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn kill_and_reap_terminates_a_running_child() {
        let mut child = Command::new("/bin/sh")
            .args(["-c", "sleep 30"])
            .spawn()
            .unwrap();
        kill_and_reap(&mut child, false);
        // kill_and_reap already calls wait() synchronously, so by the time
        // it returns the process has been reaped: try_wait must report it
        // as exited, not still running.
        assert!(child.try_wait().unwrap().is_some());
    }

    #[cfg(unix)]
    #[test]
    fn finish_spawn_kills_and_reaps_the_child_when_recording_failed() {
        use std::time::Duration;

        // Spawned directly (not through `spawn()`) so its pid is known
        // immediately and deterministically, with no race against
        // `record_spawn`'s own timing — see `finish_spawn`'s doc comment.
        let child = Command::new("/bin/sh")
            .args(["-c", "sleep 30"])
            .spawn()
            .unwrap();
        let pid = child.id();
        let result = finish_spawn(
            child,
            pid,
            owner(),
            0,
            false,
            Err(anyhow::anyhow!("simulated receipt failure")),
        );
        assert!(result.is_err());

        // Poll briefly for the process to actually disappear after being
        // killed — libc::kill(pid, 0) is the standard liveness probe (no
        // signal sent, just an existence/permission check).
        let mut still_alive = true;
        for _ in 0..100 {
            if unsafe { libc::kill(pid as i32, 0) } != 0 {
                still_alive = false;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(
            !still_alive,
            "child process {pid} was not killed after a simulated receipt failure"
        );
    }

    #[cfg(unix)]
    #[test]
    fn finish_spawn_returns_the_child_when_recording_succeeded() {
        let child = Command::new("/bin/sh")
            .args(["-c", "exit 0"])
            .spawn()
            .unwrap();
        let pid = child.id();
        let mut governed = finish_spawn(child, pid, owner(), 0, false, Ok(())).unwrap();
        assert_eq!(governed.pid, pid);
        assert!(governed.child.wait().unwrap().success());
    }

    #[cfg(unix)]
    #[test]
    fn dropping_governed_child_terminates_its_process_group() {
        use std::time::Duration;

        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let marker = root.join("descendant.pid");
        let script = "sleep 30 & tmp=\"$1.tmp.$$\"; printf '%s\\n' \"$!\" > \"$tmp\"; mv \"$tmp\" \"$1\"; wait";
        let governed = spawn(
            &root,
            &[
                "/bin/sh".into(),
                "-c".into(),
                script.into(),
                "yana-attribution-test".into(),
                marker.to_string_lossy().into_owned(),
            ],
            owner(),
        )
        .unwrap();
        for _ in 0..100 {
            if marker.is_file() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let descendant: i32 = fs::read_to_string(&marker).unwrap().trim().parse().unwrap();
        drop(governed);
        let mut alive = true;
        for _ in 0..100 {
            if unsafe { libc::kill(descendant, 0) } != 0 {
                alive = false;
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(
            !alive,
            "descendant {descendant} survived governed-child drop"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn spawn_returns_err_when_the_receipt_cannot_be_written() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        // Force record_spawn to fail: pre-create the receipts path itself
        // as a directory, so opening it as a file for append fails.
        fs::create_dir_all(root.join(RECEIPTS_RELATIVE_PATH)).unwrap();
        let result = spawn(
            &root,
            &[
                "/bin/sh".to_string(),
                "-c".to_string(),
                "exit 0".to_string(),
            ],
            owner(),
        );
        assert!(result.is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
