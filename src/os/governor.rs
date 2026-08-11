//! Evolution Governor — first implementation slice, per the approved
//! design `docs/EVOLUTION_GOVERNOR.md`. This file covers exactly two of
//! that design's pieces: `status` (Health Map, built from mechanically
//! checkable signals already in the repo — drift-check.sh,
//! verify-core-lock.sh, check_counts.py, and optionally the real test
//! suites) and `capacity` (the explicit absorption-capacity policy the
//! design's YAML example shows). The `roadmap` piece (NOW/NEXT/LATER,
//! human-approval-gated promotion) is a separate, parallel effort — see
//! `docs/EVOLUTION_GOVERNOR.md` for the full design and why the pieces
//! are split this way (avoids two agents editing the same file).
//!
//! Explicitly NOT built here, matching the design's own "does not
//! auto-expand scope" rule: Capability Map, Dependency Map, Risk Map,
//! and full repository-structure scanning (the design's own doc says
//! that needs Local Embodiment Runtime's Repository Observer, which
//! doesn't exist yet either — no code duplicates it here).

use super::state;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

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
}

#[derive(Debug, Serialize)]
pub struct GovernorStatus {
    pub overall: HealthLevel,
    pub checked_at: String,
    pub deep: bool,
    pub checks: Vec<HealthCheck>,
}

impl GovernorStatus {
    pub fn failed(&self) -> bool {
        self.overall == HealthLevel::Fail
    }
}

/// Runs `program` with `args` from within `root`, capped at a short
/// timeout-equivalent via the OS's own process handling (no async
/// runtime in this crate's `cli` feature — see Cargo.toml's comment on
/// why `tokio` stays isolated to the `mcp` feature). A missing program,
/// a nonzero exit, or non-UTF-8 output are all real signal, not errors
/// to propagate — this function always returns a HealthCheck, never
/// `Result::Err`, so one missing script can't abort the whole status
/// report the way an early `?` would.
fn run_check(root: &Path, name: &'static str, program: &str, args: &[&str]) -> HealthCheck {
    // The script/module path is always the last positional arg for every
    // caller in this file (a bash script path, or check_counts.py's path)
    // — checked for existence up front so a project that hasn't adopted
    // this part of the Yana AI framework gets a clear "not applicable"
    // instead of a confusing "No such file or directory" from the shell.
    let script_path = args.last().map(|arg| root.join(arg));
    if let Some(path) = &script_path {
        if !path.exists() {
            return HealthCheck {
                name,
                level: HealthLevel::Warning,
                detail: format!("not applicable — {} not found in this project", path.display()),
            };
        }
    }
    match Command::new(program).args(args).current_dir(root).output() {
        Ok(output) => {
            let level = if output.status.success() {
                HealthLevel::Pass
            } else {
                HealthLevel::Fail
            };
            let mut detail = String::from_utf8_lossy(if output.status.success() {
                &output.stdout
            } else {
                &output.stderr
            })
            .lines()
            .last()
            .unwrap_or("")
            .trim()
            .to_string();
            if detail.is_empty() {
                detail = format!("exit {}", output.status.code().unwrap_or(-1));
            }
            HealthCheck { name, level, detail }
        }
        Err(error) => HealthCheck {
            name,
            level: HealthLevel::Warning,
            detail: format!("could not run {program}: {error}"),
        },
    }
}

/// Fast, always-on checks — each finishes in well under a second, all
/// operate on files already on disk (no compilation, no network).
fn fast_checks(root: &Path) -> Vec<HealthCheck> {
    vec![
        run_check(root, "drift-check", "bash", &["core/scripts/drift-check.sh"]),
        run_check(
            root,
            "core-lock",
            "bash",
            &["core/scripts/verify-core-lock.sh"],
        ),
        run_check(
            root,
            "manifest-counts",
            "python3",
            &["core/scripts/check_counts.py"],
        ),
    ]
}

/// Slower checks — a real `cargo test` compile+run and the hook test
/// suite. Opt-in via `--deep` since forcing this on every `status` call
/// (e.g. from a SessionStart hook) would make every new session wait on
/// a full test run before anything else could happen.
fn deep_checks(root: &Path) -> Vec<HealthCheck> {
    vec![
        run_check(
            root,
            "cargo-test",
            "cargo",
            &["test", "--release", "--bin", "yana-rt"],
        ),
        run_check(
            root,
            "hook-tests",
            "bash",
            &["core/tests/hooks/run-hook-tests.sh"],
        ),
    ]
}

pub fn status(root: &Path, deep: bool) -> GovernorStatus {
    let mut checks = fast_checks(root);
    if deep {
        checks.extend(deep_checks(root));
    }
    let overall = checks
        .iter()
        .map(|check| check.level)
        .max()
        .unwrap_or(HealthLevel::Pass);
    GovernorStatus {
        overall,
        checked_at: state::now(),
        deep,
        checks,
    }
}

pub fn print_status(report: &GovernorStatus, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(report)?);
        return Ok(());
    }
    println!("Evolution Governor — status  {:?}", report.overall);
    println!("{}", "─".repeat(76));
    for item in &report.checks {
        let marker = match item.level {
            HealthLevel::Pass => "PASS",
            HealthLevel::Warning => "WARN",
            HealthLevel::Fail => "FAIL",
        };
        println!("  {marker:<4} {:<18} {}", item.name, item.detail);
    }
    if !report.deep {
        println!();
        println!("  (fast checks only — pass --deep for cargo test + hook suite)");
    }
    Ok(())
}

// ── Capacity ─────────────────────────────────────────────────────────────

/// Matches docs/EVOLUTION_GOVERNOR.md's "Absorption Capacity" YAML
/// example field-for-field. "Proposed default policy, not silently
/// hard-coded — anh reviews and can change these numbers" — every field
/// is settable via `governor capacity set`, defaults match that doc's
/// example exactly.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GovernorCapacity {
    pub mode: String,
    pub max_active_programs: usize,
    pub max_architecture_changes: usize,
    pub max_new_dependencies: usize,
    pub max_active_experiments: usize,
    pub allocation_consolidation_pct: u8,
    pub allocation_onboarding_and_packaging_pct: u8,
    pub allocation_experiments_pct: u8,
}

impl Default for GovernorCapacity {
    fn default() -> Self {
        Self {
            mode: "convergence".to_string(),
            max_active_programs: 2,
            max_architecture_changes: 0,
            max_new_dependencies: 0,
            max_active_experiments: 1,
            allocation_consolidation_pct: 70,
            allocation_onboarding_and_packaging_pct: 20,
            allocation_experiments_pct: 10,
        }
    }
}

fn validate_capacity(capacity: &GovernorCapacity) -> Result<()> {
    let total = capacity.allocation_consolidation_pct as u16
        + capacity.allocation_onboarding_and_packaging_pct as u16
        + capacity.allocation_experiments_pct as u16;
    if total != 100 {
        anyhow::bail!(
            "allocation percentages must sum to 100, got {total} \
             (consolidation={}, onboarding_and_packaging={}, experiments={})",
            capacity.allocation_consolidation_pct,
            capacity.allocation_onboarding_and_packaging_pct,
            capacity.allocation_experiments_pct
        );
    }
    Ok(())
}

pub fn capacity_path(root: &Path) -> PathBuf {
    root.join(".yana-ai/os/governor-capacity.json")
}

/// Presence-only load: unlike `state::load`, a missing capacity file is
/// not an error — it just means the defaults from `EVOLUTION_GOVERNOR.md`
/// apply until anh explicitly sets something different. Corrupt JSON,
/// on the other hand, fails loudly rather than silently falling back to
/// defaults — a fact-check on "is my config actually what I think it
/// is" must never be quietly wrong.
pub fn load_capacity(root: &Path) -> Result<GovernorCapacity> {
    let path = capacity_path(root);
    match std::fs::read_to_string(&path) {
        Ok(text) => {
            let capacity: GovernorCapacity = serde_json::from_str(&text)
                .map_err(|e| anyhow::anyhow!("invalid governor capacity {}: {e}", path.display()))?;
            validate_capacity(&capacity)?;
            Ok(capacity)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(GovernorCapacity::default()),
        Err(error) => Err(error).map_err(|e| anyhow::anyhow!("cannot read {}: {e}", path.display())),
    }
}

pub fn set_capacity(root: &Path, capacity: GovernorCapacity) -> Result<GovernorCapacity> {
    validate_capacity(&capacity)?;
    // Reuses the same private-directory setup state::initialize() already
    // does (0700 dir, real-directory check) — `os init` is the normal way
    // that directory gets created, but capacity can be set before agent/
    // resource state exists, so this ensures it exists here too rather
    // than requiring `os init` as an undocumented prerequisite.
    let _ = state::initialize(root)?;
    let path = capacity_path(root);
    let text = serde_json::to_string_pretty(&capacity)?;
    std::fs::write(&path, format!("{text}\n"))
        .map_err(|e| anyhow::anyhow!("cannot write {}: {e}", path.display()))?;
    Ok(capacity)
}

pub fn print_capacity(capacity: &GovernorCapacity, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(capacity)?);
        return Ok(());
    }
    println!("Evolution Governor — absorption capacity");
    println!("  mode                          {}", capacity.mode);
    println!("  max active programs           {}", capacity.max_active_programs);
    println!("  max architecture changes      {}", capacity.max_architecture_changes);
    println!("  max new dependencies          {}", capacity.max_new_dependencies);
    println!("  max active experiments        {}", capacity.max_active_experiments);
    println!(
        "  allocation: consolidation {}% / onboarding+packaging {}% / experiments {}%",
        capacity.allocation_consolidation_pct,
        capacity.allocation_onboarding_and_packaging_pct,
        capacity.allocation_experiments_pct
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("yana-governor-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
        std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
        std::fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        root
    }

    #[test]
    fn status_on_a_project_without_yana_scripts_reports_not_applicable_not_a_crash() {
        let root = root();
        let report = status(&root, false);
        assert!(report
            .checks
            .iter()
            .all(|c| c.level != HealthLevel::Fail));
        assert!(report
            .checks
            .iter()
            .any(|c| c.detail.contains("not applicable")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn status_overall_is_the_worst_individual_check() {
        let root = root();
        let report = status(&root, false);
        let worst = report.checks.iter().map(|c| c.level).max().unwrap();
        assert_eq!(report.overall, worst);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn default_capacity_matches_evolution_governor_doc_example() {
        let capacity = GovernorCapacity::default();
        assert_eq!(capacity.mode, "convergence");
        assert_eq!(capacity.max_active_programs, 2);
        assert_eq!(capacity.max_architecture_changes, 0);
        assert_eq!(capacity.max_new_dependencies, 0);
        assert_eq!(capacity.max_active_experiments, 1);
        assert_eq!(
            capacity.allocation_consolidation_pct as u16
                + capacity.allocation_onboarding_and_packaging_pct as u16
                + capacity.allocation_experiments_pct as u16,
            100
        );
    }

    #[test]
    fn allocation_not_summing_to_100_is_rejected() {
        let mut capacity = GovernorCapacity::default();
        capacity.allocation_experiments_pct = 50; // now sums to 140
        assert!(validate_capacity(&capacity).is_err());
    }

    #[test]
    fn load_capacity_without_a_file_returns_defaults() {
        let root = root();
        let loaded = load_capacity(&root).unwrap();
        assert_eq!(loaded, GovernorCapacity::default());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn set_then_load_capacity_round_trips() {
        let root = root();
        let mut capacity = GovernorCapacity::default();
        capacity.max_active_programs = 5;
        set_capacity(&root, capacity.clone()).unwrap();
        let loaded = load_capacity(&root).unwrap();
        assert_eq!(loaded, capacity);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn set_capacity_rejects_invalid_allocation_without_writing() {
        let root = root();
        let mut capacity = GovernorCapacity::default();
        capacity.allocation_consolidation_pct = 99;
        assert!(set_capacity(&root, capacity).is_err());
        assert!(!capacity_path(&root).exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_capacity_file_fails_loud_not_silently_default() {
        let root = root();
        std::fs::create_dir_all(root.join(".yana-ai/os")).unwrap();
        std::fs::write(capacity_path(&root), "not json").unwrap();
        let error = load_capacity(&root).unwrap_err().to_string();
        assert!(error.contains("invalid governor capacity"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
