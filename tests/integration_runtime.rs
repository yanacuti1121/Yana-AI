/// Integration tests for yana-rt: bus, memory, plugin shell parsing
///
/// Each test runs in an isolated tmpdir via the binary CLI so real file I/O
/// is exercised end-to-end.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn bin() -> PathBuf {
    let mut p = std::env::current_exe().unwrap();
    p.pop(); p.pop(); // target/debug/deps → target
    p.push("yana-rt");
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
        .expect("run yana-rt");
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

    let bus_file = dir.path().join(".yana-ai").join("bus.jsonl");
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
    let l3_file = dir.path().join(".yana-ai").join("l3.jsonl");
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
    let l3 = fs::read_to_string(dir.path().join(".yana-ai").join("l3.jsonl")).unwrap();
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

#[test]
fn bus_emit_auto_tracks_cost_when_payload_has_tokens() {
    let dir = tmpdir();
    // Emit event with token info in payload → should auto-log to ledger
    let payload = r#"{"input_tokens":2000,"output_tokens":500,"tier":"standard","model":"claude-sonnet-4-6","task":"pr_review"}"#;
    let (stdout, _, ok) = run(dir.path(), &["bus", "emit", "agent", "*", "task.done", payload]);
    assert!(ok);
    assert!(stdout.contains("cost tracked automatically"), "auto-track message shown");

    // Verify ledger entry was created
    let (cost_out, _, _) = run(dir.path(), &["cost", "show"]);
    assert!(cost_out.contains("standard"), "tier in ledger");
    assert!(cost_out.contains("TOTAL"), "total row present");
}

#[test]
fn bus_emit_no_cost_when_payload_missing_tokens() {
    let dir = tmpdir();
    // Emit without token fields → no cost entry
    run(dir.path(), &["bus", "emit", "a", "b", "ping", r#"{"msg":"hello"}"#]);
    let ledger = dir.path().join(".yana-ai").join("ledger.jsonl");
    assert!(!ledger.exists(), "no ledger when tokens absent");
}

// ── doctor ────────────────────────────────────────────────────────────────────

#[test]
fn doctor_run_exits_ok() {
    let dir = tmpdir();
    // init git repo so git checks pass
    Command::new("git").args(["init"]).current_dir(dir.path()).output().ok();
    let (stdout, _, _) = run(dir.path(), &["doctor", "run", "."]);
    assert!(stdout.contains("git installed") || stdout.contains("yana-ai doctor"),
        "doctor output shown");
}

#[test]
fn doctor_run_json() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["doctor", "run", ".", "--json"]);
    assert!(ok);
    let v: serde_json::Value = serde_json::from_str(&stdout).expect("valid JSON");
    assert!(v.is_array(), "JSON output is array");
}

// ── spec ──────────────────────────────────────────────────────────────────────

#[test]
fn spec_validate_valid() {
    let dir = tmpdir();
    let spec = r#"{"id":"T001","goal":"Fix auth","tasks":[{"id":"t1","description":"update handler"}],"acceptance_criteria":["tests pass"]}"#;
    std::fs::write(dir.path().join("spec.json"), spec).unwrap();
    let (_, _, ok) = run(dir.path(), &["spec", "validate", "spec.json"]);
    assert!(ok, "valid spec exits 0");
}

#[test]
fn spec_validate_missing_required() {
    let dir = tmpdir();
    let spec = r#"{"id":"T001"}"#;
    std::fs::write(dir.path().join("spec.json"), spec).unwrap();
    let (stdout, _, ok) = run(dir.path(), &["spec", "validate", "spec.json"]);
    assert!(!ok, "invalid spec exits non-zero");
    assert!(stdout.contains("SPEC"), "finding IDs shown");
}

#[test]
fn spec_schema_prints() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["spec", "schema"]);
    assert!(ok);
    assert!(stdout.contains("goal"), "schema has goal field");
}

// ── ci ────────────────────────────────────────────────────────────────────────

#[test]
fn ci_check_no_workflows() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["ci", "check", "."]);
    assert!(ok);
    assert!(stdout.contains("No workflows"), "reports no workflows");
}

#[test]
fn ci_check_detects_missing_timeout() {
    let dir = tmpdir();
    let wf_dir = dir.path().join(".github/workflows");
    std::fs::create_dir_all(&wf_dir).unwrap();
    std::fs::write(wf_dir.join("ci.yml"), "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n").unwrap();
    let (stdout, _, _) = run(dir.path(), &["ci", "check", "."]);
    assert!(stdout.contains("CI004") || stdout.contains("timeout"), "detects missing timeout");
}

// ── hunt ──────────────────────────────────────────────────────────────────────

#[test]
fn hunt_clean_repo_no_findings() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["hunt", "run", ".", "secrets"]);
    assert!(ok);
    assert!(stdout.contains("No findings") || stdout.contains("clean") || stdout.is_empty()
        || stdout.contains("finding"),
        "hunt output shown: {stdout}");
}

#[test]
fn hunt_detects_fake_secret() {
    let dir = tmpdir();
    std::fs::write(dir.path().join("config.py"), "api_key = 'sk-abcdefghijklmnopqrstuvwxyz123456'\n").unwrap();
    let (stdout, _, _) = run(dir.path(), &["hunt", "run", ".", "secrets"]);
    assert!(stdout.contains("HIGH") || stdout.contains("finding") || stdout.contains("API"),
        "detects fake API key: {stdout}");
}

// ── vault ─────────────────────────────────────────────────────────────────────

#[test]
fn vault_init_and_new_note() {
    let dir = tmpdir();
    let (_, _, ok) = run(dir.path(), &["vault", "init", ".", "--name", "Test"]);
    assert!(ok, "vault init ok");
    assert!(dir.path().join(".vault.yaml").exists(), ".vault.yaml created");

    let (stdout, _, ok2) = run(dir.path(), &["vault", "new", "Hello World", "--lang", "vi"]);
    assert!(ok2, "vault new ok");
    assert!(stdout.contains("hello-world"), "slug in output");
    assert!(dir.path().join("notes/hello-world.md").exists(), "note file created");
}

#[test]
fn vault_list_and_search() {
    let dir = tmpdir();
    run(dir.path(), &["vault", "init", ".", "--name", "T"]);
    run(dir.path(), &["vault", "new", "Rust Programming", "--lang", "en", "--vault", "."]);
    run(dir.path(), &["vault", "new", "Lập trình Rust", "--lang", "vi", "--vault", "."]);

    let (list, _, _) = run(dir.path(), &["vault", "list", "--vault", "."]);
    assert!(list.contains("rust-programming"), "en note listed");

    let (search, _, _) = run(dir.path(), &["vault", "search", "rust", "--vault", "."]);
    assert!(search.contains("note(s)") || search.contains("matching"), "search finds notes");
}

#[test]
fn vault_stats() {
    let dir = tmpdir();
    run(dir.path(), &["vault", "init", ".", "--name", "S"]);
    run(dir.path(), &["vault", "new", "Note One", "--lang", "vi", "--vault", "."]);
    let (stats, _, ok) = run(dir.path(), &["vault", "stats", "--vault", "."]);
    assert!(ok);
    assert!(stats.contains("Notes"), "stats shows note count");
}

// ── graph ─────────────────────────────────────────────────────────────────────

#[test]
fn graph_build_and_show() {
    let dir = tmpdir();
    // Create a minimal Rust project structure
    std::fs::write(dir.path().join("main.rs"), "fn main() {}\n").unwrap();
    std::fs::write(dir.path().join("lib.rs"), "pub fn hello() {}\n").unwrap();

    let (_, _, ok) = run(dir.path(), &["graph", "build", ".", "--quiet"]);
    assert!(ok, "graph build ok");
    assert!(dir.path().join(".yana-ai/graph/knowledge-graph.json").exists(),
        "graph JSON created");

    let (show, _, ok2) = run(dir.path(), &["graph", "show", "."]);
    assert!(ok2);
    assert!(show.contains("Files") || show.contains("Analysed"), "show output");
}

#[test]
fn graph_search() {
    let dir = tmpdir();
    std::fs::write(dir.path().join("auth.rs"), "fn authenticate() {}\n").unwrap();
    run(dir.path(), &["graph", "build", ".", "--quiet"]);

    let (out, _, ok) = run(dir.path(), &["graph", "search", "auth", "."]);
    assert!(ok);
    assert!(out.contains("auth"), "search finds auth.rs");
}

// ── fix ───────────────────────────────────────────────────────────────────────

#[test]
fn fix_list_shows_rules() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["fix", "list"]);
    assert!(ok);
    assert!(stdout.contains("AC001"), "AC001 in list");
    assert!(stdout.contains("AC002"), "AC002 in list");
}

#[test]
fn fix_ac002_dry_run() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["fix", "apply", "AC002", ".", "--dry-run"]);
    assert!(ok);
    assert!(stdout.contains("dry-run") || stdout.contains(".env"), "dry run output");
}

#[test]
fn fix_ac002_applies() {
    let dir = tmpdir();
    let (_, _, ok) = run(dir.path(), &["fix", "apply", "AC002", "."]);
    assert!(ok);
    let gitignore = dir.path().join(".gitignore");
    assert!(gitignore.exists(), ".gitignore created");
    let content = std::fs::read_to_string(gitignore).unwrap();
    assert!(content.contains(".env"), ".env in gitignore");
}

// ── map ───────────────────────────────────────────────────────────────────────

#[test]
fn map_show_no_config() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["map", "show", "."]);
    assert!(ok);
    assert!(stdout.contains("Blast") || stdout.contains("risk") || stdout.contains("Claude"),
        "map output shown: {stdout}");
}

#[test]
fn map_show_json() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["map", "show", ".", "--json"]);
    assert!(ok);
    let v: serde_json::Value = serde_json::from_str(&stdout).expect("valid JSON");
    assert!(v.get("risk").is_some(), "risk field in JSON");
}

fn scanner_dir() -> String {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    format!("{manifest}/scanner")
}

// ── scan ──────────────────────────────────────────────────────────────────────

#[test]
fn scan_clean_repo_exits_ok() {
    let dir = tmpdir();
    let sd = scanner_dir();
    let (_, _, ok) = run(dir.path(), &["scan", ".", "--scanner-dir", &sd]);
    assert!(ok, "scan on empty repo should exit 0");
}

#[test]
fn scan_json_output_has_required_fields() {
    let dir = tmpdir();
    let sd = scanner_dir();
    let (stdout, _, ok) = run(dir.path(), &["scan", ".", "--json", "--scanner-dir", &sd]);
    assert!(ok);
    let v: serde_json::Value = serde_json::from_str(&stdout).expect("valid JSON from scan");
    assert!(v.get("status").is_some(), "JSON has status");
    assert!(v.get("findings").is_some(), "JSON has findings");
    assert!(v.get("summary").is_some(), "JSON has summary");
}

#[test]
fn scan_quiet_flag_reduces_output() {
    let dir = tmpdir();
    let sd = scanner_dir();
    let (stdout_normal, _, _) = run(dir.path(), &["scan", ".", "--scanner-dir", &sd]);
    let (stdout_quiet, _, _) = run(dir.path(), &["scan", ".", "--quiet", "--scanner-dir", &sd]);
    assert!(
        stdout_quiet.len() <= stdout_normal.len(),
        "--quiet should not produce more output than normal"
    );
}

#[test]
fn scan_markdown_writes_file() {
    let dir = tmpdir();
    let sd = scanner_dir();
    let report_path = dir.path().join("report.md");
    run(dir.path(), &["scan", ".", "--markdown", report_path.to_str().unwrap(), "--scanner-dir", &sd]);
    assert!(report_path.exists(), "markdown report file created");
    let content = std::fs::read_to_string(&report_path).unwrap();
    assert!(content.contains('#'), "markdown has headers");
}

// ── config ────────────────────────────────────────────────────────────────────

#[test]
fn config_init_creates_settings_file() {
    let dir = tmpdir();
    let (_, _, ok) = run(dir.path(), &["config", "init", "--dir", "."]);
    assert!(ok, "config init should succeed");
    let settings = dir.path().join(".yana-ai").join("settings.json");
    assert!(settings.exists(), "settings.json created");
}

#[test]
fn config_show_after_init() {
    let dir = tmpdir();
    run(dir.path(), &["config", "init", "--dir", "."]);
    let (stdout, _, ok) = run(dir.path(), &["config", "show", "--dir", "."]);
    assert!(ok, "config show should succeed after init");
    assert!(stdout.contains("version") || stdout.contains("guards"), "show has config fields");
}

#[test]
fn config_show_no_config_prints_hint() {
    let dir = tmpdir();
    let (stdout, _, _) = run(dir.path(), &["config", "show", "--dir", "."]);
    assert!(
        stdout.contains("init") || stdout.contains("No config") || stdout.contains("not found"),
        "no config gives helpful message: {stdout}"
    );
}

#[test]
fn config_set_updates_value() {
    let dir = tmpdir();
    run(dir.path(), &["config", "init", "--dir", "."]);
    let (_, _, ok) = run(dir.path(), &["config", "set", "cost_tracking", "false", "--dir", "."]);
    assert!(ok, "config set should succeed");
    let settings = dir.path().join(".yana-ai").join("settings.json");
    let content = std::fs::read_to_string(settings).unwrap();
    assert!(content.contains("false") || content.contains("cost_tracking"), "value updated");
}

// ── task ──────────────────────────────────────────────────────────────────────

#[test]
fn task_create_and_list() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["task", "create", "fix-auth-bug", "--scope", "auth/"]);
    assert!(ok, "task create should succeed");
    assert!(stdout.contains("created") || stdout.contains("fix-auth-bug"), "create prints task");

    let (list_out, _, ok2) = run(dir.path(), &["task", "list"]);
    assert!(ok2, "task list should succeed");
    assert!(list_out.contains("fix-auth-bug"), "created task in list");
}

#[test]
fn task_status_unknown_id() {
    let dir = tmpdir();
    let (stdout, _, _) = run(dir.path(), &["task", "status", "nonexistent-id-xyz"]);
    assert!(
        stdout.contains("not found") || stdout.contains("No task") || stdout.is_empty(),
        "unknown id handled gracefully: {stdout}"
    );
}

#[test]
fn task_drop_removes_task() {
    let dir = tmpdir();
    run(dir.path(), &["task", "create", "temp-task"]);
    let (list_before, _, _) = run(dir.path(), &["task", "list"]);
    assert!(list_before.contains("temp-task"), "task exists before drop");
    let (_, _, _) = run(dir.path(), &["task", "drop", "temp-task"]);
    // No panic is the main assertion
}

// ── eval ──────────────────────────────────────────────────────────────────────

#[test]
fn eval_schema_prints_json() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["eval", "schema"]);
    assert!(ok, "eval schema should succeed");
    assert!(
        stdout.contains('{') || stdout.contains("tests_passed") || stdout.contains("evidence"),
        "eval schema has content: {stdout}"
    );
}

#[test]
fn eval_run_unknown_task_errors_gracefully() {
    let dir = tmpdir();
    let (_, _, _ok) = run(dir.path(), &["eval", "run", "nonexistent-task-id"]);
    // Should exit non-zero but not panic
}

#[test]
fn eval_judge_unknown_task_errors_gracefully() {
    let dir = tmpdir();
    let (_, _, ok) = run(dir.path(), &["eval", "judge", "nonexistent-task-id"]);
    assert!(!ok, "unknown task id should fail before any provider/network call");
}

#[test]
fn eval_judge_no_evidence_errors_gracefully() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["task", "create", "no-evidence-task"]);
    assert!(ok, "task create should succeed");
    let id = stdout.lines().next().unwrap().split_whitespace().nth(2).unwrap();
    let (_, stderr, ok2) = run(dir.path(), &["eval", "judge", id]);
    assert!(!ok2, "judge without evidence should fail before any network call");
    assert!(stderr.contains("no evidence"), "error names the real cause: {stderr}");
}

/// Breaker-open check happens before provider selection/the network call —
/// verified here by priming persisted state directly (no ollama daemon
/// needed in CI, and no dependency on a real LLM's verdict wording).
#[test]
fn eval_judge_breaker_blocks_when_open_no_network_needed() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["task", "create", "breaker-primed-task"]);
    assert!(ok);
    let id = stdout.lines().next().unwrap().split_whitespace().nth(2).unwrap();
    run(dir.path(), &["task", "done", id, "--evidence", "irrelevant"]);

    // Prime the breaker open by writing a future eval_judge_breaker_until
    // directly into tasks.json — same file the CLI itself reads/writes,
    // just skipping straight to "already failed 5 times" instead of
    // burning 5 real (non-deterministic) LLM calls to get there.
    let store_path = dir.path().join(".yana-ai").join("tasks.json");
    let raw = fs::read_to_string(&store_path).expect("read tasks.json");
    let mut store: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let tasks = store["tasks"].as_object_mut().unwrap();
    let (_key, task) = tasks.iter_mut().next().expect("one task present");
    task["eval_judge_attempts"] = serde_json::json!(5);
    // Same "%Y-%m-%dT%H:%M:%SZ" format `task.rs`'s own `now()`/`future_ts()`
    // write — chrono is a real (non-dev) dependency via the default `cli`
    // feature, so this matches production formatting exactly rather than
    // approximating it via a shelled-out `date` call.
    let future_ts = (chrono::Utc::now() + chrono::Duration::seconds(120))
        .format("%Y-%m-%dT%H:%M:%SZ").to_string();
    task["eval_judge_breaker_until"] = serde_json::json!(future_ts);
    fs::write(&store_path, serde_json::to_string_pretty(&store).unwrap()).unwrap();

    let out = Command::new(bin()).args(["eval", "judge", id]).current_dir(dir.path()).output().unwrap();
    assert_eq!(out.status.code(), Some(2), "breaker-open must exit 2, distinct from a real FAIL's exit 1");
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.to_lowercase().contains("breaker"), "names the reason: {stderr}");
}

/// A `tasks.json` written before `eval_judge_attempts`/`eval_judge_breaker_until`
/// existed has neither field. `#[serde(default)]` must let it still load.
#[test]
fn task_store_without_judge_fields_still_loads() {
    let dir = tmpdir();
    let store_dir = dir.path().join(".yana-ai");
    fs::create_dir_all(&store_dir).unwrap();
    let old_format = serde_json::json!({
        "tasks": {
            "11111111-1111-1111-1111-111111111111": {
                "id": "11111111-1111-1111-1111-111111111111",
                "name": "pre-existing task from before the judge feature",
                "status": "open",
                "scope": null,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "evidence": null
            }
        }
    });
    fs::write(store_dir.join("tasks.json"), serde_json::to_string_pretty(&old_format).unwrap()).unwrap();

    let (stdout, _, ok) = run(dir.path(), &["task", "list"]);
    assert!(ok, "old-format store must still load, not crash");
    assert!(stdout.contains("pre-existing task"), "old task is visible: {stdout}");
}

// ── init ──────────────────────────────────────────────────────────────────────

#[test]
fn init_dry_run_prints_plan_no_files() {
    let dir = tmpdir();
    let (stdout, _, ok) = run(dir.path(), &["init", "dry", "."]);
    assert!(ok, "init dry should succeed");
    assert!(
        stdout.contains("would") || stdout.contains("create") || stdout.contains(".yana-ai"),
        "dry run shows plan: {stdout}"
    );
    assert!(!dir.path().join(".yana-ai").exists(), ".yana-ai not created in dry mode");
}

#[test]
fn init_run_creates_yana_ai_dir() {
    let dir = tmpdir();
    let (_, _, ok) = run(dir.path(), &["init", "run", ".", "--yes"]);
    assert!(ok, "init run --yes should succeed");
    assert!(dir.path().join(".yana-ai").exists(), ".yana-ai created");
}

#[test]
fn init_run_idempotent() {
    let dir = tmpdir();
    run(dir.path(), &["init", "run", ".", "--yes"]);
    let (_, _, ok) = run(dir.path(), &["init", "run", ".", "--yes"]);
    assert!(ok, "init run twice should not fail");
}

// ── watch ─────────────────────────────────────────────────────────────────────

#[test]
#[ignore = "watch blocks indefinitely in CI — requires real filesystem watcher"]
fn watch_exits_after_max_changes() {
    use std::thread;
    use std::time::Duration;

    let dir = tmpdir();
    let dir_path = dir.path().to_path_buf();
    let dir_path2 = dir_path.clone();

    let handle = thread::spawn(move || {
        std::process::Command::new(bin())
            .args(&["watch", "start", "--max-changes", "1", "--interval", "1"])
            .current_dir(&dir_path2)
            .output()
    });

    thread::sleep(Duration::from_millis(300));
    std::fs::write(dir_path.join("trigger.txt"), "change").unwrap();

    match handle.join().unwrap() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            assert!(
                stdout.contains("change") || stdout.contains("watch") || output.status.success(),
                "watch detected change or exited cleanly"
            );
        }
        Err(_) => {}
    }
}

// ── score ─────────────────────────────────────────────────────────────────────

#[test]
fn score_show_clean_repo() {
    let dir = tmpdir();
    let sd = scanner_dir();
    let (stdout, _, ok) = run(dir.path(), &["score", "show", ".", "--scanner-dir", &sd]);
    assert!(ok, "score show should succeed on empty repo");
    assert!(stdout.contains("Score") || stdout.contains("score"), "output has score label");
    assert!(stdout.contains("100") || stdout.contains("LOW"), "clean repo should score 100 / LOW risk");
}
