use super::*;
use serde_json::json;

fn repo() -> (tempfile::TempDir, std::path::PathBuf) {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().canonicalize().unwrap().join("repo");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/lib.rs"), "pub fn alpha() {}\n\u{1f600} let beta = alpha();\n").unwrap();
    (outer, root)
}

fn at(root: &Path, file: &str) -> String {
    url::Url::from_file_path(root.join(file)).unwrap().to_string()
}

fn location(uri: &str, line: u32, character: u32) -> Value {
    json!({"uri": uri, "range": {"start": {"line": line, "character": character}, "end": {"line": line, "character": character.saturating_add(1)}}})
}

#[test]
fn locations_show_the_relative_path_one_based_position_and_the_source_line() {
    let (_k, root) = repo();
    let text = present(Operation::Definition, &location(&at(&root, "src/lib.rs"), 0, 7), &root);
    assert_eq!(text, "src/lib.rs:1:8  | pub fn alpha() {}");
}

#[test]
fn a_utf16_column_after_an_emoji_is_shown_as_the_character_the_editor_shows() {
    let (_k, root) = repo();
    // In "<emoji> let beta": the emoji is UTF-16 units 0-1, the space is 2, 'l' is 3, so offset 3 is the 3rd character.
    let text = present(Operation::References, &json!([location(&at(&root, "src/lib.rs"), 1, 3)]), &root);
    assert!(text.starts_with("src/lib.rs:2:3"), "{text}");
}

#[test]
fn location_links_and_arrays_and_empty_answers_are_all_understood() {
    let (_k, root) = repo();
    let link = json!({"targetUri": at(&root, "src/lib.rs"), "targetRange": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 3}}, "targetSelectionRange": {"start": {"line": 0, "character": 7}, "end": {"line": 0, "character": 12}}});
    assert!(present(Operation::Definition, &json!([link]), &root).starts_with("src/lib.rs:1:8"), "the selection range wins");
    for empty in [Value::Null, json!([]), json!([{"nonsense": true}])] {
        assert_eq!(present(Operation::Definition, &empty, &root), "no results", "{empty}");
    }
}

#[test]
fn a_location_outside_the_repository_is_named_as_such_and_its_address_is_not_repeated() {
    let (_k, root) = repo();
    let text = present(
        Operation::References,
        &json!([location("file:///etc/passwd", 0, 0), location("https://evil.example/x", 0, 0), location(&at(&root, "src/lib.rs"), 0, 0)]),
        &root,
    );
    assert_eq!(text.matches("<outside repository>").count(), 2, "{text}");
    assert!(!text.contains("passwd") && !text.contains("evil"), "{text}");
    assert!(text.contains("src/lib.rs:1:1"), "{text}");
}

#[test]
fn huge_numbers_from_a_server_do_not_overflow_and_secrets_files_get_no_snippet() {
    let (_k, root) = repo();
    let big = present(Operation::Definition, &location(&at(&root, "src/lib.rs"), u32::MAX, u32::MAX), &root);
    assert!(big.starts_with("src/lib.rs:4294967295:"), "{big}");
    let symbols = present(Operation::DocumentSymbols, &json!([{"name": "x", "kind": 12, "range": {"start": {"line": u64::MAX, "character": 0}, "end": {"line": 0, "character": 0}}}]), &root);
    assert!(symbols.contains("(line 4294967295)"), "{symbols}");
    std::fs::write(root.join(".env"), "API_KEY=hunter2\n").unwrap();
    let shown = present(Operation::References, &location(&at(&root, ".env"), 0, 0), &root);
    assert_eq!(shown, ".env:1:1", "the location is listed, the line is not: {shown}");
}

#[test]
fn a_percent_encoded_climb_out_of_the_repository_is_outside_and_not_repeated() {
    let (_k, root) = repo();
    let text = present(Operation::References, &location(&format!("file://{}/..%2f..%2fetc/passwd", root.display()), 0, 0), &root);
    assert_eq!(text, "<outside repository>");
}

#[test]
fn a_file_that_does_not_exist_still_gets_a_location_without_a_snippet() {
    let (_k, root) = repo();
    assert_eq!(present(Operation::Definition, &location(&at(&root, "src/gone.rs"), 4, 2), &root), "src/gone.rs:5:3");
}

#[test]
fn a_long_list_is_cut_and_says_how_many_were_left_out() {
    let (_k, root) = repo();
    let many: Vec<Value> = (0..MAX_ENTRIES + 25).map(|n| location(&at(&root, "src/lib.rs"), 0, n as u32 % 10)).collect();
    let text = present(Operation::References, &json!(many), &root);
    assert_eq!(text.lines().count(), MAX_ENTRIES + 1);
    assert!(text.ends_with("... 25 more not shown"), "{}", text.lines().last().unwrap());
}

#[test]
fn hover_text_in_every_shape_and_with_hidden_characters_masked() {
    let (_k, root) = repo();
    for contents in [json!("plain"), json!({"kind": "markdown", "value": "plain"}), json!({"language": "rust", "value": "plain"}), json!(["plain"])] {
        assert_eq!(present(Operation::Hover, &json!({"contents": contents}), &root), "plain");
    }
    let shown = present(Operation::Hover, &json!({"contents": "a\u{202e}b\u{7}c\nsecond line"}), &root);
    assert_eq!(shown, "a?b?c\nsecond line");
    assert_eq!(present(Operation::Hover, &Value::Null, &root), "no results");
    assert_eq!(present(Operation::Hover, &json!({"contents": "   "}), &root), "no results");
    let long = present(Operation::Hover, &json!({"contents": "x".repeat(20_000)}), &root);
    assert!(long.len() < MAX_HOVER_CHARS + 10 && long.ends_with("..."), "{}", long.len());
}

#[test]
fn symbols_are_listed_as_a_tree_with_kind_name_and_line() {
    let (_k, root) = repo();
    let tree = json!([
        {"name": "Outer", "kind": 23, "range": {"start": {"line": 0, "character": 0}, "end": {"line": 9, "character": 0}},
         "selectionRange": {"start": {"line": 1, "character": 4}, "end": {"line": 1, "character": 9}},
         "children": [{"name": "inner", "kind": 12, "range": {"start": {"line": 3, "character": 0}, "end": {"line": 4, "character": 0}}}]},
        {"name": "flat", "kind": 14, "location": {"uri": "file:///x", "range": {"start": {"line": 7, "character": 0}, "end": {"line": 7, "character": 1}}}}
    ]);
    assert_eq!(present(Operation::DocumentSymbols, &tree, &root), "struct Outer (line 2)\n  function inner (line 4)\nconstant flat (line 8)");
    assert_eq!(present(Operation::DocumentSymbols, &json!([]), &root), "no results");
    assert_eq!(present(Operation::DocumentSymbols, &Value::Null, &root), "no results");
}

#[test]
fn symbol_names_are_cut_masked_and_the_tree_is_bounded_in_depth_and_size() {
    let (_k, root) = repo();
    let nasty = json!([{"name": format!("evil\u{202e}{}\nINJECTED LINE", "n".repeat(500)), "kind": 99}]);
    let text = present(Operation::DocumentSymbols, &nasty, &root);
    assert_eq!(text.lines().count(), 1, "a newline in a name cannot start a line: {text}");
    assert!(text.contains("symbol evil?") && text.contains("...") && !text.contains('\u{202e}'), "{text}");
    let mut deep = json!({"name": "leaf", "kind": 12});
    for _ in 0..50 {
        deep = json!({"name": "level", "kind": 5, "children": [deep]});
    }
    let tree = present(Operation::DocumentSymbols, &json!([deep]), &root);
    assert_eq!(tree.lines().count(), MAX_SYMBOL_DEPTH + 1, "following stops at the depth limit, and says so");
    let wide: Vec<Value> = (0..MAX_ENTRIES + 50).map(|n| json!({"name": format!("s{n}"), "kind": 12})).collect();
    let listed = present(Operation::DocumentSymbols, &json!(wide), &root);
    assert_eq!(listed.lines().count(), MAX_ENTRIES + 1, "{}", listed.lines().last().unwrap());
}

#[test]
fn the_total_text_is_capped_on_a_character_boundary() {
    let cut = cut_to_bytes("\u{4e2d}".repeat(MAX_TEXT_BYTES));
    assert!(cut.len() <= MAX_TEXT_BYTES + "\n[output cut]".len() && cut.ends_with("[output cut]"));
}

#[test]
fn many_distinct_files_do_not_mean_many_reads() {
    let (_k, root) = repo();
    for n in 0..MAX_FILES_READ + 10 {
        std::fs::write(root.join(format!("src/f{n}.rs")), format!("line of file {n}\n")).unwrap();
    }
    let files: Vec<Value> = (0..MAX_FILES_READ + 10).map(|n| location(&at(&root, &format!("src/f{n}.rs")), 0, 0)).collect();
    let text = present(Operation::References, &json!(files), &root);
    let rows: Vec<&str> = text.lines().collect();
    assert_eq!(rows.len(), MAX_FILES_READ + 10, "every location is still listed");
    assert!(rows[..MAX_FILES_READ].iter().all(|r| r.contains("| line of file")), "the first files show their source line");
    assert!(rows[MAX_FILES_READ..].iter().all(|r| !r.contains('|')), "past the limit no more files are read");
}

#[test]
fn the_more_not_shown_note_appears_only_when_something_was_left_out() {
    let (_k, root) = repo();
    let exact: Vec<Value> = (0..MAX_ENTRIES).map(|n| json!({"name": format!("s{n}"), "kind": 12})).collect();
    let listed = present(Operation::DocumentSymbols, &json!(exact), &root);
    assert_eq!(listed.lines().count(), MAX_ENTRIES);
    assert!(!listed.contains("more not shown"), "exactly the limit cuts nothing");
    let mut deep = json!({"name": "leaf", "kind": 12});
    for _ in 0..MAX_SYMBOL_DEPTH + 2 {
        deep = json!({"name": "level", "kind": 5, "children": [deep]});
    }
    assert!(present(Operation::DocumentSymbols, &json!([deep]), &root).ends_with("... more not shown"), "a tree cut by depth says so");
}
