//! Read-only aggregate management-plane health.

use super::{credential, state};
use anyhow::Result;
use chrono::Utc;
use serde::Serialize;
use std::fs;
use std::io::Read;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthLevel {
    Pass,
    Warning,
    Fail,
}

#[derive(Debug, Serialize)]
pub struct HealthCheck {
    pub name: &'static str,
    pub level: HealthLevel,
    pub detail: String,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HealthReport {
    pub overall: HealthLevel,
    pub checked_at: String,
    pub project_root: String,
    pub checks: Vec<HealthCheck>,
}

impl HealthReport {
    pub fn failed(&self) -> bool {
        self.overall == HealthLevel::Fail
    }
}

pub fn inspect(root: &Path) -> HealthReport {
    let mut checks = Vec::new();
    checks.push(protocol_check(root));

    let loaded_state = state::load(root);
    match &loaded_state {
        Ok(current) => {
            checks.push(check(
                "os-state",
                HealthLevel::Pass,
                format!("schema {} readable", current.schema_version),
                Some(state::state_path(root)),
            ));
            checks.push(check(
                "resource-policy",
                if current.resource_policy.is_some() {
                    HealthLevel::Pass
                } else {
                    HealthLevel::Warning
                },
                if current.resource_policy.is_some() {
                    "configured".to_string()
                } else {
                    "not configured; resource preflight denies".to_string()
                },
                Some(state::state_path(root)),
            ));
        }
        Err(error) => checks.push(check(
            "os-state",
            HealthLevel::Fail,
            format!(
                "unreadable: {error}; run `yana-rt os init --dir {}` if state is absent",
                root.display()
            ),
            Some(state::state_path(root)),
        )),
    }

    checks.push(ledger_check(root));
    checks.push(json_evidence_check(
        root.join("core/memory/L2_session/token-budget.json"),
        "token-budget",
    ));
    checks.push(json_evidence_check(
        root.join("core/memory/L2_session/circuit-state.json"),
        "circuit-state",
    ));
    checks.push(file_evidence_check(
        root.join(".claude/state/audit-chain.log"),
        "audit-chain",
    ));
    checks.push(provider_check());

    let overall = checks
        .iter()
        .map(|item| item.level)
        .max()
        .unwrap_or(HealthLevel::Warning);
    HealthReport {
        overall,
        checked_at: state::now(),
        project_root: root.display().to_string(),
        checks,
    }
}

fn protocol_check(root: &Path) -> HealthCheck {
    let path = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
    match yana_rt::flock_v1::protocol_is_active(root) {
        Ok(()) => check(
            "locking-protocol",
            HealthLevel::Pass,
            format!("{} active", yana_rt::flock_v1::PROTOCOL_VERSION),
            Some(path),
        ),
        Err(error) => check(
            "locking-protocol",
            HealthLevel::Fail,
            error.to_string(),
            Some(path),
        ),
    }
}

fn ledger_check(root: &Path) -> HealthCheck {
    let path = crate::cost::ledger_path_for(root);
    match crate::cost::daily_cost_usd(root, Utc::now()) {
        Ok(total) => check(
            "cost-ledger",
            HealthLevel::Pass,
            format!("strict read passed; today ${total:.6}"),
            Some(path),
        ),
        Err(error) => check(
            "cost-ledger",
            HealthLevel::Fail,
            error.to_string(),
            Some(path),
        ),
    }
}

fn json_evidence_check(path: PathBuf, name: &'static str) -> HealthCheck {
    match safe_regular_file(&path) {
        Ok(Some(text)) => match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(_) => check(
                name,
                HealthLevel::Pass,
                "readable JSON evidence".to_string(),
                Some(path),
            ),
            Err(error) => check(
                name,
                HealthLevel::Fail,
                format!("invalid JSON evidence: {error}"),
                Some(path),
            ),
        },
        Ok(None) => check(
            name,
            HealthLevel::Warning,
            "not present; no current evidence".to_string(),
            Some(path),
        ),
        Err(error) => check(name, HealthLevel::Fail, error, Some(path)),
    }
}

fn file_evidence_check(path: PathBuf, name: &'static str) -> HealthCheck {
    match safe_regular_file(&path) {
        Ok(Some(_)) => check(
            name,
            HealthLevel::Pass,
            "evidence file present; integrity not verified by doctor".to_string(),
            Some(path),
        ),
        Ok(None) => check(
            name,
            HealthLevel::Warning,
            "not present; no current evidence".to_string(),
            Some(path),
        ),
        Err(error) => check(name, HealthLevel::Fail, error, Some(path)),
    }
}

fn provider_check() -> HealthCheck {
    let inventory = credential::inventory();
    let required = inventory
        .iter()
        .filter(|item| item.credential_required)
        .count();
    let configured = inventory
        .iter()
        .filter(|item| item.credential_required && item.configured)
        .count();
    let local = inventory
        .iter()
        .filter(|item| !item.credential_required)
        .count();
    check(
        "providers",
        HealthLevel::Pass,
        format!(
            "{configured}/{required} credential-gated configured; {local} keyless local; availability not-probed"
        ),
        None,
    )
}

fn safe_regular_file(path: &Path) -> std::result::Result<Option<String>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("cannot inspect {}: {error}", path.display())),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "evidence must be a regular file: {}",
            path.display()
        ));
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = options
        .open(path)
        .map_err(|error| format!("cannot open {}: {error}", path.display()))?;
    if !file
        .metadata()
        .map_err(|error| format!("cannot inspect open evidence {}: {error}", path.display()))?
        .is_file()
    {
        return Err(format!(
            "evidence must remain a regular file: {}",
            path.display()
        ));
    }
    let mut text = String::new();
    file.read_to_string(&mut text)
        .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    Ok(Some(text))
}

fn check(
    name: &'static str,
    level: HealthLevel,
    detail: String,
    path: Option<PathBuf>,
) -> HealthCheck {
    HealthCheck {
        name,
        level,
        detail,
        path: path.map(|item| item.display().to_string()),
    }
}

pub fn print(report: &HealthReport, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(report)?);
        return Ok(());
    }
    println!("Yana OS doctor  {:?}", report.overall);
    println!("{}", "─".repeat(76));
    for item in &report.checks {
        let marker = match item.level {
            HealthLevel::Pass => "PASS",
            HealthLevel::Warning => "WARN",
            HealthLevel::Fail => "FAIL",
        };
        println!("  {marker:<4} {:<20} {}", item.name, item.detail);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("yana-os-health-{}", Uuid::new_v4()))
    }

    #[test]
    fn missing_state_is_reported_without_creating_it() {
        let root = root();
        fs::create_dir_all(&root).unwrap();
        let report = inspect(&root);
        assert!(report.failed());
        assert!(!state::state_path(&root).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn initialized_state_is_truthful_about_unprobed_providers() {
        let root = root();
        let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        state::initialize(&root).unwrap();
        let report = inspect(&root);
        assert!(!report.failed());
        let providers = report
            .checks
            .iter()
            .find(|item| item.name == "providers")
            .unwrap();
        assert!(providers.detail.contains("not-probed"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_guard_evidence_fails_loud() {
        let root = root();
        let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        state::initialize(&root).unwrap();
        let budget = root.join("core/memory/L2_session/token-budget.json");
        fs::create_dir_all(budget.parent().unwrap()).unwrap();
        fs::write(&budget, "not-json").unwrap();
        let report = inspect(&root);
        assert!(report.failed());
        assert!(report
            .checks
            .iter()
            .any(|item| item.name == "token-budget" && item.level == HealthLevel::Fail));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_evidence_fails_loud() {
        use std::os::unix::fs::symlink;

        let root = root();
        let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        state::initialize(&root).unwrap();
        let budget = root.join("core/memory/L2_session/token-budget.json");
        fs::create_dir_all(budget.parent().unwrap()).unwrap();
        let target = root.join("outside-evidence");
        fs::write(&target, "{}").unwrap();
        symlink(&target, &budget).unwrap();
        let report = inspect(&root);
        assert!(report.failed());
        assert!(report
            .checks
            .iter()
            .any(|item| item.name == "token-budget" && item.level == HealthLevel::Fail));
        fs::remove_dir_all(root).unwrap();
    }
}
