//! End-to-end tests for `yana-rt harness audit`: the real binary, exit codes and the JSON contract
//! an outer layer (CI, a Python script) relies on.

use serde_json::Value;
use std::fs;
use std::path::Path;
use std::process::{Command, Output};

fn write(dir: &Path, rel: &str, body: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

fn audit(root: &Path, extra: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_yana-rt"))
        .args(["harness", "audit", "--root"])
        .arg(root)
        .args(extra)
        .output()
        .expect("run yana-rt harness audit")
}

fn json(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).expect("stdout is the JSON report")
}

#[test]
fn a_clean_project_exits_zero_with_a_stable_json_report() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/agents/a.md",
        "---\nname: a\ndescription: d\ntools: Read\n---\n",
    );
    let output = audit(dir.path(), &["--json"]);
    assert_eq!(output.status.code(), Some(0));
    let report = json(&output);
    assert_eq!(report["schema_version"], 1);
    assert_eq!(
        (report["agents"].as_u64(), report["errors"].as_u64()),
        (Some(1), Some(0))
    );
    assert!(report["findings"].as_array().unwrap().is_empty());
}

#[test]
fn an_error_finding_exits_one_and_names_the_file_and_line() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/skills/team/SKILL.md",
        "---\nname: team\ndescription: d\n---\nCall TeamCreate.\n",
    );
    let output = audit(dir.path(), &["--json"]);
    assert_eq!(output.status.code(), Some(1));
    let finding = &json(&output)["findings"][0];
    assert_eq!(
        (finding["code"].as_str(), finding["line"].as_u64()),
        (Some("H002"), Some(5))
    );
    assert_eq!(finding["path"], "core/skills/team/SKILL.md");
}

#[test]
fn warnings_alone_still_exit_zero() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/agents/x-auditor.md",
        "---\nname: x-auditor\ndescription: d\ntools: Read, Write\n---\n",
    );
    let output = audit(dir.path(), &[]);
    assert_eq!(output.status.code(), Some(0));
    assert!(String::from_utf8_lossy(&output.stdout).contains("H003"));
}

#[test]
fn a_root_that_does_not_exist_exits_two_and_writes_nothing_to_stdout() {
    let output = audit(Path::new("/definitely/not/a/real/root"), &["--json"]);
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("harness audit"));
}

#[test]
fn the_audit_never_writes_into_the_project() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/agents/a.md",
        "---\nname: a\ndescription: d\n---\n",
    );
    let before: Vec<_> = walk(dir.path());
    audit(dir.path(), &["--json", "--all"]);
    assert_eq!(walk(dir.path()), before);
}

fn walk(dir: &Path) -> Vec<(String, u64)> {
    let mut found = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in fs::read_dir(&current).unwrap().flatten() {
            let meta = entry.metadata().unwrap();
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                found.push((entry.path().display().to_string(), meta.len()));
            }
        }
    }
    found.sort();
    found
}
