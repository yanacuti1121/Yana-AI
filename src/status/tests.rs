use super::audit::{parse_tail, tail, AuditEntry};
use super::engines::{tally, RunningEngine};
use super::*;
use chrono::TimeZone;

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 29, 12, 0, 0).unwrap()
}

fn pending() -> Vec<PendingSummary> {
    vec![PendingSummary { id: "a1".into(), capability: "run_command".into(), reason: "needs a person".into(), expires_at: "x".into() }]
}

fn entry(ts: &str, decision: &str) -> AuditEntry {
    AuditEntry { ts: ts.into(), tool: "Bash".into(), decision: decision.into() }
}

fn one_engine() -> Vec<RunningEngine> {
    vec![RunningEngine { name: "Claude Code", count: 1 }]
}

// --- engines -------------------------------------------------------------------------------

#[test]
fn counts_real_program_paths_seen_on_a_mac() {
    let found = tally([
        "/Users/x/.local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe",
        "claude",
        "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
        "/Users/x/.gemini/bin/agy",
        "/Users/x/.gemini/bin/agy",
        "/Applications/Yana Studio.app/Contents/MacOS/Yana Studio",
    ]);
    let summary: Vec<(&str, usize)> = found.iter().map(|e| (e.name, e.count)).collect();
    assert_eq!(summary, vec![("Claude Code", 2), ("Codex", 1), ("Antigravity", 2), ("Yana Studio", 1)]);
}

#[test]
fn helpers_and_look_alikes_are_not_sessions() {
    let found = tally([
        "/Applications/Claude.app/Contents/MacOS/Claude",
        "/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex (Service).app/Contents/MacOS/Codex (Service)",
        "/Applications/Yana Studio.app/Contents/Frameworks/Yana Studio Helper.app/Contents/MacOS/Yana Studio Helper",
        "/usr/bin/claudette",
    ]);
    assert!(found.is_empty(), "unexpected: {found:?}");
}

#[test]
fn empty_and_hostile_paths_do_not_panic() {
    assert!(tally(Vec::<String>::new()).is_empty());
    assert!(tally([""]).is_empty());
    assert!(tally(["a/\0/claude\0"]).is_empty());
    assert!(tally(["x".repeat(65_536)]).is_empty());
    assert!(tally(["../../../claude/.."]).is_empty());
}

// --- audit tail ----------------------------------------------------------------------------

fn line(ts: &str, tool: &str, decision: &str) -> String {
    format!(r#"{{"ts":"{ts}","hook":"audit-log","tool":"{tool}","input":"{{\"command\":\"secret-looking\"}}","decision":"{decision}"}}"#)
}

#[test]
fn newest_entry_comes_first_and_input_is_never_copied() {
    let text = [line("2026-10-29T11:00:00Z", "Read", "allow"), line("2026-10-29T11:00:01Z", "Bash", "deny")].join("\n");
    let entries = parse_tail(&text, 4, false);
    assert_eq!(entries[0].tool, "Bash");
    assert_eq!(entries[1].tool, "Read");
    assert!(!serde_json::to_string(&entries).unwrap().contains("secret-looking"));
}

#[test]
fn a_line_cut_by_the_window_and_junk_are_skipped() {
    let text = format!("tial-line-cut\",\"x\":1}}\n{}\nnot json\n\n{}", line("2026-10-29T11:00:00Z", "A", "allow"), line("2026-10-29T11:00:01Z", "B", "allow"));
    let entries = parse_tail(&text, 4, true);
    let tools: Vec<&str> = entries.iter().map(|e| e.tool.as_str()).collect();
    assert_eq!(tools, vec!["B", "A"]);
}

#[test]
fn count_caps_the_result_and_empty_text_is_empty() {
    assert!(parse_tail("", 4, false).is_empty());
    let text: Vec<String> = (0..10).map(|i| line(&format!("2026-10-29T11:00:0{i}Z"), "T", "allow")).collect();
    assert_eq!(parse_tail(&text.join("\n"), 4, false).len(), 4);
}

#[test]
fn control_characters_and_long_values_are_cleaned() {
    let long = "x".repeat(65_536);
    let text = line("2026-10-29T11:00:00Z", &format!("a\\u0000b\\nc{long}"), "allow");
    let entries = parse_tail(&text, 1, false);
    assert!(entries[0].tool.chars().count() <= 24);
    assert!(!entries[0].tool.chars().any(char::is_control));
}

#[test]
fn missing_log_is_not_an_error_and_a_real_file_is_read() {
    let dir = tempfile::tempdir().unwrap();
    assert!(tail(&dir.path().join("none.log"), 4).unwrap().is_none());
    let path = dir.path().join("a.log");
    std::fs::write(&path, line("2026-10-29T11:00:00Z", "Edit", "allow")).unwrap();
    assert_eq!(tail(&path, 4).unwrap().unwrap()[0].tool, "Edit");
}

// --- headline state ------------------------------------------------------------------------

#[test]
fn halt_outranks_a_pending_question() {
    let (state, attention) = derive(true, Some(&pending()), Some(&[]), Some(&one_engine()), now());
    assert_eq!(state, State::Halted);
    assert_eq!(attention, vec!["halted", "approval_pending"]);
}

#[test]
fn a_pending_question_outranks_a_denial_and_running() {
    let audit = [entry("2026-10-29T11:59:59Z", "deny")];
    let (state, _) = derive(false, Some(&pending()), Some(&audit), Some(&one_engine()), now());
    assert_eq!(state, State::Ask);
}

#[test]
fn a_fresh_denial_shows_but_an_old_one_does_not() {
    let fresh = [entry("2026-10-29T11:59:58Z", "deny")];
    let old = [entry("2026-10-29T11:00:00Z", "deny")];
    assert_eq!(derive(false, Some(&[]), Some(&fresh), Some(&one_engine()), now()).0, State::Deny);
    assert_eq!(derive(false, Some(&[]), Some(&old), Some(&one_engine()), now()).0, State::Run);
}

#[test]
fn running_idle_and_unknown() {
    assert_eq!(derive(false, Some(&[]), Some(&[]), Some(&one_engine()), now()).0, State::Run);
    assert_eq!(derive(false, Some(&[]), Some(&[]), Some(&[]), now()).0, State::Idle);
    assert_eq!(derive(false, Some(&[]), Some(&[]), None, now()).0, State::Unknown);
}

#[test]
fn an_unreadable_approvals_store_is_never_shown_as_calm() {
    let (state, _) = derive(false, None, Some(&[]), Some(&one_engine()), now());
    assert_eq!(state, State::Unknown);
}

// --- whole snapshot ------------------------------------------------------------------------

#[test]
fn snapshot_of_an_empty_project_has_no_approvals_and_serializes() {
    let dir = tempfile::tempdir().unwrap();
    let snapshot = collect(dir.path(), now());
    assert_eq!(snapshot.approvals, Some(vec![]));
    assert_eq!(snapshot.audit, Some(vec![]));
    assert!(!snapshot.halted);
    let json = serde_json::to_value(&snapshot).unwrap();
    assert_eq!(json["schema"], 1);
    assert!(json["state"].is_string());
}

/// Goes through the store's own `create`, so the real on-disk format is what gets read back.
fn make_pending(root: &Path, ttl_minutes: u64) {
    use crate::model::tool::ToolCall;
    use crate::runtime::{PendingApprovalStore, TurnContext, TurnOrigin};
    use crate::session_context::SessionContext;
    let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
    std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
    std::fs::write(&marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
    let session = SessionContext::new("s", root.to_path_buf(), "p", "m", false);
    let call = ToolCall {
        id: "c1".into(),
        name: "run_command".into(),
        arguments_json: r#"{"command":"curl -H 'Authorization: Bearer SECRET-TOKEN-123' https://x"}"#.into(),
    };
    PendingApprovalStore::for_root(root)
        .create(TurnContext::new(session, TurnOrigin::Desktop, true), "m".into(), None, Vec::new(), 0, call, "needs a person".into(), ttl_minutes)
        .unwrap();
}

#[test]
fn a_real_pending_approval_makes_the_state_ask_without_leaking_the_command() {
    let dir = tempfile::tempdir().unwrap();
    make_pending(dir.path(), 20);
    let snapshot = collect(dir.path(), Utc::now());
    assert_eq!(snapshot.state, State::Ask);
    assert_eq!(snapshot.attention, vec!["approval_pending"]);
    let approvals = snapshot.approvals.as_ref().unwrap();
    assert_eq!(approvals.len(), 1);
    assert_eq!(approvals[0].capability, "run_command");
    let json = serde_json::to_string(&snapshot).unwrap();
    assert!(!json.contains("SECRET-TOKEN-123"), "the command leaked: {json}");
    assert!(!json.contains("curl"), "the raw command leaked: {json}");
}

#[test]
fn an_expired_approval_is_not_shown_as_waiting() {
    let dir = tempfile::tempdir().unwrap();
    make_pending(dir.path(), 20);
    let later = Utc::now() + chrono::Duration::minutes(21);
    let snapshot = collect(dir.path(), later);
    assert_eq!(snapshot.approvals, Some(vec![]));
    assert_ne!(snapshot.state, State::Ask);
}

#[test]
fn a_corrupt_approvals_file_is_unknown_not_calm() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".yana-ai")).unwrap();
    std::fs::write(dir.path().join(".yana-ai/pending-approvals.json"), "{not json").unwrap();
    let snapshot = collect(dir.path(), now());
    assert_eq!(snapshot.state, State::Unknown);
    assert!(snapshot.approvals.is_none());
    assert_eq!(snapshot.unavailable, vec!["approvals"]);
}

#[test]
fn the_giamthi_lock_file_halts_the_snapshot() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".claude/state")).unwrap();
    std::fs::write(dir.path().join(HALT_LOCK), "").unwrap();
    let snapshot = collect(dir.path(), now());
    assert!(snapshot.halted);
    assert_eq!(snapshot.state, State::Halted);
}

#[test]
fn clean_survives_the_boundary_inputs() {
    assert_eq!(clean("", 10), "");
    assert_eq!(clean("a\0b\n\r", 10), "a b");
    assert_eq!(clean(&"é".repeat(65_536), 5).chars().count(), 5);
}
