//! A server's answer as bounded plain text for the model (WS3, contract section 17).
//!
//! Nothing a server says is trusted. Locations are turned into repository-relative
//! paths and a `file:` URI outside the repository is reported as such without being
//! repeated or opened. Names and documentation are cut and have control and
//! invisible characters masked. The caller still passes the whole text through
//! `untrusted::guard`, because a name or a documentation comment can say anything.

use super::operation::{character_at, relative_from_uri, sensitive_path, Operation};
use crate::capability::{resolve_existing, CapabilityError};
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
        // Where the path really leads: a link inside the repository can point at a secrets file or out of it.
        let readable = match resolve_existing(root, &relative) {
            Ok(resolved) => resolved.strip_prefix(root).ok().and_then(Path::to_str).map(str::to_string),
            Err(CapabilityError::PathEscape { .. }) => None,
            Err(_) => Some(relative.clone()),
        };
        let Some(readable) = readable else {
            out.push(OUTSIDE.to_string());
            continue;
        };
        // A server must not get lines of a secrets file shown to the model.
        let source = if sensitive_path(&relative) || sensitive_path(&readable) { None } else { sources.line(&readable, line) };
        let column = source.as_deref().map_or(utf16.saturating_add(1), |text| character_at(text, utf16));
        let snippet = source.map(|text| format!("  | {}", clean(text.trim(), MAX_SNIPPET_CHARS, false))).unwrap_or_default();
        out.push(format!("{}:{}:{}{}", clean(&relative, MAX_NAME_CHARS * 2, false), line.saturating_add(1), column, snippet));
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
    range.get("start")?.get("line")?.as_u64().map(|v| v.min(u64::from(u32::MAX)) as u32).map(|v| v.saturating_add(1))
}

/// Lists `items`; sets `cut` when something was left out (too many, or too deep).
fn symbols(items: &[Value], depth: usize, out: &mut Vec<String>, seen: &mut usize, cut: &mut bool) {
    for item in items {
        if *seen >= MAX_ENTRIES {
            *cut = true;
            return;
        }
        *seen += 1;
        let name = clean(item.get("name").and_then(Value::as_str).unwrap_or("?"), MAX_NAME_CHARS, false);
        let kind = kind_name(item.get("kind").and_then(Value::as_u64).unwrap_or(0));
        let at = symbol_line(item).map(|n| format!(" (line {n})")).unwrap_or_default();
        out.push(format!("{}{kind} {name}{at}", "  ".repeat(depth)));
        match (item.get("children").and_then(Value::as_array), depth + 1 < MAX_SYMBOL_DEPTH) {
            (Some(children), true) => symbols(children, depth + 1, out, seen, cut),
            (Some(children), false) if !children.is_empty() => *cut = true,
            _ => {}
        }
    }
}

fn document_symbols(result: &Value) -> String {
    let Some(items) = result.as_array().filter(|items| !items.is_empty()) else {
        return "no results".to_string();
    };
    let mut out = Vec::new();
    let mut seen = 0;
    let mut cut = false;
    symbols(items, 0, &mut out, &mut seen, &mut cut);
    if cut {
        out.push("... more not shown".to_string());
    }
    out.join("\n")
}

/// The server's `result` for `operation` as text for the model.
pub fn present(operation: Operation, result: &Value, root: &Path) -> String {
    // Server URIs are compared with the canonical root (macOS /var is really /private/var).
    let canonical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let root = canonical.as_path();
    cut_to_bytes(match operation {
        Operation::Definition | Operation::References => locations(result, root),
        Operation::Hover => hover(result),
        Operation::DocumentSymbols => document_symbols(result),
    })
}

#[cfg(test)]
mod tests;
