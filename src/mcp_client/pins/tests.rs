use super::*;
use serde_json::json;

fn tool(description: &str) -> Value {
    json!({"name": "echo", "description": description, "inputSchema": {"type": "object", "properties": {"b": {}, "a": {}}}})
}

#[test]
fn key_order_and_meta_do_not_change_the_hash() {
    let reordered = json!({"inputSchema": {"properties": {"a": {}, "b": {}}, "type": "object"}, "description": "d", "name": "echo", "_meta": {"seen_at": 1}});
    assert_eq!(hash_definition(&tool("d")), hash_definition(&reordered));
}

#[test]
fn description_schema_name_and_annotations_each_change_the_hash() {
    let base = hash_definition(&tool("d"));
    assert_ne!(base, hash_definition(&tool("d, now also sends your files")));
    let mut other_schema = tool("d");
    other_schema["inputSchema"]["properties"]["c"] = json!({});
    assert_ne!(base, hash_definition(&other_schema));
    let mut renamed = tool("d");
    renamed["name"] = json!("echo2");
    assert_ne!(base, hash_definition(&renamed));
    let mut annotated = tool("d");
    annotated["annotations"] = json!({"readOnlyHint": true});
    assert_ne!(base, hash_definition(&annotated));
}

#[test]
fn boundary_inputs_hash_without_panic() {
    for value in [json!(null), json!({}), json!([]), json!("x"), json!({"name": "a\u{0}b"}), tool(&"x".repeat(65_536))] {
        assert_eq!(hash_definition(&value).len(), 64);
    }
    assert_eq!(hash_definition(&json!(null)), hash_definition(&json!({})), "no known fields hashes alike");
}

fn store() -> (tempfile::TempDir, PinStore) {
    let dir = tempfile::tempdir().unwrap();
    let store = PinStore::for_root(dir.path());
    (dir, store)
}

#[test]
fn new_then_match_then_changed() {
    let (_dir, store) = store();
    assert_eq!(store.check("s", "echo", "h1").unwrap(), Pin::New);
    store.record_new("s", &[("echo".into(), "h1".into())]).unwrap();
    assert_eq!(store.check("s", "echo", "h1").unwrap(), Pin::Match);
    assert_eq!(store.check("s", "echo", "h2").unwrap(), Pin::Changed);
    assert_eq!(store.check("other", "echo", "h2").unwrap(), Pin::New, "pins are per server");
}

#[test]
fn recording_never_overwrites_a_pinned_hash() {
    let (_dir, store) = store();
    store.record_new("s", &[("echo".into(), "h1".into())]).unwrap();
    store.record_new("s", &[("echo".into(), "EVIL".into()), ("more".into(), "h3".into())]).unwrap();
    assert_eq!(store.check("s", "echo", "h1").unwrap(), Pin::Match);
    assert_eq!(store.check("s", "more", "h3").unwrap(), Pin::Match);
}

#[test]
fn a_broken_pin_file_refuses_instead_of_pinning_nothing() {
    let (dir, store) = store();
    std::fs::create_dir_all(dir.path().join(".yana-ai")).unwrap();
    for bad in ["{not json", "[1,2]", "\u{0}"] {
        std::fs::write(dir.path().join(PINS_PATH), bad).unwrap();
        assert!(store.check("s", "echo", "h").is_err(), "{bad:?}");
        assert!(store.record_new("s", &[("echo".into(), "h".into())]).is_err(), "{bad:?}");
    }
}

#[test]
fn an_oversized_or_symlinked_pin_file_refuses() {
    let (dir, store) = store();
    std::fs::create_dir_all(dir.path().join(".yana-ai")).unwrap();
    std::fs::write(dir.path().join(PINS_PATH), vec![b' '; (MAX_PINS_BYTES + 1) as usize]).unwrap();
    assert!(store.check("s", "echo", "h").is_err());
    std::fs::remove_file(dir.path().join(PINS_PATH)).unwrap();
    std::fs::write(dir.path().join("real.json"), "{}").unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(dir.path().join("real.json"), dir.path().join(PINS_PATH)).unwrap();
        assert!(store.check("s", "echo", "h").is_err(), "a symlink is not followed");
    }
}

#[test]
fn many_tools_and_hostile_names_round_trip() {
    let (_dir, store) = store();
    let tools: Vec<(String, String)> = (0..500).map(|n| (format!("t{n}"), format!("h{n}"))).collect();
    store.record_new("s", &tools).unwrap();
    assert_eq!(store.check("s", "t499", "h499").unwrap(), Pin::Match);
    store.record_new("s", &[("a\"b\\c".into(), "h".into())]).unwrap();
    assert_eq!(store.check("s", "a\"b\\c", "h").unwrap(), Pin::Match);
}
