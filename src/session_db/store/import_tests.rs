//! Importing the JSONL chat history into the database.

use super::tests::{fixture, open};
use super::*;
use serde_json::json;
use std::path::Path;

fn line(session: &str, id: &str, role: &str, content: &str, second: u32) -> String {
    json!({
        "schema_version": "1.0", "session_id": session, "id": id,
        "ts": format!("2026-09-30T00:00:{second:02}Z"), "role": role, "content": content,
        "provider": "ollama", "model": "llama3", "input_tokens": if role == "user" { json!(5) } else { json!(null) },
        "output_tokens": if role == "assistant" { json!(9) } else { json!(null) }
    })
    .to_string()
}

fn write_history(dir: &Path, session: &str, lines: &[String]) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(dir.join(format!("{session}.jsonl")), lines.join("\n") + "\n").unwrap();
}

fn write_meta(dir: &Path, session: &str, title: &str) {
    let meta = json!({
        "schema_version": "1.0", "session_id": session, "title": title,
        "created_at": "2026-09-29T10:00:00Z", "updated_at": "2026-09-30T00:00:09Z",
        "provider": "anthropic", "model": "claude-x", "system_prompt": null
    });
    std::fs::write(dir.join(format!("{session}.meta.json")), meta.to_string()).unwrap();
}

#[test]
fn a_session_is_imported_with_its_metadata_messages_and_totals() {
    let fx = fixture();
    let store = open(&fx, "default");
    let dir = fx.base.join("history");
    write_history(&dir, "s1", &[line("s1", "a", "user", "hello", 1), line("s1", "b", "assistant", "hi there", 2)]);
    write_meta(&dir, "s1", "My chat");
    let report = import_chat_history(&store, &dir).unwrap();
    assert_eq!((report.sessions_seen, report.messages_added, report.messages_existing), (1, 2, 0));
    let row = store.list_recent(5).unwrap().remove(0);
    assert_eq!((row.id.as_str(), row.title.as_str()), ("s1", "My chat"));
    assert_eq!((row.provider.as_str(), row.model.as_str()), ("anthropic", "claude-x"));
    assert_eq!((row.message_count, row.input_tokens, row.output_tokens), (2, 5, 9));
    assert_eq!(row.end_reason, Some(EndReason::Imported));
    let messages = store.load_messages("s1").unwrap();
    assert_eq!(messages.iter().map(|m| m.seq).collect::<Vec<_>>(), vec![1, 2]);
    assert_eq!(store.search("hello", 5).unwrap().len(), 1);
}

#[test]
fn importing_twice_adds_nothing_and_picks_up_lines_appended_since() {
    let fx = fixture();
    let store = open(&fx, "default");
    let dir = fx.base.join("history");
    write_history(&dir, "s1", &[line("s1", "a", "user", "one", 1), line("s1", "b", "assistant", "two", 2)]);
    import_chat_history(&store, &dir).unwrap();
    let again = import_chat_history(&store, &dir).unwrap();
    assert_eq!((again.messages_added, again.messages_existing), (0, 2));
    write_history(&dir, "s1", &[
        line("s1", "a", "user", "one", 1), line("s1", "b", "assistant", "two", 2),
        line("s1", "c", "user", "three", 3), line("s1", "d", "assistant", "four", 4),
    ]);
    let third = import_chat_history(&store, &dir).unwrap();
    assert_eq!((third.messages_added, third.messages_existing), (2, 2));
    assert_eq!(store.list_recent(1).unwrap()[0].message_count, 4);
}

#[test]
fn a_session_without_a_meta_file_gets_a_title_and_model_from_its_lines() {
    let fx = fixture();
    let store = open(&fx, "default");
    let dir = fx.base.join("history");
    write_history(&dir, "bare", &[line("bare", "a", "user", "Xin chào, giúp tôi với", 1)]);
    import_chat_history(&store, &dir).unwrap();
    let row = store.list_recent(1).unwrap().remove(0);
    assert_eq!(row.title, "Xin chào, giúp tôi với");
    assert_eq!((row.provider.as_str(), row.model.as_str()), ("ollama", "llama3"));
}

#[test]
fn unreadable_and_torn_lines_are_skipped_reported_and_numbering_stays_contiguous() {
    let fx = fixture();
    let store = open(&fx, "default");
    let dir = fx.base.join("history");
    let torn = r#"{"schema_version":"1.0","session_id":"s1","id":"z","ts":"2026"#.to_string();
    write_history(&dir, "s1", &[
        line("s1", "a", "user", "first", 1),
        "this is not json".to_string(),
        line("s1", "b", "assistant", "second", 2),
        torn,
    ]);
    let report = import_chat_history(&store, &dir).unwrap();
    assert_eq!(report.messages_added, 2);
    let lines: Vec<usize> = report.problems.iter().map(|p| p.line).collect();
    assert_eq!(lines, vec![2, 4]);
    assert!(report.problems.iter().all(|p| p.file.ends_with("s1.jsonl")));
    let seqs: Vec<u32> = store.load_messages("s1").unwrap().iter().map(|m| m.seq).collect();
    assert_eq!(seqs, vec![1, 2]);
}

#[test]
fn tool_calls_and_results_are_kept_as_json() {
    let fx = fixture();
    let store = open(&fx, "default");
    let dir = fx.base.join("history");
    let call = json!({"schema_version": "1.0", "session_id": "s1", "id": "c", "ts": "2026-09-30T00:00:01Z",
        "role": "assistant", "content": "", "tool_call": {"id": "call1", "name": "read_file", "arguments_json": "{}"}});
    let result = json!({"schema_version": "1.0", "session_id": "s1", "id": "r", "ts": "2026-09-30T00:00:02Z",
        "role": "user", "content": "", "tool_result": {"call_id": "call1", "output": "file text", "is_error": false, "denied": false}});
    write_history(&dir, "s1", &[call.to_string(), result.to_string()]);
    import_chat_history(&store, &dir).unwrap();
    let messages = store.load_messages("s1").unwrap();
    assert!(messages[0].tool_call.as_deref().unwrap().contains("read_file"));
    assert!(messages[1].tool_result.as_deref().unwrap().contains("file text"));
    assert_eq!(store.search("file text", 5).unwrap().len(), 1, "tool output is searchable");
}

#[test]
fn files_with_unsafe_names_are_skipped_and_reported() {
    let fx = fixture();
    let store = open(&fx, "default");
    let dir = fx.base.join("history");
    write_history(&dir, "bad name!", &[line("x", "a", "user", "x", 1)]);
    write_history(&dir, "good", &[line("good", "b", "user", "y", 1)]);
    let report = import_chat_history(&store, &dir).unwrap();
    assert_eq!(report.sessions_seen, 1);
    assert_eq!(report.skipped_files.len(), 1);
    assert!(report.skipped_files[0].0.contains("bad name!"));
}

#[test]
fn the_source_files_are_never_changed_and_a_missing_directory_is_fine() {
    let fx = fixture();
    let store = open(&fx, "default");
    let dir = fx.base.join("history");
    write_history(&dir, "s1", &[line("s1", "a", "user", "keep", 1), "garbage".to_string()]);
    write_meta(&dir, "s1", "t");
    let before = (std::fs::read(dir.join("s1.jsonl")).unwrap(), std::fs::read(dir.join("s1.meta.json")).unwrap());
    import_chat_history(&store, &dir).unwrap();
    let after = (std::fs::read(dir.join("s1.jsonl")).unwrap(), std::fs::read(dir.join("s1.meta.json")).unwrap());
    assert_eq!(before, after);
    let missing = import_chat_history(&store, &fx.base.join("no-such-dir")).unwrap();
    assert_eq!((missing.sessions_seen, missing.messages_added), (0, 0));
}
