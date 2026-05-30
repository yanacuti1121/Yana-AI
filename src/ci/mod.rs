use anyhow::Result;
use clap::Subcommand;
use regex::Regex;
use walkdir::WalkDir;

#[derive(Subcommand, Debug)]
pub enum CiAction {
    /// Check CI/CD workflows for security and reliability issues
    Check {
        #[arg(default_value = ".")] target: String,
        #[arg(long)] json: bool,
    },
}

pub fn dispatch(action: CiAction) {
    let result = match action {
        CiAction::Check { target, json } => cmd_ci_check(&target, json),
    };
    if let Err(e) = result {
        eprintln!("[ci] error: {e}");
        std::process::exit(1);
    }
}

#[derive(Debug, serde::Serialize)]
struct CiFinding {
    file:     String,
    line:     usize,
    id:       String,
    severity: String,
    message:  String,
    fix:      String,
}

fn cmd_ci_check(target: &str, as_json: bool) -> Result<()> {
    let workflows = find_workflows(target);
    if workflows.is_empty() {
        println!("\n  [ci] No workflows found in .github/workflows/\n");
        return Ok(());
    }

    let mut all: Vec<CiFinding> = Vec::new();
    for wf in &workflows {
        all.extend(check_workflow(wf));
    }

    if as_json {
        println!("{}", serde_json::to_string_pretty(&all)?);
        return Ok(());
    }

    println!("\n  CI Check — {} workflow(s)\n", workflows.len());
    if all.is_empty() {
        println!("  \x1b[32m✓ No issues found\x1b[0m\n");
        return Ok(());
    }

    let mut by_sev = [("CRITICAL", vec![]), ("HIGH", vec![]), ("MEDIUM", vec![]), ("LOW", vec![])];
    for f in &all {
        if let Some((_, v)) = by_sev.iter_mut().find(|(s, _)| *s == f.severity) { v.push(f); }
    }
    for (sev, items) in &by_sev {
        if items.is_empty() { continue; }
        let color = match *sev { "CRITICAL" | "HIGH" => "\x1b[31m", "MEDIUM" => "\x1b[33m", _ => "\x1b[36m" };
        println!("  {}── {} ──\x1b[0m", color, sev);
        for f in items {
            println!("  {}[{}]\x1b[0m {}:{} — {}", color, f.id, f.file, f.line, f.message);
            if !f.fix.is_empty() { println!("      fix: {}", f.fix); }
        }
        println!();
    }
    println!("  {} finding(s) in {} workflow(s)\n", all.len(), workflows.len());
    Ok(())
}

fn find_workflows(target: &str) -> Vec<String> {
    let wf_dir = std::path::Path::new(target).join(".github/workflows");
    if !wf_dir.exists() { return vec![]; }
    WalkDir::new(wf_dir).into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension().and_then(|x| x.to_str()).unwrap_or("");
            ext == "yml" || ext == "yaml"
        })
        .map(|e| e.path().to_string_lossy().to_string())
        .collect()
}

fn check_workflow(path: &str) -> Vec<CiFinding> {
    let content = match std::fs::read_to_string(path) { Ok(c) => c, Err(_) => return vec![] };
    let rel = path.rsplit('/').take(3).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("/");
    let mut findings = Vec::new();

    for (i, line) in content.lines().enumerate() {
        let ln = i + 1;
        let trimmed = line.trim();

        // CI001 — hardcoded secret
        if Regex::new(r#"(?i)(api[_-]?key|secret|token|password)\s*:\s*[a-zA-Z0-9_]{20,}"#).unwrap().is_match(trimmed)
            && !trimmed.contains("${{") && !trimmed.contains("secrets.") {
            findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI001".into(),
                severity: "CRITICAL".into(), message: "Possible hardcoded secret in workflow".into(),
                fix: "Use ${{ secrets.MY_SECRET }} instead".into() });
        }

        // CI002 — unpinned action (uses: owner/action@v1 not SHA)
        if trimmed.starts_with("uses:") {
            let uses = trimmed.trim_start_matches("uses:").trim();
            if !uses.starts_with("./") && !uses.contains('@') {
                findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI002".into(),
                    severity: "HIGH".into(), message: format!("Unpinned action: {}", uses),
                    fix: "Pin to a specific SHA: uses: action/name@sha256:...".into() });
            } else if uses.contains('@') {
                let tag = uses.split('@').nth(1).unwrap_or("");
                if !tag.starts_with("sha256:") && !tag.contains("abcdef1234567890") && tag.len() != 40 {
                    // floating tag like @v3, @main
                    if tag.starts_with('v') || tag == "main" || tag == "master" {
                        findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI003".into(),
                            severity: "MEDIUM".into(), message: format!("Floating action tag: @{}", tag),
                            fix: "Pin to full SHA for reproducibility".into() });
                    }
                }
            }
        }

        // CI004 — missing timeout-minutes on job
        if trimmed.starts_with("runs-on:") && !content.contains("timeout-minutes:") {
            findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI004".into(),
                severity: "MEDIUM".into(), message: "No timeout-minutes set (jobs can run forever)".into(),
                fix: "Add: timeout-minutes: 30".into() });
        }

        // CI005 — pull_request_target without explicit permissions
        if trimmed.contains("pull_request_target") && !content.contains("permissions:") {
            findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI005".into(),
                severity: "HIGH".into(), message: "pull_request_target without explicit permissions (PWNED risk)".into(),
                fix: "Add permissions: block with minimal required scopes".into() });
        }

        // CI006 — workflow_dispatch or push to main without environment gate
        if (trimmed.contains("npm publish") || trimmed.contains("cargo publish") || trimmed.contains("gh release"))
            && !content.contains("environment:") {
            findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI006".into(),
                severity: "HIGH".into(), message: "Publish step without environment gate".into(),
                fix: "Add: environment: production".into() });
        }

        // CI007 — shell injection via ${{ github.event }}
        if Regex::new(r#"\$\{\{\s*github\.event\.(issue|pull_request|comment)\.body"#).unwrap().is_match(trimmed) {
            findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI007".into(),
                severity: "CRITICAL".into(), message: "Potential shell injection via event body".into(),
                fix: "Never use event.body directly in run: steps".into() });
        }

        // CI008 — curl | bash in workflow
        if Regex::new(r#"curl[^|]*\|\s*(bash|sh)"#).unwrap().is_match(trimmed) {
            findings.push(CiFinding { file: rel.clone(), line: ln, id: "CI008".into(),
                severity: "HIGH".into(), message: "curl pipe to shell (supply chain risk)".into(),
                fix: "Download script separately, verify hash, then execute".into() });
        }
    }
    findings
}
