//! A server's answer as bounded plain text for the model (WS3, contract section 17).
//!
//! Nothing a server says is trusted. Locations are turned into repository-relative
//! paths and a `file:` URI outside the repository is reported as such without being
//! repeated or opened. Names and documentation are cut and have control and
//! invisible characters masked. The caller still passes the whole text through
//! `untrusted::guard`, because a name or a documentation comment can say anything.

use super::operation::{character_at, relative_from_uri, Operation};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

/// Most locations or symbols listed.
pub const MAX_ENTRIES: usize = 200;
/// Most text returned in all.
pub const MAX_TEXT_BYTES: usize = 64 * 1024;
/// Most distinct files read to show source lines next to locations.
const MAX_FILES_READ: usize = 20;
/// Longest source line, name or documentation fragment shown.
const MAX_SNIPPET_CHARS: usize = 160;
const MAX_NAME_CHARS: usize = 120;
const MAX_HOVER_CHARS: usize = 8 * 1024;
/// Deepest level of a symbol tree followed.
const MAX_SYMBOL_DEPTH: usize = 8;
const OUTSIDE: &str = "<outside repository>";

fn clean(text: &str, limit: usize, keep_newlines: bool) -> String {
    let mut shown: String = text
        .chars()
        .map(|c| match c {
            '\n' if keep_newlines => '\n',
            c if c.is_control() || crate::capability::untrusted::is_invisible_format_char(c) => '?',
            c => c,
        })
        .take(limit)
        .collect();
    if text.chars().nth(limit).is_some() {
        shown.push_str("...");
    }
    shown
}

fn cut_to_bytes(mut text: String) -> String {
    if text.len() > MAX_TEXT_BYTES {
        let mut end = MAX_TEXT_BYTES;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
        text.push_str("\n[output cut]");
    }
    text
}

/// Source lines of repository files, read through the repository's own bounded
/// reader, a few files at most.
struct Sources<'a> {
    root: &'a Path,
    files: HashMap<String, Option<Vec<String>>>,
}

impl Sources<'_> {
    fn line(&mut self, relative: &str, line: u32) -> Option<String> {
        if !self.files.contains_key(relative) && self.files.len() >= MAX_FILES_READ {
            return None;
        }
        let root = self.root;
        let lines = self.files.entry(relative.to_string()).or_insert_with(|| {
            crate::capability::read_file_observation(root, relative).ok().map(|o| o.content.lines().map(str::to_string).collect())
        });
        lines.as_ref()?.get(line as usize).cloned()
    }
}

/// `(uri, 0-based line, 0-based UTF-16 character)` of a Location or LocationLink.
fn place(item: &Value) -> Option<(&str, u32, u32)> {
    let (uri, range) = match item.get("targetUri") {
        Some(uri) => (uri.as_str()?, item.get("targetSelectionRange").or_else(|| item.get("targetRange"))?),
        None => (item.get("uri")?.as_str()?, item.get("range")?),
    };
    let start = range.get("start")?;
    let number = |name: &str| start.get(name).and_then(Value::as_u64).map(|v| v.min(u64::from(u32::MAX)) as u32);
    Some((uri, number("line")?, number("character")?))
}

fn locations(result: &Value, root: &Path) -> String {
    let items: Vec<&Value> = match result {
        Value::Array(items) => items.iter().collect(),
        Value::Null => Vec::new(),
        single => vec![single],
    };
    if items.is_empty() {
        return "no results".to_string();
    }
    let mut sources = Sources { root, files: HashMap::new() };
    let mut out = Vec::new();
    for item in items.iter().take(MAX_ENTRIES) {
        let Some((uri, line, utf16)) = place(item) else { continue };
        let Some(relative) = relative_from_uri(root, uri) else {
            out.push(OUTSIDE.to_string());
            continue;
        };
        let source = sources.line(&relative, line);
        let column = source.as_deref().map_or(utf16 + 1, |text| character_at(text, utf16));
        let snippet = source.map(|text| format!("  | {}", clean(text.trim(), MAX_SNIPPET_CHARS, false))).unwrap_or_default();
        out.push(format!("{}:{}:{}{}", clean(&relative, MAX_NAME_CHARS * 2, false), line + 1, column, snippet));
    }
    if items.len() > MAX_ENTRIES {
        out.push(format!("... {} more not shown", items.len() - MAX_ENTRIES));
    }
    if out.is_empty() {
        return "no results".to_string();
    }
    out.join("\n")
}

/// A hover's text: a string, a `{language, value}` pair, a `{kind, value}` markup
/// content, or an array of those.
fn hover_text(contents: &Value) -> String {
    match contents {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts.iter().map(hover_text).collect::<Vec<_>>().join("\n"),
        Value::Object(map) => map.get("value").and_then(Value::as_str).unwrap_or("").to_string(),
        _ => String::new(),
    }
}

fn hover(result: &Value) -> String {
    let text = result.get("contents").map(hover_text).unwrap_or_default();
    if text.trim().is_empty() {
        return "no results".to_string();
    }
    clean(&text, MAX_HOVER_CHARS, true)
}

fn kind_name(kind: u64) -> &'static str {
    const NAMES: [&str; 26] = [
        "file", "module", "namespace", "package", "class", "method", "property", "field", "constructor", "enum", "interface", "function",
        "variable", "constant", "string", "number", "boolean", "array", "object", "key", "null", "enum member", "struct", "event", "operator",
        "type parameter",
    ];
    kind.checked_sub(1).and_then(|n| NAMES.get(n as usize)).copied().unwrap_or("symbol")
}

fn symbol_line(item: &Value) -> Option<u32> {
    let range = item.get("selectionRange").or_else(|| item.get("range")).or_else(|| item.get("location").and_then(|l| l.get("range")))?;
    range.get("start")?.get("line")?.as_u64().map(|v| v.min(u64::from(u32::MAX)) as u32 + 1)
}

fn symbols(items: &[Value], depth: usize, out: &mut Vec<String>, seen: &mut usize) {
    for item in items {
        if *seen >= MAX_ENTRIES {
            return;
        }
        *seen += 1;
        let name = clean(item.get("name").and_then(Value::as_str).unwrap_or("?"), MAX_NAME_CHARS, false);
        let kind = kind_name(item.get("kind").and_then(Value::as_u64).unwrap_or(0));
        let at = symbol_line(item).map(|n| format!(" (line {n})")).unwrap_or_default();
        out.push(format!("{}{kind} {name}{at}", "  ".repeat(depth)));
        if let (Some(children), true) = (item.get("children").and_then(Value::as_array), depth + 1 < MAX_SYMBOL_DEPTH) {
            symbols(children, depth + 1, out, seen);
        }
    }
}

fn document_symbols(result: &Value) -> String {
    let Some(items) = result.as_array().filter(|items| !items.is_empty()) else {
        return "no results".to_string();
    };
    let mut out = Vec::new();
    let mut seen = 0;
    symbols(items, 0, &mut out, &mut seen);
    if seen >= MAX_ENTRIES {
        out.push("... more not shown".to_string());
    }
    out.join("\n")
}

/// The server's `result` for `operation` as text for the model.
pub fn present(operation: Operation, result: &Value, root: &Path) -> String {
    cut_to_bytes(match operation {
        Operation::Definition | Operation::References => locations(result, root),
        Operation::Hover => hover(result),
        Operation::DocumentSymbols => document_symbols(result),
    })
}

#[cfg(test)]
mod tests {
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
        json!({"uri": uri, "range": {"start": {"line": line, "character": character}, "end": {"line": line, "character": character + 1}}})
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
        // In "<emoji> let beta" the emoji is 2 UTF-16 units; offset 4 is the 3rd character, 'l' of 'let'.
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
        assert_eq!(tree.lines().count(), MAX_SYMBOL_DEPTH, "following stops at the depth limit");
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
        let files: Vec<Value> = (0..MAX_FILES_READ + 10).map(|n| location(&at(&root, &format!("src/f{n}.rs")), 0, 0)).collect();
        let text = present(Operation::References, &json!(files), &root);
        assert_eq!(text.lines().count(), MAX_FILES_READ + 10, "every location is still listed");
    }
}
