//! Regression tests that run the repo's REAL rules (`scanner/*.yml`) over small
//! fixture trees. They pin precision as well as detection: a correct workflow
//! or an i18n label must not raise an alert, and a genuinely unsafe one still
//! must. Rules that look at "the next N lines" are easy to get subtly wrong, and
//! a noisy self-audit trains people to ignore it (268 open alerts on the repo
//! this ships with, most of them noise).

use super::run_audit;
use std::fs;
use std::path::Path;
use tempfile::tempdir;

const RULES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/scanner");
const SHA: &str = "df4cb1c069e1874edd31b4311f1884172cec0e10";

fn write(root: &Path, rel: &str, body: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, body).unwrap();
}

/// Rule ids raised for a tree holding just `files`.
fn ids(files: &[(&str, &str)]) -> Vec<String> {
    let dir = tempdir().unwrap();
    for (rel, body) in files {
        write(dir.path(), rel, body);
    }
    let report = run_audit(dir.path().to_str().unwrap(), RULES_DIR, None, &[], None, false);
    let mut v: Vec<String> = report.findings.into_iter().map(|f| f.id).collect();
    v.sort();
    v.dedup();
    v
}

fn workflow(body: &str) -> Vec<String> {
    ids(&[(".github/workflows/w.yml", body)])
}

/// A release workflow written the way a careful maintainer would: per-job
/// permissions that sit well below `jobs:`, a deployment environment declared
/// far above the publish step, timeouts, SHA-pinned actions, and commands that
/// only appear inside comments.
fn careful_workflow() -> String {
    let filler = |n: usize| (0..n).map(|i| format!("      - run: echo step-{i}\n")).collect::<String>();
    let notes = (0..22).map(|i| format!("    # note {i}\n")).collect::<String>();
    format!(
        "name: Release\non:\n  push:\n    tags: ['v*']\n\
         # Example only: uses: actions/setup-example@v1 and `npm publish` are not live here\n\
         jobs:\n  prepare:\n    name: Prepare\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n{notes}    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout@{SHA}\n{}\n\
           publish:\n    needs: prepare\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    environment:\n      name: release\n    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout@{SHA}\n{}      # cargo publish is described in this comment only\n      - name: Publish\n        run: cargo publish\n",
        filler(3),
        filler(26)
    )
}

// ── CI rules: no false alarms on a careful workflow ─────────────────────────

#[test]
fn a_careful_workflow_raises_no_ci_alert() {
    let found = workflow(&careful_workflow());
    let ci: Vec<&String> = found.iter().filter(|id| id.starts_with("CI")).collect();
    assert!(ci.is_empty(), "false alarms on a correct workflow: {ci:?}");
}

#[test]
fn a_commented_out_unpinned_action_is_not_ci006() {
    let wf = format!("name: x\non: push\npermissions: read-all\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      # - uses: actions/checkout@v4\n      - uses: actions/checkout@{SHA}\n");
    assert!(!workflow(&wf).contains(&"CI006".to_string()));
}

// ── CI rules: real problems are still found ─────────────────────────────────

#[test]
fn an_unpinned_action_is_ci006() {
    let wf = "name: x\non: push\npermissions: read-all\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout@v4\n";
    assert!(workflow(wf).contains(&"CI006".to_string()));
}

#[test]
fn a_tag_with_a_trailing_comment_or_a_full_version_is_still_ci006() {
    for uses in ["actions/checkout@v4 # keep this", "actions/checkout@v4.1.2", "actions/checkout@main"] {
        let wf = format!("name: x\non: push\npermissions: read-all\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - uses: {uses}\n");
        assert!(workflow(&wf).contains(&"CI006".to_string()), "{uses}");
    }
}

#[test]
fn a_workflow_with_no_permissions_anywhere_is_ci007() {
    let wf = "name: x\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n";
    assert!(workflow(wf).contains(&"CI007".to_string()));
}

#[test]
fn publishing_without_any_gate_is_ci008() {
    let wf = "name: x\non: push\npermissions: read-all\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: npm publish\n";
    assert!(workflow(wf).contains(&"CI008".to_string()));
}

#[test]
fn a_job_without_a_timeout_is_ci010() {
    let wf = "name: x\non: push\npermissions: read-all\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n";
    assert!(workflow(wf).contains(&"CI010".to_string()));
}

// ── SE012: hardcoded credentials ────────────────────────────────────────────

#[test]
fn ui_labels_and_help_text_are_not_hardcoded_credentials() {
    for (rel, body) in [
        ("src/i18n.ts", "export const vi = { needsApiKey: \"Cần API key\", enterPassword: \"Nhập mật khẩu của bạn\" };\n"),
        ("src/ko.ts", "export const ko = { needsApiKey: \"API 키 필요\" };\n"),
        ("tools/mail.py", "print(\"Set it with: export GMAIL_APP_PASSWORD='your-app-password'\")\n"),
        ("src/config.ts", "const apiKey = \"<your-api-key-here>\";\nconst secret = \"changeme-before-use\";\n"),
    ] {
        assert!(!ids(&[(rel, body)]).contains(&"SE012".to_string()), "{rel} raised SE012");
    }
}

#[test]
fn a_real_looking_hardcoded_credential_is_still_se012() {
    for (rel, body) in [
        ("src/a.ts", "const password = \"s3cr3tValue99\";\n"),
        ("src/b.py", "api_key = \"sk-live-abcdefghijklmnop\"\n"),
        ("src/c.js", "const cfg = { auth_token: \"ghp_abcdefghijklmnopqrstuvwxyz0123456789\" };\n"),
    ] {
        assert!(ids(&[(rel, body)]).contains(&"SE012".to_string()), "{rel} was not flagged");
    }
}
