use serde_json::Value;
use std::path::Path;
use std::process::{Command, Output};
use tempfile::TempDir;

fn run(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_yana-rt"))
        .args(args)
        .current_dir(root)
        .output()
        .expect("run yana-rt")
}

fn json(output: &Output) -> Value {
    assert!(
        output.status.success(),
        "command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).expect("valid JSON output")
}

fn create(root: &Path, title: &str, attention: &str) -> String {
    let output = run(
        root,
        &[
            "workspace",
            "create",
            "task",
            title,
            "--body",
            "source context",
            "--attention",
            attention,
        ],
    );
    json(&output)["data"]["block"]["id"]
        .as_str()
        .unwrap()
        .to_string()
}

#[test]
fn workspace_persists_links_and_search_across_processes() {
    let root = TempDir::new().unwrap();
    let task = create(root.path(), "Ship workspace", "signal");
    let message = create(root.path(), "Source discussion", "review");
    assert!(run(
        root.path(),
        &["workspace", "link", &task, &message, "originated_from"],
    )
    .status
    .success());

    let shown = run(root.path(), &["workspace", "show", &task[..8]]);
    let stdout = String::from_utf8_lossy(&shown.stdout);
    assert!(shown.status.success());
    assert!(stdout.contains("Source discussion"));
    assert!(stdout.contains("originated_from"));

    let searched = run(root.path(), &["workspace", "search", "discussion"]);
    assert!(searched.status.success());
    assert!(String::from_utf8_lossy(&searched.stdout).contains("Source discussion"));
}

#[test]
fn workspace_memory_and_markdown_export_are_source_transparent() {
    let root = TempDir::new().unwrap();
    let decision = create(root.path(), "Architecture decision", "signal");
    let evidence = create(root.path(), "Verification evidence", "review");
    let remembered = run(
        root.path(),
        &[
            "workspace",
            "remember",
            "Workspace foundation",
            &decision,
            &evidence,
        ],
    );
    let memory_id = json(&remembered)["data"]["memory"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    assert!(run(root.path(), &["workspace", "export"]).status.success());
    let memory = std::fs::read_to_string(
        root.path()
            .join(".yana-ai/workspace/export")
            .join(format!("{memory_id}.md")),
    )
    .unwrap();
    assert!(memory.contains("deterministic-source-summary"));
    assert!(memory.contains(&decision));
    assert!(memory.contains(&evidence));
}

#[test]
fn autonomy_ladder_requires_explicit_human_only_at_critical_tier() {
    let root = TempDir::new().unwrap();
    let task = create(root.path(), "External operation", "signal");
    let high = json(&run(
        root.path(),
        &[
            "workspace",
            "action",
            "request",
            &task,
            "update staging",
            "--risk",
            "high",
            "--actor",
            "agent:operator",
        ],
    ));
    assert_eq!(high["data"]["action"]["status"], "auto_approved");

    let critical = json(&run(
        root.path(),
        &[
            "workspace",
            "action",
            "request",
            &task,
            "mutate production",
            "--risk",
            "critical",
            "--actor",
            "agent:operator",
        ],
    ));
    let action_id = critical["data"]["action"]["id"].as_str().unwrap();
    assert_eq!(critical["data"]["action"]["status"], "pending_human");

    let denied = run(
        root.path(),
        &[
            "workspace",
            "action",
            "approve",
            action_id,
            "--approver",
            "agent:operator",
        ],
    );
    assert!(!denied.status.success());

    let approved = run(
        root.path(),
        &[
            "workspace",
            "action",
            "approve",
            action_id,
            "--approver",
            "human:tam",
        ],
    );
    assert!(approved.status.success());
}
