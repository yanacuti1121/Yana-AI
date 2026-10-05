use super::*;
use crate::session_db::ProfileName;

fn new_fact(key: &str, value: &str) -> NewFact {
    NewFact {
        key: key.to_string(),
        value: value.to_string(),
        tags: vec!["note".to_string()],
        agent: Some("tester".to_string()),
        confidence: "medium".to_string(),
        scope: "both".to_string(),
    }
}

fn memory_in(dir: &tempfile::TempDir) -> LocalMemory {
    LocalMemory::at(dir.path().join("l3.jsonl"))
}

fn lines(dir: &tempfile::TempDir) -> Vec<String> {
    std::fs::read_to_string(dir.path().join("l3.jsonl"))
        .unwrap_or_default()
        .lines()
        .map(str::to_string)
        .collect()
}

#[test]
fn remember_then_recall_finds_the_fact() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    let id = memory.remember(new_fact("editor-pref", "prefers helix over vim")).unwrap();
    let hits = memory.recall("helix", 5).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].fact.id, id);
    assert_eq!(memory.name(), "local");
}

#[test]
fn remembering_the_same_key_updates_in_place() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    let first = memory.remember(new_fact("db", "uses postgres")).unwrap();
    let before = memory.list(FactFilter::default()).unwrap();
    let second = memory.remember(new_fact("db", "uses sqlite")).unwrap();
    let after = memory.list(FactFilter::default()).unwrap();
    assert_eq!(first, second, "an update keeps the fact id");
    assert_eq!(after.len(), 1);
    assert_eq!(after[0].value, "uses sqlite");
    assert_eq!(after[0].created_at, before[0].created_at);
    assert_eq!(lines(&dir).len(), 1, "no duplicate line");
}

#[test]
fn forget_removes_by_full_id_or_unique_prefix_of_eight() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    let keep = memory.remember(new_fact("keep", "stays")).unwrap();
    let full = memory.remember(new_fact("gone-full", "by full id")).unwrap();
    let prefixed = memory.remember(new_fact("gone-prefix", "by prefix")).unwrap();
    assert!(memory.forget(&full).unwrap());
    assert!(memory.forget(&prefixed[..8]).unwrap());
    let left = memory.list(FactFilter::default()).unwrap();
    assert_eq!(left.iter().map(|f| f.id.clone()).collect::<Vec<_>>(), vec![keep]);
}

#[test]
fn forget_ignores_unknown_and_too_short_ids() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    let id = memory.remember(new_fact("a", "b")).unwrap();
    assert!(!memory.forget("00000000-0000-0000-0000-000000000000").unwrap());
    assert!(!memory.forget(&id[..3]).unwrap(), "a short prefix must not delete anything");
    assert!(!memory.forget("").unwrap());
    assert_eq!(memory.list(FactFilter::default()).unwrap().len(), 1);
}

#[test]
fn list_filters_by_tag_agent_and_keeps_the_last_n() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    for n in 0..4 {
        let mut fact = new_fact(&format!("k{n}"), "v");
        fact.tags = vec![if n % 2 == 0 { "even" } else { "odd" }.to_string()];
        fact.agent = Some(if n < 2 { "a1" } else { "a2" }.to_string());
        memory.remember(fact).unwrap();
    }
    let keys = |filter: FactFilter| -> Vec<String> {
        memory.list(filter).unwrap().into_iter().map(|f| f.key).collect()
    };
    assert_eq!(keys(FactFilter { tag: Some("even".into()), ..FactFilter::default() }), vec!["k0", "k2"]);
    assert_eq!(keys(FactFilter { agent: Some("a2".into()), ..FactFilter::default() }), vec!["k2", "k3"]);
    assert_eq!(keys(FactFilter { last: Some(1), ..FactFilter::default() }), vec!["k3"]);
}

#[test]
fn credentials_and_confidential_notes_are_refused_and_nothing_is_written() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    let secret = memory.remember(new_fact("aws", "AKIA0123456789ABCDEF"));
    assert!(matches!(secret, Err(MemoryError::Refused(_))), "memory accepted a credential-looking fact");
    let confidential = memory.remember(new_fact("deal", "M&A negotiation terms"));
    assert!(matches!(confidential, Err(MemoryError::Refused(_))), "memory accepted a confidential note");
    let in_tag = {
        let mut fact = new_fact("ok", "fine");
        fact.tags.push("sk-ant-api03-ABCDEFGHIJKLMNOP1234".to_string());
        memory.remember(fact)
    };
    assert!(matches!(in_tag, Err(MemoryError::Refused(_))), "tags are checked too");
    assert!(!dir.path().join("l3.jsonl").exists(), "a refusal must not create the file");
}

#[test]
fn empty_key_or_value_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    assert_eq!(memory.remember(new_fact("", "v")), Err(MemoryError::Empty("key")));
    assert_eq!(memory.remember(new_fact("k", "   ")), Err(MemoryError::Empty("value")));
}

#[test]
fn a_file_written_by_the_cli_is_read_and_unparseable_lines_survive_a_rewrite() {
    let dir = tempfile::tempdir().unwrap();
    let cli_fact = L3Fact {
        id: "11111111-2222-3333-4444-555555555555".to_string(),
        key: "legacy".to_string(),
        value: "written by the cli".to_string(),
        tags: vec![],
        agent: None,
        confidence: "high".to_string(),
        scope: "both".to_string(),
        created_at: "2026-01-01T00:00:00Z".to_string(),
        updated_at: "2026-01-01T00:00:00Z".to_string(),
        promoted: false,
    };
    let path = dir.path().join("l3.jsonl");
    std::fs::write(&path, format!("{}\nthis line is not json\n", serde_json::to_string(&cli_fact).unwrap())).unwrap();
    let memory = LocalMemory::at(path.clone());
    assert_eq!(memory.recall("legacy", 3).unwrap().len(), 1);
    memory.remember(new_fact("legacy", "updated through the provider")).unwrap();
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(text.contains("this line is not json"), "a rewrite must not drop lines it cannot read");
    assert_eq!(memory.list(FactFilter::default()).unwrap()[0].value, "updated through the provider");
}

#[test]
fn two_profiles_do_not_see_each_others_memory_and_write_only_inside_the_base() {
    let outer = tempfile::tempdir().unwrap();
    let base = outer.path().join("repo");
    std::fs::create_dir(&base).unwrap();
    let alpha = StateRoot::for_profile(&base, &ProfileName::new("alpha").unwrap());
    let beta = StateRoot::for_profile(&base, &ProfileName::new("beta").unwrap());
    let a = LocalMemory::open(&alpha).unwrap();
    let b = LocalMemory::open(&beta).unwrap();
    a.remember(new_fact("only-alpha", "alpha secret-free note")).unwrap();
    assert_eq!(a.recall("alpha", 5).unwrap().len(), 1);
    assert!(b.recall("alpha", 5).unwrap().is_empty());
    assert!(b.list(FactFilter::default()).unwrap().is_empty());
    assert!(alpha.path(StateKind::MemoryL3).exists());
    assert!(!beta.path(StateKind::MemoryL3).exists(), "beta wrote nothing");
    let top: Vec<_> = std::fs::read_dir(outer.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(top, vec![std::ffi::OsString::from("repo")]);
}

#[test]
fn recall_on_a_missing_file_is_empty_not_an_error() {
    let dir = tempfile::tempdir().unwrap();
    let memory = memory_in(&dir);
    assert!(memory.recall("anything", 3).unwrap().is_empty());
    assert!(memory.list(FactFilter::default()).unwrap().is_empty());
    assert!(!memory.forget("whatever-id-here").unwrap());
}
