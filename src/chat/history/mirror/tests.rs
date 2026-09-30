//! The mirror is off by default and can never break a chat turn.

use super::*;
use crate::chat::provider::Role;
use crate::session_db::{ProfileName, SessionStore, SqliteSessionStore, StateKind, StateRoot};

fn line(session: &str, id: &str, content: &str) -> HistoryLine {
    HistoryLine {
        schema_version: "1.0".to_string(),
        session_id: session.to_string(),
        id: id.to_string(),
        ts: "2026-09-30T00:00:01Z".to_string(),
        role: Role::User,
        content: content.to_string(),
        provider: None,
        model: None,
        input_tokens: None,
        output_tokens: None,
        duration_ms: None,
        truncated: false,
        error: None,
        tool_call: None,
        tool_result: None,
    }
}

fn root(base: &std::path::Path) -> StateRoot {
    StateRoot::for_profile(base, &ProfileName::default_profile())
}

#[test]
fn off_by_default_creates_nothing() {
    let dir = tempfile::tempdir().unwrap();
    mirror_gated(false, dir.path(), &line("s1", "m1", "hello"));
    assert!(!dir.path().join(".yana-ai").exists(), "no directory and no sessions.db");
}

#[test]
fn only_the_value_1_turns_it_on() {
    assert_eq!(ENV_FLAG, "YANA_SESSION_DB");
    assert!(flag_on(Some("1")));
    for off in [None, Some(""), Some("0"), Some("true"), Some("yes"), Some("11"), Some(" 1")] {
        assert!(!flag_on(off), "{off:?}");
    }
}

#[test]
fn on_copies_lines_in_order_and_repeats_add_nothing() {
    let dir = tempfile::tempdir().unwrap();
    for (id, text) in [("m1", "first"), ("m2", "second")] {
        mirror_gated(true, dir.path(), &line("s1", id, text));
    }
    mirror_gated(true, dir.path(), &line("s1", "m2", "second"));
    let store = SqliteSessionStore::open(&root(dir.path())).unwrap();
    let messages = store.load_messages("s1").unwrap();
    assert_eq!(messages.iter().map(|m| (m.seq, m.content.as_str())).collect::<Vec<_>>(), [(1, "first"), (2, "second")]);
    let session = store.list_recent(1).unwrap().remove(0);
    assert_eq!((session.message_count, session.end_reason), (2, None), "a live session stays open");
}

#[test]
fn a_damaged_database_is_survived_and_left_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let state = root(dir.path());
    state.ensure_dir().unwrap();
    let db = state.path(StateKind::SessionsDb);
    std::fs::write(&db, b"not a database, just bytes".repeat(10)).unwrap();
    let before = std::fs::read(&db).unwrap();
    mirror_gated(true, dir.path(), &line("s1", "m1", "hello"));
    assert_eq!(std::fs::read(&db).unwrap(), before);
}

#[test]
fn a_locked_database_does_not_lose_the_copy_of_later_lines_or_panic() {
    let dir = tempfile::tempdir().unwrap();
    mirror_gated(true, dir.path(), &line("s1", "m1", "first"));
    let raw = rusqlite::Connection::open(root(dir.path()).path(StateKind::SessionsDb)).unwrap();
    raw.execute_batch("BEGIN EXCLUSIVE").unwrap();
    raw.busy_timeout(std::time::Duration::from_millis(1)).unwrap();
    // Held by someone else: the call must come back (after the busy timeout), not panic.
    mirror_gated(true, dir.path(), &line("s1", "m2", "second"));
    raw.execute_batch("ROLLBACK").unwrap();
    mirror_gated(true, dir.path(), &line("s1", "m3", "third"));
    let store = SqliteSessionStore::open(&root(dir.path())).unwrap();
    assert!(store.load_messages("s1").unwrap().iter().any(|m| m.id == "m3"));
}
