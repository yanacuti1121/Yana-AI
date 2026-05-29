/// Integration tests for yamtam-rt: bus, memory, plugin shell parsing
///
/// Each test runs in an isolated tmpdir via the binary CLI so real file I/O
/// is exercised end-to-end.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn bin() -> PathBuf {
    let mut p = std::env::current_exe().unwrap();
    p.pop(); p.pop(); // target/debug/deps → target
    p.push("yamtam-rt");
    p
}

fn tmpdir() -> tempfile::TempDir {
    tempfile::tempdir().expect("create tmpdir")
}

fn run(dir: &std::path::Path, args: &[&str]) -> (String, String, bool) {
    let out = Command::new(bin())
        .args(args)
        .current_dir(dir)
        .output()
        .expect("run yamtam-rt");
    (
        String::from_utf8_lossy(&out.stdout).to_string(),
        String::from_utf8_lossy(&out.stderr).to_string(),
        out.status.success(),
    )
}

// ── Bus tests ─────────────────────────────────────────────────────────────────

#[test]
fn bus_emit_creates_jsonl() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &[
        "bus", "emit", "planner", "executor", "task.assign", r#"{"task":"test"}"#,
    ]);
    assert!(ok, "emit should succeed");
    assert!(stdout.contains("emitted"), "should print emitted");

    let bus_file = dir.path().join(".yamtam").join("bus.jsonl");
    assert!(bus_file.exists(), "bus.jsonl should be created");
    let content = fs::read_to_string(&bus_file).unwrap();
    assert!(content.contains("task.assign"), "event type in bus");
    assert!(content.contains("planner"), "from field in bus");
}

#[test]
fn bus_emit_auto_logs_to_l3() {
    let dir = tmpdir();
    run(dir.path(), &[
        "bus", "emit", "agent-a", "*", "broadcast", r#"{"msg":"hello"}"#,
    ]);
    let l3_file = dir.path().join(".yamtam").join("l3.jsonl");
    assert!(l3_file.exists(), "L3 auto-log should be created on emit");
    let content = fs::read_to_string(&l3_file).unwrap();
    assert!(content.contains("bus:"), "L3 key should start with bus:");
    assert!(content.contains("broadcast"), "event type tag in L3");
}

#[test]
fn bus_read_filters_by_agent() {
    let dir = tmpdir();
    run(dir.path(), &["bus", "emit", "alpha", "beta", "x", r#"{}"#]);
    run(dir.path(), &["bus", "emit", "gamma", "delta", "y", r#"{}"#]);
    let (stdout, _, _) = run(dir.path(), &["bus", "read", "--agent", "alpha"]);
    assert!(stdout.contains("alpha"), "should show alpha events");
}

#[test]
fn bus_reply_links_to_original() {
    let dir = tmpdir();
    run(dir.path(), &["bus", "emit", "a", "b", "req", r#"{"q":"?"}"#]);
    let (read_out, _, _) = run(dir.path(), &["bus", "read"]);
    // Extract 8-char ID from first line of table
    let id = read_out.lines()
        .find(|l| l.len() > 10 && l.chars().next().map(|c| c.is_ascii_hexdigit()).unwrap_or(false))
        .and_then(|l| l.split_whitespace().next())
        .unwrap_or("00000000");
    let (_, _, ok) = run(dir.path(), &["bus", "reply", id, "b", r#"{"a":"!"}"#]);
    assert!(ok, "reply should succeed");
    let (replies, _, _) = run(dir.path(), &["bus", "read", "--reply-to", id]);
    assert!(replies.contains("reply"), "reply event visible");
}

#[test]
fn bus_inbox_shows_addressed_messages() {
    let dir = tmpdir();
    run(dir.path(), &["bus", "emit", "x", "myagent", "ping", r#"{}"#]);
    run(dir.path(), &["bus", "emit", "x", "*", "broadcast", r#"{}"#]);
    run(dir.path(), &["bus", "emit", "x", "other", "nope", r#"{}"#]);
    let (inbox, _, _) = run(dir.path(), &["bus", "inbox", "myagent"]);
    assert!(inbox.contains("ping"), "direct message in inbox");
    assert!(inbox.contains("broadcast"), "broadcast in inbox");
    assert!(!inbox.contains("nope"), "other agent message not in inbox");
}

// ── Memory tests ──────────────────────────────────────────────────────────────

#[test]
fn memory_store_and_get() {
    let dir = tmpdir();
    let (_, _, ok) = run(dir.path(), &[
        "memory", "store", "test.key", "hello world",
        "--tag", "test", "--confidence", "high",
    ]);
    assert!(ok, "store should succeed");
    let (get_out, _, ok2) = run(dir.path(), &["memory", "get", "test.key"]);
    assert!(ok2);
    assert!(get_out.contains("hello world"), "value in get output");
    assert!(get_out.contains("high"), "confidence in get output");
}

#[test]
fn memory_upsert_updates_existing() {
    let dir = tmpdir();
    run(dir.path(), &["memory", "store", "k", "v1"]);
    run(dir.path(), &["memory", "store", "k", "v2"]);
    let (out, _, _) = run(dir.path(), &["memory", "get", "k"]);
    assert!(out.contains("v2"), "value should be updated");
    assert!(!out.contains("v1"), "old value should be gone");
    let l3 = fs::read_to_string(dir.path().join(".yamtam").join("l3.jsonl")).unwrap();
    assert_eq!(l3.lines().filter(|l| l.contains("\"key\":\"k\"")).count(), 1, "only 1 entry after upsert");
}

#[test]
fn memory_list_filters_by_tag() {
    let dir = tmpdir();
    run(dir.path(), &["memory", "store", "a", "val-a", "--tag", "foo"]);
    run(dir.path(), &["memory", "store", "b", "val-b", "--tag", "bar"]);
    let (out, _, _) = run(dir.path(), &["memory", "list", "--tag", "foo"]);
    assert!(out.contains("val-a"), "tagged fact shown");
    assert!(!out.contains("val-b"), "other tag not shown");
}

#[test]
fn memory_promote_writes_l1_file() {
    let dir = tmpdir();
    fs::create_dir_all(dir.path().join("memory").join("L1_atomic")).unwrap();
    run(dir.path(), &["memory", "store", "my.fact", "important decision", "--confidence", "high"]);
    let (out, _, ok) = run(dir.path(), &[
        "memory", "promote", "my.fact",
        "--l1-dir", "memory/L1_atomic",
    ]);
    assert!(ok, "promote should succeed");
    assert!(out.contains("promoted"), "promoted message");
    let l1_file = dir.path().join("memory").join("L1_atomic").join("my-fact.md");
    assert!(l1_file.exists(), "L1 .md file created");
    let content = fs::read_to_string(&l1_file).unwrap();
    assert!(content.contains("important decision"), "value in L1 file");
    assert!(content.contains("confidence: high"), "confidence in L1 frontmatter");
}

// ── Plugin shell parsing ──────────────────────────────────────────────────────

#[test]
fn plugin_add_and_list() {
    let dir = tmpdir();
    let (_, _, ok) = run(dir.path(), &[
        "plugin", "add", "my-guard", "bash -c 'echo ok'",
        "--description", "test guard",
    ]);
    assert!(ok, "add should succeed");
    let (list_out, _, _) = run(dir.path(), &["plugin", "list"]);
    assert!(list_out.contains("my-guard"), "plugin in list");
    assert!(list_out.contains("test guard"), "description in list");
}

#[test]
fn plugin_disable_and_enable() {
    let dir = tmpdir();
    run(dir.path(), &["plugin", "add", "p", "echo ok"]);
    run(dir.path(), &["plugin", "disable", "p"]);
    let (out, _, _) = run(dir.path(), &["plugin", "list"]);
    // disabled plugin has no ✓
    let plugin_line = out.lines().find(|l| l.contains("p")).unwrap_or("");
    assert!(!plugin_line.contains("✓"), "disabled plugin has no checkmark");
    run(dir.path(), &["plugin", "enable", "p"]);
    let (out2, _, _) = run(dir.path(), &["plugin", "list"]);
    let line2 = out2.lines().find(|l| l.contains("  p  ") || l.contains("  p\t")).unwrap_or("");
    assert!(line2.contains("✓") || out2.contains("✓"), "re-enabled has checkmark");
}

#[test]
fn plugin_remove() {
    let dir = tmpdir();
    run(dir.path(), &["plugin", "add", "to-remove", "echo x"]);
    let (_, _, ok) = run(dir.path(), &["plugin", "remove", "to-remove"]);
    assert!(ok);
    let (list, _, _) = run(dir.path(), &["plugin", "list"]);
    assert!(!list.contains("to-remove"), "removed plugin gone");
}

// ── Cost tests ────────────────────────────────────────────────────────────────

#[test]
fn cost_log_and_show() {
    let dir = tmpdir();
    run(dir.path(), &["cost", "log", "pr_review", "fast", "claude-haiku-4-5", "1000", "300"]);
    run(dir.path(), &["cost", "log", "audit", "standard", "claude-sonnet-4-6", "5000", "1000"]);
    let (out, _, ok) = run(dir.path(), &["cost", "show"]);
    assert!(ok);
    assert!(out.contains("fast"), "fast tier in summary");
    assert!(out.contains("standard"), "standard tier in summary");
    assert!(out.contains("TOTAL"), "total row in summary");
}

#[test]
fn cost_breakdown_by_model() {
    let dir = tmpdir();
    run(dir.path(), &["cost", "log", "t1", "fast", "haiku", "100", "50"]);
    run(dir.path(), &["cost", "log", "t2", "standard", "sonnet", "200", "100"]);
    let (out, _, _) = run(dir.path(), &["cost", "breakdown", "model"]);
    assert!(out.contains("haiku"), "haiku in model breakdown");
    assert!(out.contains("sonnet"), "sonnet in model breakdown");
}
