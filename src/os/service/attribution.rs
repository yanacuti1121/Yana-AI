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
pub fn spawn(root: &Path, argv: &[String], owner: ProcessAttribution) -> Result<GovernedChild> {
    let (program, args) = argv.split_first().context("argv must not be empty")?;
    let child = Command::new(program)
        .args(args)
        .spawn()
        .with_context(|| format!("spawning {program}"))?;
    let pid = child.id();
    let started_at_unix_secs = now_unix();
    record_spawn(root, pid, &owner, argv, started_at_unix_secs)?;
    Ok(GovernedChild {
        child,
        pid,
        owner,
        started_at_unix_secs,
    })
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

fn redact_argv(argv: &[String]) -> Vec<String> {
    argv.iter()
        .map(|token| {
            let lower = token.to_ascii_lowercase();
            if SENSITIVE_PREFIXES
                .iter()
                .any(|prefix| lower.starts_with(prefix))
                || looks_like_secret_literal(token)
            {
                REDACTED_PLACEHOLDER.to_string()
            } else {
                token.clone()
            }
        })
        .collect()
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
}
