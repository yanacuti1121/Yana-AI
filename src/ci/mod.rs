use anyhow::Result;
use clap::Subcommand;
use regex::Regex;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static UNPINNED_ACTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"uses:\s+([^\s]+)").expect("valid action regex"));
static AUTO_MERGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)auto.merge|automerge").expect("valid auto-merge regex"));
static CONTENTS_WRITE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"contents:\s*write").expect("valid permissions regex"));
static SECRET_ENV: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"env:.*\n.*\$\{\{\s*secrets\.\w+\s*\}\}").expect("valid secret regex")
});

#[derive(Subcommand, Debug)]
pub enum CiAction {
    /// Check CI/CD workflows for security and reliability issues
    Check {
        #[arg(default_value = ".")]
        target: String,
        #[arg(long)]
        json: bool,
        #[arg(long, value_parser = ["fail", "warn", "info"], default_value = "fail")]
        fail_on: String,
    },
}

pub fn dispatch(action: CiAction) {
    let result = match action {
        CiAction::Check {
            target,
            json,
            fail_on,
        } => cmd_ci_check(&target, json, &fail_on),
    };
    match result {
        Ok(0) => {}
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("[ci] error: {error}");
            std::process::exit(1);
        }
    }
}

#[derive(Debug, Serialize)]
struct CiFinding {
    id: String,
    level: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(rename = "msg")]
    message: String,
    fix: String,
}

#[derive(Serialize)]
struct CiReport<'a> {
    target: &'a str,
    status: &'static str,
    checks: &'a [CiFinding],
}

struct Workflow {
    path: PathBuf,
    name: String,
    content: String,
}

fn finding(
    id: &str,
    level: &str,
    file: Option<&str>,
    message: impl Into<String>,
    fix: impl Into<String>,
) -> CiFinding {
    CiFinding {
        id: id.into(),
        level: level.into(),
        file: file.map(str::to_owned),
        message: message.into(),
        fix: fix.into(),
    }
}

fn cmd_ci_check(target: &str, as_json: bool, fail_on: &str) -> Result<i32> {
    let findings = check_target(target);
    let status = overall(&findings);

    if as_json {
        println!(
            "{}",
            serde_json::to_string_pretty(&CiReport {
                target,
                status,
                checks: &findings,
            })?
        );
    } else {
        print_report(target, status, &findings);
    }

    Ok(if level_rank(status) <= level_rank(fail_on) {
        1
    } else {
        0
    })
}

fn check_target(target: &str) -> Vec<CiFinding> {
    let workflow_dir = Path::new(target).join(".github/workflows");
    if !workflow_dir.exists() {
        return vec![finding(
            "CI-SETUP-001",
            "WARN",
            None,
            "No .github/workflows/ directory found",
            "Add yana-ai-audit.yml CI workflow",
        )];
    }

    let paths = workflow_paths(&workflow_dir);
    if paths.is_empty() {
        return vec![finding(
            "CI-SETUP-002",
            "WARN",
            None,
            "No workflow files found in .github/workflows/",
            "Add at least one CI workflow",
        )];
    }

    let workflows: Vec<_> = paths
        .into_iter()
        .filter_map(|path| {
            let content = std::fs::read_to_string(&path).ok()?;
            let name = path.file_name()?.to_string_lossy().into_owned();
            Some(Workflow {
                path,
                name,
                content,
            })
        })
        .collect();

    let mut findings = check_workflows(&workflows);
    findings.extend(check_branch_protection_hints(&workflows));
    findings
}

fn workflow_paths(workflow_dir: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = match std::fs::read_dir(workflow_dir) {
        Ok(entries) => entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| {
                path.is_file()
                    && matches!(
                        path.extension().and_then(|extension| extension.to_str()),
                        Some("yml" | "yaml")
                    )
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    paths.sort();
    paths
}

fn check_workflows(workflows: &[Workflow]) -> Vec<CiFinding> {
    let mut findings = Vec::new();
    let mut has_yana_ai_audit = false;

    for workflow in workflows {
        let name = workflow.name.as_str();
        let content = workflow.content.as_str();
        if content.contains("yana-ai") && content.contains("audit") {
            has_yana_ai_audit = true;
        }
        if !content.contains("permissions:") {
            findings.push(finding(
                "CI-PERM-001",
                "WARN",
                Some(name),
                format!("{name}: no permissions block — inherits max token permissions"),
                "Add 'permissions: contents: read' at workflow level",
            ));
        }

        let unpinned: Vec<_> = UNPINNED_ACTION
            .captures_iter(content)
            .filter_map(|capture| capture.get(1).map(|value| value.as_str()))
            .filter(|value| {
                let Some((action, reference)) = value.split_once('@') else {
                    return false;
                };
                !action.is_empty()
                    && !reference.is_empty()
                    && !(reference.len() == 40
                        && reference.bytes().all(|byte| byte.is_ascii_hexdigit()))
            })
            .collect();
        if !unpinned.is_empty() {
            findings.push(finding(
                "CI-PIN-001",
                "WARN",
                Some(name),
                format!(
                    "{name}: {} unpinned action(s): {}",
                    unpinned.len(),
                    unpinned
                        .iter()
                        .take(3)
                        .copied()
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                "Pin actions to full commit SHA",
            ));
        }
        if !content.contains("timeout-minutes:") {
            findings.push(finding(
                "CI-TIMEOUT-001",
                "INFO",
                Some(name),
                format!("{name}: no timeout-minutes — runaway jobs waste credits"),
                "Add timeout-minutes: 30 to each job",
            ));
        }
        if AUTO_MERGE.is_match(content) {
            findings.push(finding(
                "CI-GATE-001",
                "FAIL",
                Some(name),
                format!("{name}: auto-merge enabled — no human approval gate"),
                "Remove auto-merge or add required reviewers gate",
            ));
        }
        if content.contains("pull_request_target") && CONTENTS_WRITE.is_match(content) {
            findings.push(finding(
                "CI-GATE-002",
                "FAIL",
                Some(name),
                format!("{name}: pull_request_target + write access — fork exfiltration risk"),
                "Use pull_request trigger instead, or remove write permissions",
            ));
        }
        if SECRET_ENV.is_match(content) {
            findings.push(finding(
                "CI-SECRET-001",
                "WARN",
                Some(name),
                format!("{name}: secret passed via env — ensure not echoed in logs"),
                "Never echo env vars containing secrets",
            ));
        }
        if content.contains("yana-ai")
            && !content.contains("fail-on")
            && !content.contains("fail_on")
        {
            findings.push(finding(
                "CI-AUDIT-001",
                "WARN",
                Some(name),
                format!("{name}: yana-ai used but --fail-on not set — audit won't gate the build"),
                "Add --fail-on high to yana-ai audit step",
            ));
        }
    }

    if !has_yana_ai_audit {
        findings.push(finding(
            "CI-AUDIT-002",
            "WARN",
            None,
            "No yana-ai audit step found in any workflow",
            "Copy .github/workflows/yana-ai-audit.yml into your repo",
        ));
    }
    findings
}

fn check_branch_protection_hints(workflows: &[Workflow]) -> Vec<CiFinding> {
    let has_status_check = workflows.iter().any(|workflow| {
        workflow
            .path
            .extension()
            .and_then(|extension| extension.to_str())
            == Some("yml")
            && (workflow.content.contains("required_status_checks")
                || workflow.content.contains("status_check"))
    });
    if has_status_check {
        Vec::new()
    } else {
        vec![finding(
            "CI-BRANCH-001",
            "INFO",
            None,
            "No required status checks configured (check GitHub branch protection settings)",
            "Enable branch protection: require status checks before merging",
        )]
    }
}

fn overall(findings: &[CiFinding]) -> &'static str {
    ["FAIL", "WARN", "INFO"]
        .into_iter()
        .find(|level| findings.iter().any(|finding| finding.level == *level))
        .unwrap_or("PASS")
}

fn level_rank(level: &str) -> u8 {
    match level.to_ascii_uppercase().as_str() {
        "FAIL" => 0,
        "WARN" => 1,
        "INFO" => 2,
        _ => 3,
    }
}

fn print_report(target: &str, status: &str, findings: &[CiFinding]) {
    println!("\n  Yana AI CI Health Check");
    println!("  Target: {target}\n");
    println!("  Status: {status}\n");
    if findings.is_empty() {
        println!("  ✓ All CI checks passed\n");
        return;
    }
    for finding in findings {
        println!("  [{}] {}", finding.id, finding.message);
        println!("       Fix: {}\n", finding.fix);
    }
    let fail = findings
        .iter()
        .filter(|finding| finding.level == "FAIL")
        .count();
    let warn = findings
        .iter()
        .filter(|finding| finding.level == "WARN")
        .count();
    let info = findings
        .iter()
        .filter(|finding| finding.level == "INFO")
        .count();
    println!("  Summary: {fail} fail · {warn} warn · {info} info\n");
}
