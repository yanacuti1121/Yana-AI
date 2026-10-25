//! Harness core: keeps the agents and skills a project carries honest.
//!
//! This is the Rust core of the design in `.planning/yana-harness-core/DESIGN.md`. It holds every
//! safety invariant; any outer layer (Rust or Python) talks to it only through the versioned JSON
//! it prints (`--json`) and never the other way round. Phase 1 is read-only: nothing here writes.

pub mod audit;
#[cfg(test)]
mod audit_tests;
pub mod inventory;
#[cfg(test)]
mod inventory_tests;

use clap::Subcommand;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Findings printed per code in the human view unless `--all` is given.
const PREVIEW_PER_CODE: usize = 8;

#[derive(Subcommand)]
pub enum HarnessAction {
    /// Check the agent and skill files under `core/` and `.claude/` (read-only).
    /// Exit 0 when clean or warnings only, 1 when an error is found, 2 when the root cannot be read.
    Audit {
        /// Project root to inspect.
        #[arg(long, default_value = ".")]
        root: PathBuf,
        /// Print the report as JSON (`schema_version` 1) for CI and for outer layers.
        #[arg(long)]
        json: bool,
        /// Print every finding instead of the first few per code.
        #[arg(long)]
        all: bool,
    },
}

/// Scans and audits one project root. Shared by the CLI and the `harness.audit` capability.
pub fn audit_project(root: &Path) -> Result<audit::Report, String> {
    let root = inventory::resolve_root(root)?;
    Ok(audit::run(&inventory::scan(&root)))
}

fn print_human(report: &audit::Report, all: bool) {
    println!(
        "harness audit: {} agents, {} skills, {} errors, {} warnings",
        report.agents, report.skills, report.errors, report.warnings
    );
    let mut by_code: BTreeMap<&str, Vec<&audit::Finding>> = BTreeMap::new();
    for finding in &report.findings {
        by_code.entry(finding.code).or_default().push(finding);
    }
    for (code, group) in by_code {
        println!("\n{code}: {} finding(s)", group.len());
        for finding in group
            .iter()
            .take(if all { usize::MAX } else { PREVIEW_PER_CODE })
        {
            let place = finding.line.map_or(finding.path.clone(), |line| {
                format!("{}:{line}", finding.path)
            });
            println!(
                "  [{}] {place}: {}",
                if finding.severity == audit::Severity::Error {
                    "error"
                } else {
                    "warn"
                },
                finding.message
            );
        }
        if !all && group.len() > PREVIEW_PER_CODE {
            println!("  ... {} more (use --all)", group.len() - PREVIEW_PER_CODE);
        }
    }
    for (path, reason) in &report.skipped {
        println!("\nskipped {path}: {reason}");
    }
}

/// Runs a subcommand and returns the process exit code.
pub fn dispatch(action: HarnessAction) -> i32 {
    match action {
        HarnessAction::Audit { root, json, all } => match audit_project(&root) {
            Ok(report) => {
                if json {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&report).expect("report serializes")
                    );
                } else {
                    print_human(&report, all);
                }
                report.exit_code()
            }
            Err(error) => {
                eprintln!("harness audit: {error}");
                2
            }
        },
    }
}
