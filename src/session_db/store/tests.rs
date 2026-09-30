use super::*;
use crate::session_db::ProfileName;

struct Fixture {
    _outer: tempfile::TempDir,
    base: std::path::PathBuf,
}

fn fixture() -> Fixture {
    let outer = tempfile::tempdir().unwrap();
    let base = outer.path().join("repo");
    std::fs::create_dir(&base).unwrap();
    Fixture { _outer: outer, base }
}

fn open(fx: &Fixture, profile: &str) -> SqliteSessionStore {
    let root = StateRoot::for_profile(&fx.base, &ProfileName::new(profile).unwrap());
    SqliteSessionStore::open(&root).unwrap()
}

fn session(id: &str, updated_at: &str) -> SessionRow {
    SessionRow {
        id: id.to_string(),
        title: format!("title {id}"),
        provider: "ollama".to_string(),
        model: "llama3".to_string(),
        cwd: Some("/work".to_string()),
        created_at: "2026-09-30T00:00:00Z".to_string(),
        updated_at: updated_at.to_string(),
        ended_at: None,
        end_reason: None,
        message_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
    }
}

fn message(id: &str, session_id: &str, seq: u32, role: Role, content: &str) -> MessageRow {
    MessageRow {
        id: id.to_string(),
        session_id: session_id.to_string(),
        seq,
        role,
        content: content.to_string(),
        tool_call: None,
        tool_result: None,
        ts: format!("2026-09-30T00:00:{seq:02}Z"),
        input_tokens: None,
        output_tokens: None,
    }
}

#[test]
fn a_new_database_is_created_at_schema_version_one_with_working_full_text_search() {
    let fx = fixture();
    let store = open(&fx, "default");
    assert_eq!(store.schema_version().unwrap(), 1);
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    store.append_message(&message("m1", "s1", 1, Role::User, "hello sqlite full text")).unwrap();
    // Proves FTS5 is compiled into the bundled SQLite, not just declared.
    assert_eq!(store.search("sqlite", 5).unwrap().len(), 1);
}

#[test]
fn messages_come_back_in_order_and_session_totals_follow_them() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    let mut first = message("m1", "s1", 1, Role::User, "question");
    first.input_tokens = Some(10);
    let mut second = message("m2", "s1", 2, Role::Assistant, "answer");
    second.output_tokens = Some(25);
    store.append_message(&second).unwrap();
    store.append_message(&first).unwrap();
    let loaded = store.load_messages("s1").unwrap();
    assert_eq!(loaded.iter().map(|m| m.seq).collect::<Vec<_>>(), vec![1, 2]);
    assert_eq!(loaded[1].role, Role::Assistant);
    let row = store.list_recent(5).unwrap().remove(0);
    assert_eq!((row.message_count, row.input_tokens, row.output_tokens), (2, 10, 25));
}

#[test]
fn appending_the_same_message_id_twice_changes_nothing() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    let mut m = message("m1", "s1", 1, Role::User, "once");
    m.input_tokens = Some(7);
    store.append_message(&m).unwrap();
    store.append_message(&m).unwrap();
    assert_eq!(store.load_messages("s1").unwrap().len(), 1);
    let row = store.list_recent(1).unwrap().remove(0);
    assert_eq!((row.message_count, row.input_tokens), (1, 7));
    assert_eq!(store.search("once", 5).unwrap().len(), 1, "no duplicate index entry");
}

#[test]
fn a_message_for_an_unknown_session_is_rejected() {
    let fx = fixture();
    let store = open(&fx, "default");
    let result = store.append_message(&message("m1", "missing", 1, Role::User, "x"));
    assert!(result.is_err(), "{result:?}");
}

#[test]
fn list_recent_orders_newest_first_and_respects_the_limit() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("old", "2026-01-01T00:00:00Z")).unwrap();
    store.create_session(&session("new", "2026-09-01T00:00:00Z")).unwrap();
    store.create_session(&session("mid", "2026-05-01T00:00:00Z")).unwrap();
    let ids: Vec<_> = store.list_recent(2).unwrap().into_iter().map(|s| s.id).collect();
    assert_eq!(ids, vec!["new", "mid"]);
}

#[test]
fn finishing_a_session_records_when_and_why() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    store.finish_session("s1", EndReason::Completed).unwrap();
    let row = store.list_recent(1).unwrap().remove(0);
    assert_eq!(row.end_reason, Some(EndReason::Completed));
    assert!(row.ended_at.is_some());
    assert!(matches!(store.finish_session("nope", EndReason::Cancelled), Err(SessionDbError::NotFound(_))));
}

#[test]
fn search_ignores_accents_case_and_unicode_form() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    store.append_message(&message("m1", "s1", 1, Role::User, "Tiếng Việt có dấu, đường đi")).unwrap();
    store.append_message(&message("m2", "s1", 2, Role::Assistant, "Plain ascii answer")).unwrap();
    let ids = |q: &str| -> Vec<String> { store.search(q, 5).unwrap().into_iter().map(|h| h.message_id).collect() };
    assert_eq!(ids("tieng"), vec!["m1"]);
    assert_eq!(ids("TIẾNG"), vec!["m1"]);
    assert_eq!(ids("duong"), vec!["m1"], "đ must fold to d");
    assert_eq!(ids("đường"), vec!["m1"]);
    // The same word typed with combining marks (NFD) finds the same message.
    assert_eq!(ids("Tie\u{302}\u{301}ng"), vec!["m1"]);
    assert_eq!(ids("ASCII"), vec!["m2"]);
    assert!(ids("absent").is_empty());
}

#[test]
fn search_hits_carry_a_readable_preview_of_the_original_text() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    store.append_message(&message("m1", "s1", 1, Role::User, "Tiếng Việt")).unwrap();
    let hit = store.search("tieng", 5).unwrap().remove(0);
    assert_eq!((hit.session_id.as_str(), hit.seq), ("s1", 1));
    assert!(hit.snippet.contains("Tiếng Việt"), "{}", hit.snippet);
}

#[test]
fn every_word_in_the_query_must_match_and_the_limit_is_respected() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    for n in 1..=4 {
        store.append_message(&message(&format!("m{n}"), "s1", n, Role::User, "shared word here")).unwrap();
    }
    store.append_message(&message("m5", "s1", 5, Role::User, "shared only")).unwrap();
    assert_eq!(store.search("shared word", 10).unwrap().len(), 4);
    assert_eq!(store.search("shared", 3).unwrap().len(), 3);
}

#[test]
fn hostile_search_input_never_errors_or_runs_as_query_syntax() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    store.append_message(&message("m1", "s1", 1, Role::User, "plain text about quotes and stars")).unwrap();
    let inputs = [
        "\"", "\"\"", "*", "a*", "NEAR(a b)", "a:b", "col:content", "-x", "a OR b", "a AND", "(", ")", "\\", "'", ";", "--", "%", "_", "",
        "   ", "\u{0}", "a\u{0}b", &"x".repeat(5000), "quotes\" OR 1=1 --",
    ];
    for input in inputs {
        let result = store.search(input, 5);
        assert!(result.is_ok(), "{input:?} must not fail: {result:?}");
    }
    assert_eq!(store.search("quotes", 5).unwrap().len(), 1);
    assert!(store.search("a OR b", 5).unwrap().is_empty(), "OR is just a word here");
}

#[test]
fn only_the_start_of_a_tool_result_is_indexed() {
    let fx = fixture();
    let store = open(&fx, "default");
    store.create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    let mut m = message("m1", "s1", 1, Role::User, "");
    let output = format!("earlyword {} lateword", "filler ".repeat(600));
    m.tool_result = Some(serde_json::json!({"call_id": "c", "output": output, "is_error": false}).to_string());
    store.append_message(&m).unwrap();
    assert_eq!(store.search("earlyword", 5).unwrap().len(), 1);
    assert!(store.search("lateword", 5).unwrap().is_empty(), "text past the cap is not indexed");
}

#[test]
fn the_migration_runner_upgrades_in_steps_keeps_data_and_is_repeatable() {
    let mut conn = rusqlite::Connection::open_in_memory().unwrap();
    let v1 = ["CREATE TABLE t (a TEXT NOT NULL);"];
    migrate(&mut conn, &v1).unwrap();
    conn.execute("INSERT INTO t (a) VALUES ('keep me')", []).unwrap();
    let v2 = [v1[0], "ALTER TABLE t ADD COLUMN b INTEGER NOT NULL DEFAULT 5;"];
    migrate(&mut conn, &v2).unwrap();
    migrate(&mut conn, &v2).unwrap();
    let (a, b): (String, i64) = conn.query_row("SELECT a, b FROM t", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert_eq!((a.as_str(), b), ("keep me", 5));
    assert_eq!(user_version(&conn).unwrap(), 2);
}

#[test]
fn a_failing_migration_step_rolls_back_and_leaves_the_version_alone() {
    let mut conn = rusqlite::Connection::open_in_memory().unwrap();
    let steps = ["CREATE TABLE t (a TEXT);", "CREATE TABLE t (a TEXT);"];
    assert!(migrate(&mut conn, &steps).is_err());
    assert_eq!(user_version(&conn).unwrap(), 1, "step 1 stays applied, step 2 did not");
}

#[test]
fn a_database_from_a_newer_program_is_refused_not_downgraded() {
    let fx = fixture();
    let root = StateRoot::for_profile(&fx.base, &ProfileName::default_profile());
    root.ensure_dir().unwrap();
    let conn = rusqlite::Connection::open(root.path(StateKind::SessionsDb)).unwrap();
    conn.pragma_update(None, "user_version", 99).unwrap();
    drop(conn);
    let result = SqliteSessionStore::open(&root);
    assert!(matches!(result, Err(SessionDbError::NewerSchema { found: 99, supported: 1 })), "{:?}", result.err());
}

#[test]
fn two_profiles_never_see_each_others_sessions_or_search_results() {
    let fx = fixture();
    let alpha = open(&fx, "alpha");
    let beta = open(&fx, "beta");
    alpha.create_session(&session("only-alpha", "2026-09-30T00:00:01Z")).unwrap();
    alpha.append_message(&message("m1", "only-alpha", 1, Role::User, "alpha private note")).unwrap();
    assert_eq!(alpha.search("private", 5).unwrap().len(), 1);
    assert!(beta.search("private", 5).unwrap().is_empty());
    assert!(beta.list_recent(10).unwrap().is_empty());
    assert!(beta.load_messages("only-alpha").unwrap().is_empty());
    let dirs: Vec<_> = std::fs::read_dir(fx.base.join(".yana-ai/profiles")).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(dirs.len(), 2);
}

#[test]
fn several_writers_on_the_same_database_all_succeed() {
    let fx = fixture();
    let root = StateRoot::for_profile(&fx.base, &ProfileName::default_profile());
    SqliteSessionStore::open(&root).unwrap().create_session(&session("s1", "2026-09-30T00:00:01Z")).unwrap();
    let handles: Vec<_> = (0..4u32)
        .map(|writer| {
            let root = root.clone();
            std::thread::spawn(move || {
                let store = SqliteSessionStore::open(&root).unwrap();
                for n in 0..25u32 {
                    let seq = writer * 25 + n + 1;
                    store.append_message(&message(&format!("w{writer}-{n}"), "s1", seq, Role::User, "concurrent")).unwrap();
                }
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }
    let store = SqliteSessionStore::open(&root).unwrap();
    assert_eq!(store.load_messages("s1").unwrap().len(), 100);
    assert_eq!(store.list_recent(1).unwrap()[0].message_count, 100);
}

#[test]
fn a_fresh_database_passes_the_integrity_check() {
    let fx = fixture();
    let store = open(&fx, "default");
    let report = store.integrity_check().unwrap();
    assert!(report.ok, "{report:?}");
}

#[test]
fn folding_maps_vietnamese_and_case_to_plain_lowercase() {
    assert_eq!(fold::fold("Đường Ơ Ư Ấ ệ"), "duong o u a e");
    assert_eq!(fold::fold("Tie\u{302}\u{301}ng"), "tieng");
    assert_eq!(fold::search_terms("  a-b  c_d \"x\" "), vec!["a", "b", "c", "d", "x"]);
    assert!(fold::search_terms("!!! ??? ***").is_empty());
}
