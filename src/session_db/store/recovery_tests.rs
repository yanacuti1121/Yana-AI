//! Locks, recovery after a process died, integrity, and a corrupt database file.

use super::tests::{fixture, message, open, session};
use super::*;
use crate::session_db::ProfileName;

/// A child process spawned by another test thread briefly inherits open files
/// between fork and exec, so a just-released lock can read as busy for a
/// moment. Wait for it instead of asserting on that instant.
fn wait_until_free(store: &SqliteSessionStore, id: &str) {
    for _ in 0..200 {
        if store.lock_session(id).is_ok() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    panic!("session {id} stayed locked");
}

fn open_root(fx: &super::tests::Fixture) -> StateRoot {
    StateRoot::for_profile(&fx.base, &ProfileName::default_profile())
}

#[test]
fn a_session_lock_is_exclusive_per_session_and_released_on_drop() {
    let fx = fixture();
    let store = open(&fx, "default");
    let held = store.lock_session("s1").unwrap();
    assert!(matches!(store.lock_session("s1"), Err(SessionDbError::Busy(_))));
    assert!(store.lock_session("s2").is_ok(), "another session is independent");
    drop(held);
    wait_until_free(&store, "s1");
}

#[test]
fn a_second_store_on_the_same_files_sees_the_lock() {
    let fx = fixture();
    let first = open(&fx, "default");
    let second = SqliteSessionStore::open(&open_root(&fx)).unwrap();
    let _held = first.lock_session("s1").unwrap();
    assert!(matches!(second.lock_session("s1"), Err(SessionDbError::Busy(_))), "locks work across handles, as across processes");
}

#[test]
fn unsafe_session_ids_cannot_become_lock_file_names() {
    let fx = fixture();
    let store = open(&fx, "default");
    for bad in ["", "../x", "a/b", "a\\b", "a b", "a\0b", &"x".repeat(200)] {
        assert!(matches!(store.lock_session(bad), Err(SessionDbError::Invalid(_))), "{bad:?}");
    }
}

#[test]
fn recover_marks_a_dead_open_session_crashed_and_leaves_live_and_finished_ones() {
    let fx = fixture();
    let store = open(&fx, "default");
    for id in ["dead", "live", "done"] {
        store.create_session(&session(id, "2026-09-30T00:00:01Z")).unwrap();
        store.append_message(&message(&format!("{id}-m"), id, 1, Role::User, "x")).unwrap();
    }
    store.finish_session("done", EndReason::Completed).unwrap();
    let live_lock = store.lock_session("live").unwrap();
    let report = store.recover().unwrap();
    assert_eq!(report.crashed_sessions, vec!["dead"]);
    let reason = |id: &str| store.list_recent(10).unwrap().into_iter().find(|s| s.id == id).unwrap().end_reason;
    assert_eq!(reason("dead"), Some(EndReason::Crashed));
    assert_eq!(reason("live"), None, "a session another process holds is left alone");
    assert_eq!(reason("done"), Some(EndReason::Completed));
    drop(live_lock);
    wait_until_free(&store, "live");
    assert_eq!(store.recover().unwrap().crashed_sessions, vec!["live"], "once released it is dead too");
    assert!(store.recover().unwrap().crashed_sessions.is_empty(), "recover is repeatable");
}

fn tool_call_message(id: &str, session_id: &str, seq: u32) -> MessageRow {
    let mut m = message(id, session_id, seq, Role::Assistant, "");
    m.tool_call = Some(serde_json::json!({"id": "call-9", "name": "run_command", "arguments_json": "{}"}).to_string());
    m
}

#[test]
fn recover_resolves_a_dangling_tool_call_once_and_only_when_nobody_holds_the_session() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    store.append_message(&message("m1", "s1", 1, Role::User, "run it")).unwrap();
    store.append_message(&tool_call_message("m2", "s1", 2)).unwrap();
    let held = store.lock_session("s1").unwrap();
    assert!(store.recover().unwrap().repaired_tool_calls.is_empty(), "a live session is not touched");
    drop(held);
    wait_until_free(&store, "s1");
    let report = store.recover().unwrap();
    assert_eq!(report.repaired_tool_calls, vec!["s1"]);
    let messages = store.load_messages("s1").unwrap();
    assert_eq!(messages.len(), 3);
    let result = messages[2].tool_result.as_deref().unwrap();
    assert!(result.contains("call-9") && result.contains("interrupted") && result.contains("\"is_error\":true"), "{result}");
    assert_eq!((messages[2].seq, messages[2].role), (3, Role::User));
    assert!(store.recover().unwrap().repaired_tool_calls.is_empty(), "repairing twice adds nothing");
    assert_eq!(store.load_messages("s1").unwrap().len(), 3);
}

#[test]
fn a_finished_tool_round_is_not_touched() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    store.append_message(&tool_call_message("m1", "s1", 1)).unwrap();
    let mut result = message("m2", "s1", 2, Role::User, "");
    result.tool_result = Some(serde_json::json!({"call_id": "call-9", "output": "ok", "is_error": false, "denied": false}).to_string());
    store.append_message(&result).unwrap();
    assert!(store.recover().unwrap().repaired_tool_calls.is_empty());
    assert_eq!(store.load_messages("s1").unwrap().len(), 2);
}

#[test]
fn drifted_counts_are_reported_by_the_integrity_check_and_fixed_by_recover() {
    let fx = fixture();
    let root = open_root(&fx);
    let store = SqliteSessionStore::open(&root).unwrap();
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    let mut m = message("m1", "s1", 1, Role::User, "x");
    m.input_tokens = Some(4);
    store.append_message(&m).unwrap();
    let raw = rusqlite::Connection::open(root.path(StateKind::SessionsDb)).unwrap();
    raw.execute("UPDATE sessions SET message_count = 42, input_tokens = 99", []).unwrap();
    let before = store.integrity_check().unwrap();
    assert!(!before.ok && before.problems.iter().any(|p| p.contains("s1") && p.contains("message_count")), "{before:?}");
    assert_eq!(store.recover().unwrap().recounted_sessions, vec!["s1"]);
    let row = store.list_recent(1).unwrap().remove(0);
    assert_eq!((row.message_count, row.input_tokens), (1, 4));
    assert!(store.integrity_check().unwrap().ok);
}

#[test]
fn a_gap_in_message_numbers_is_reported_but_never_papered_over() {
    let fx = fixture();
    let root = open_root(&fx);
    let store = SqliteSessionStore::open(&root).unwrap();
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    for n in 1..=3 {
        store.append_message(&message(&format!("m{n}"), "s1", n, Role::User, "x")).unwrap();
    }
    let raw = rusqlite::Connection::open(root.path(StateKind::SessionsDb)).unwrap();
    raw.execute("DELETE FROM messages WHERE id = 'm2'", []).unwrap();
    let report = store.integrity_check().unwrap();
    assert!(report.problems.iter().any(|p| p.contains("s1") && p.contains("gap")), "{report:?}");
    store.recover().unwrap();
    assert_eq!(store.load_messages("s1").unwrap().len(), 2, "recover does not invent messages");
}

#[test]
fn a_corrupt_database_file_is_set_aside_intact_and_rebuilt_from_the_chat_history() {
    let fx = fixture();
    let root = open_root(&fx);
    root.ensure_dir().unwrap();
    let db_path = root.path(StateKind::SessionsDb);
    let garbage = b"this is definitely not an sqlite database, just bytes".repeat(20);
    std::fs::write(&db_path, &garbage).unwrap();
    let history = fx.base.join("history");
    std::fs::create_dir_all(&history).unwrap();
    let recovered_line = serde_json::json!({"schema_version": "1.0", "session_id": "s1", "id": "a", "ts": "2026-09-30T00:00:01Z",
        "role": "user", "content": "rebuilt from history", "provider": "p", "model": "m"});
    std::fs::write(history.join("s1.jsonl"), recovered_line.to_string() + "\n").unwrap();
    assert!(matches!(SqliteSessionStore::open(&root), Err(SessionDbError::Corrupt(_))), "plain open reports corruption");
    let (store, recovery) = SqliteSessionStore::open_or_recover(&root, Some(&history)).unwrap();
    let recovery = recovery.expect("corruption must be reported");
    assert_eq!(recovery.quarantined.len(), 1);
    assert_eq!(std::fs::read(&recovery.quarantined[0]).unwrap(), garbage, "the damaged file is kept byte for byte");
    assert_eq!(recovery.imported.unwrap().messages_added, 1);
    assert_eq!(store.search("rebuilt", 5).unwrap().len(), 1);
    let (_, again) = SqliteSessionStore::open_or_recover(&root, Some(&history)).unwrap();
    assert!(again.is_none(), "a healthy database is opened normally");
}

#[test]
fn a_database_from_a_newer_program_is_not_mistaken_for_corruption() {
    let fx = fixture();
    let root = open_root(&fx);
    root.ensure_dir().unwrap();
    let conn = rusqlite::Connection::open(root.path(StateKind::SessionsDb)).unwrap();
    conn.pragma_update(None, "user_version", 99).unwrap();
    drop(conn);
    let result = SqliteSessionStore::open_or_recover(&root, None);
    assert!(matches!(result, Err(SessionDbError::NewerSchema { .. })), "{:?}", result.err());
    assert!(root.path(StateKind::SessionsDb).exists(), "nothing was moved aside");
}
