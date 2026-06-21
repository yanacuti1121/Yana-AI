//! Verify that ported code under `core/lib/*_adapted/` has matching vendored
//! upstream source and an attribution header (Origin/License) on every file.
//!
//! Companion to `slsa-artifact-law.md` and `44-supply-chain-vetting.md`, which
//! require provenance for anything ported into the repo but don't have an
//! automated check. This closes that gap for the Hermes-style porting
//! convention used by core/lib/{hermes,openclaw,dgm,penpot,serve_sim}_adapted.

use clap::Subcommand;
use std::fs;
use std::path::Path;

#[derive(Subcommand, Debug)]
pub enum ProvenanceAction {
    /// Check core/lib/*_adapted/ modules for vendor source + attribution headers
    Check {
        #[arg(default_value = ".")]
        target: String,
        #[arg(long)]
        json: bool,
    },
}

pub fn dispatch(action: ProvenanceAction) {
    match action {
        ProvenanceAction::Check { target, json } => cmd_check(&target, json),
    }
}

enum Severity {
    Fail,
    Warn,
}

struct Finding {
    severity: Severity,
    item: String,
    detail: String,
    fix: String,
}

impl Finding {
    fn fail(item: impl Into<String>, detail: impl Into<String>, fix: impl Into<String>) -> Self {
        Self { severity: Severity::Fail, item: item.into(), detail: detail.into(), fix: fix.into() }
    }
    fn warn(item: impl Into<String>, detail: impl Into<String>, fix: impl Into<String>) -> Self {
        Self { severity: Severity::Warn, item: item.into(), detail: detail.into(), fix: fix.into() }
    }
    fn icon(&self) -> &str {
        match self.severity { Severity::Fail => "✗", Severity::Warn => "⚠" }
    }
    fn color_code(&self) -> &str {
        match self.severity { Severity::Fail => "\x1b[31m", Severity::Warn => "\x1b[33m" }
    }
}

/// Keep only ascii-alphanumeric chars, lowercased — collapses "serve-sim" /
/// "serve_sim" / "ServeSim" to the same comparable stem.
fn normalize(name: &str) -> String {
    name.chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_lowercase()).collect()
}

fn list_dirs(path: &Path) -> Vec<String> {
    fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default()
}

fn has_license_file(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .any(|e| e.file_name().to_string_lossy().to_ascii_uppercase().starts_with("LICENSE"))
        })
        .unwrap_or(false)
}

fn find_vendor_match(adapted_stem: &str, vendor_dirs: &[String]) -> Option<String> {
    let target = normalize(adapted_stem);
    vendor_dirs
        .iter()
        .find(|v| {
            let v_norm = normalize(v);
            !v_norm.is_empty() && (target.starts_with(&v_norm) || v_norm.starts_with(&target))
        })
        .cloned()
}

fn check_attribution_header(py_file: &Path) -> Option<(bool, bool)> {
    let content = fs::read_to_string(py_file).ok()?;
    let head: String = content.lines().take(40).collect::<Vec<_>>().join("\n");
    Some((head.contains("Origin:"), head.contains("License:")))
}

fn cmd_check(target: &str, as_json: bool) {
    let root = Path::new(target);
    let lib_dir = root.join("core").join("lib");
    let vendor_dir = root.join("vendor");

    let vendor_dirs = list_dirs(&vendor_dir);
    let adapted_dirs: Vec<String> =
        list_dirs(&lib_dir).into_iter().filter(|d| d.ends_with("_adapted")).collect();

    let mut findings: Vec<Finding> = Vec::new();
    let mut modules_checked = 0usize;
    let mut files_checked = 0usize;

    for adapted in &adapted_dirs {
        modules_checked += 1;
        let stem = adapted.trim_end_matches("_adapted");
        let adapted_path = lib_dir.join(adapted);

        match find_vendor_match(stem, &vendor_dirs) {
            Some(vendor_name) => {
                let upstream_dir = vendor_dir.join(&vendor_name).join("_upstream");
                if !upstream_dir.is_dir() {
                    findings.push(Finding::fail(
                        format!("core/lib/{adapted}"),
                        format!("matched vendor/{vendor_name} but no _upstream/ subdir"),
                        format!("Create vendor/{vendor_name}/_upstream/ with the original source + LICENSE"),
                    ));
                } else if !has_license_file(&upstream_dir) {
                    findings.push(Finding::warn(
                        format!("vendor/{vendor_name}/_upstream"),
                        "no LICENSE file found",
                        "Vendor the upstream LICENSE alongside the source files",
                    ));
                }
            }
            None => {
                findings.push(Finding::fail(
                    format!("core/lib/{adapted}"),
                    "no matching vendor/<name>/_upstream/ source directory",
                    format!("Vendor the original source into vendor/{stem}/_upstream/"),
                ));
            }
        }

        let py_files = fs::read_dir(&adapted_path)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| p.extension().is_some_and(|ext| ext == "py"))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        for py_file in py_files {
            files_checked += 1;
            let file_label = format!(
                "core/lib/{adapted}/{}",
                py_file.file_name().unwrap_or_default().to_string_lossy()
            );
            match check_attribution_header(&py_file) {
                Some((true, true)) => {}
                Some((has_origin, has_license)) => {
                    let missing = match (has_origin, has_license) {
                        (false, false) => "Origin: and License:",
                        (false, true) => "Origin:",
                        (true, false) => "License:",
                        _ => unreachable!(),
                    };
                    findings.push(Finding::warn(
                        file_label,
                        format!("module docstring missing {missing}"),
                        "Add an Origin:/License: line to the module docstring (see other *_adapted files for the pattern)",
                    ));
                }
                None => {
                    findings.push(Finding::warn(file_label, "could not read file", ""));
                }
            }
        }
    }

    if as_json {
        let out: Vec<_> = findings
            .iter()
            .map(|f| {
                serde_json::json!({
                    "severity": match f.severity { Severity::Fail => "fail", Severity::Warn => "warn" },
                    "item": f.item,
                    "detail": f.detail,
                    "fix": f.fix,
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&serde_json::json!({
                "modules_checked": modules_checked,
                "files_checked": files_checked,
                "findings": out,
            }))
            .unwrap()
        );
        return;
    }

    println!("\n  yana-ai provenance check\n");
    println!("  {modules_checked} adapted module(s), {files_checked} file(s) checked\n");

    let mut fails = 0usize;
    let mut warns = 0usize;
    for f in &findings {
        println!("  {}{}  {}\x1b[0m  {}", f.color_code(), f.icon(), f.item, f.detail);
        if !f.fix.is_empty() {
            println!("        → {}", f.fix);
        }
        match f.severity { Severity::Fail => fails += 1, Severity::Warn => warns += 1 }
    }

    println!();
    if fails > 0 {
        println!("  \x1b[31m{fails} finding(s) failed\x1b[0m, {warns} warning(s)\n");
        std::process::exit(1);
    } else if warns > 0 {
        println!("  \x1b[33mAll provenance checks pass with {warns} warning(s)\x1b[0m\n");
    } else {
        println!("  \x1b[32mAll provenance checks passed\x1b[0m\n");
    }
}
