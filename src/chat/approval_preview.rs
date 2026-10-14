//! Bounded, redacted preview of what a governed file write would change, for
//! GUI clients of `chat --headless`.
//!
//! Before this module the headless approval event carried only the tool name
//! for `write_file` / `write_config`, so a human approving the call in the IDE
//! could not see which file or which lines it touches. This builds the same
//! read-only proposal the terminal UI shows (`propose_file_write`, no
//! filesystem write) and projects it to a small JSON value: compact hunks, a
//! line cap, and whole-line redaction of anything that looks like a secret.
//! It never applies anything and adds no approval path of its own.

use crate::capability::patch::MatchLevel;
use crate::capability::{file_patch, propose_config_write, propose_file_write, FileMutationDiff, FileMutationKind};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;

/// Lines of preview sent to the client. A larger change is cut with a marker.
const MAX_PREVIEW_LINES: usize = 200;
/// Characters kept per line; the rest is replaced by an ellipsis.
const MAX_LINE_CHARS: usize = 240;
/// Unchanged lines kept around each changed line.
const CONTEXT_LINES: usize = 2;
/// Same marker the summary redaction uses (`headless::redact_secret_like`).
const ELIDED: &str = "  …";

#[derive(Deserialize)]
struct WriteArgs {
    path: String,
    content: String,
    kind: String,
}

/// Preview for a `write_file`, `write_config` or `patch_file` call; `None` for any other tool.
/// Failures (bad arguments, path outside the repo, file exists, an edit that does not match, too
/// large) come back as `{ "error": ... }` so the client can say why the call cannot work instead of
/// showing an approval card with nothing on it.
pub(super) fn for_call(root: &Path, tool: &str, arguments_json: &str) -> Option<Value> {
    match tool {
        "write_file" => Some(write_preview(root, arguments_json, false)),
        "write_config" => Some(write_preview(root, arguments_json, true)),
        "patch_file" => Some(patch_preview(root, arguments_json)),
        _ => None,
    }
}

fn write_preview(root: &Path, arguments_json: &str, is_config: bool) -> Value {
    let Ok(args) = serde_json::from_str::<WriteArgs>(arguments_json) else {
        return json!({ "error": "the write request is missing path, content or kind" });
    };
    let kind = match args.kind.as_str() {
        "create" => FileMutationKind::Create,
        "overwrite" => FileMutationKind::Overwrite,
        other => return json!({ "path": args.path, "error": format!("unknown kind '{other}', expected create or overwrite") }),
    };
    let proposal = if is_config {
        propose_config_write(root, &args.path, kind, &args.content)
    } else {
        propose_file_write(root, &args.path, kind, &args.content)
    };
    match proposal {
        Ok(diff) => diff_json(&diff, diff.kind_label, None),
        Err(error) => json!({ "path": args.path, "error": error.to_string() }),
    }
}

/// `patch_file`: the preview is the diff of the patched content (what the write would change), plus how
/// each edit matched, so the human can see a whitespace-tolerant match instead of assuming an exact one.
fn patch_preview(root: &Path, arguments_json: &str) -> Value {
    let (path, edits) = match file_patch::parse_patch_call(arguments_json) {
        Ok(parsed) => parsed,
        Err(error) => return json!({ "error": error.to_string() }),
    };
    match file_patch::propose_file_patch(root, &path, &edits) {
        Ok((diff, reports)) => {
            let matches: Vec<Value> = reports
                .iter()
                .map(|report| {
                    let level = match report.level {
                        MatchLevel::Exact => "exact",
                        MatchLevel::TrailingSpace => "trailing_space",
                        MatchLevel::Trimmed => "trimmed",
                    };
                    json!({ "match": level, "replacements": report.replacements })
                })
                .collect();
            diff_json(&diff, "patch", Some(matches))
        }
        Err(error) => json!({ "path": path, "error": error.to_string() }),
    }
}

fn diff_json(diff: &FileMutationDiff, kind: &str, edits: Option<Vec<Value>>) -> Value {
    let compact = compact_diff(&diff.unified_diff);
    let mut value = json!({
        "path": diff.path,
        "kind": kind,
        "existed_before": diff.existed_before,
        "before_sha256": diff.before_sha256,
        "after_bytes": diff.after_bytes,
        "additions": compact.additions,
        "deletions": compact.deletions,
        "lines": compact.lines,
        "truncated": compact.truncated,
    });
    if let Some(edits) = edits {
        value["edits"] = json!(edits);
    }
    value
}

struct CompactDiff {
    lines: Vec<String>,
    additions: usize,
    deletions: usize,
    truncated: bool,
}

/// `unified_diff` (from `file_mutation::line_diff`) has one line per source
/// line, prefixed `"  "` (kept), `"- "` or `"+ "`. Keep only the changed lines
/// with `CONTEXT_LINES` around them, so a one-line edit to a long file is not a
/// whole-file preview.
fn compact_diff(unified: &str) -> CompactDiff {
    let all: Vec<&str> = unified.lines().collect();
    let changed = |line: &str| line.starts_with("+ ") || line.starts_with("- ");
    let additions = all.iter().filter(|line| line.starts_with("+ ")).count();
    let deletions = all.iter().filter(|line| line.starts_with("- ")).count();

    let mut keep = vec![false; all.len()];
    for (index, line) in all.iter().enumerate() {
        if changed(line) {
            let from = index.saturating_sub(CONTEXT_LINES);
            let to = (index + CONTEXT_LINES).min(all.len().saturating_sub(1));
            keep[from..=to].iter_mut().for_each(|flag| *flag = true);
        }
    }

    let mut lines = Vec::new();
    let mut truncated = false;
    let mut gap = false;
    for (index, line) in all.iter().enumerate() {
        if !keep[index] {
            gap = true;
            continue;
        }
        if lines.len() >= MAX_PREVIEW_LINES {
            truncated = true;
            break;
        }
        if gap && !lines.is_empty() {
            lines.push(ELIDED.to_string());
        }
        gap = false;
        lines.push(display_line(line));
    }
    CompactDiff { lines, additions, deletions, truncated }
}

/// One preview line: a line that looks like it holds a secret is hidden whole
/// (never partly masked), and a very long line is cut.
fn display_line(line: &str) -> String {
    let hidden = super::headless::redact_secret_like(line);
    let text = if hidden != line {
        format!("{}{}", line.get(..2).unwrap_or("  "), hidden)
    } else {
        line.to_string()
    };
    if text.chars().count() <= MAX_LINE_CHARS {
        return text;
    }
    let cut: String = text.chars().take(MAX_LINE_CHARS).collect();
    format!("{cut}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn other_tools_have_no_preview() {
        assert!(for_call(Path::new("."), "run_command", "{}").is_none());
        assert!(for_call(Path::new("."), "read_file", "{}").is_none());
    }

    #[test]
    fn overwrite_preview_shows_only_changed_lines_with_context() {
        let repo = temp_repo();
        let before: String = (1..=40).map(|n| format!("line {n}\n")).collect();
        std::fs::write(repo.path().join("a.txt"), &before).unwrap();
        let after = before.replace("line 20\n", "line twenty\n");
        let args = json!({ "path": "a.txt", "content": after, "kind": "overwrite" }).to_string();
        let preview = for_call(repo.path(), "write_file", &args).unwrap();
        assert_eq!(preview["kind"], "overwrite");
        assert_eq!(preview["additions"], 1);
        assert_eq!(preview["deletions"], 1);
        let lines: Vec<String> = preview["lines"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
        assert!(lines.contains(&"- line 20".to_string()));
        assert!(lines.contains(&"+ line twenty".to_string()));
        assert!(lines.len() <= 7, "one edit in 40 lines must not preview the whole file: {lines:?}");
        assert_eq!(preview["truncated"], false);
        assert!(preview["before_sha256"].as_str().is_some());
    }

    #[test]
    fn create_preview_marks_new_file() {
        let repo = temp_repo();
        std::fs::create_dir(repo.path().join("docs")).unwrap();
        let args = json!({ "path": "docs/new.md", "content": "# Hi\n", "kind": "create" }).to_string();
        let preview = for_call(repo.path(), "write_file", &args).unwrap();
        assert_eq!(preview["existed_before"], false);
        assert_eq!(preview["additions"], 1);
    }

    #[test]
    fn a_missing_parent_directory_is_reported_not_created() {
        // The runtime never creates directories for a governed write; the preview must say so
        // instead of promising a file the approval would then fail to write.
        let repo = temp_repo();
        let args = json!({ "path": "nope/new.md", "content": "x", "kind": "create" }).to_string();
        let preview = for_call(repo.path(), "write_file", &args).unwrap();
        assert!(preview["error"].as_str().unwrap().contains("parent directory"), "{preview}");
        assert!(!repo.path().join("nope").exists(), "previewing must not create anything");
    }

    #[test]
    fn patch_preview_shows_the_changed_lines_and_how_each_edit_matched() {
        let repo = temp_repo();
        std::fs::write(repo.path().join("a.rs"), "fn main() {\n    let x = 1;\n    println!(\"{x}\");\n}\n").unwrap();
        let args = json!({ "path": "a.rs", "edits": [{ "old": "let x = 1;", "new": "let x = 2;" }] }).to_string();
        let preview = for_call(repo.path(), "patch_file", &args).unwrap();
        assert_eq!(preview["kind"], "patch");
        assert_eq!(preview["additions"], 1);
        assert_eq!(preview["deletions"], 1);
        assert_eq!(preview["edits"][0]["match"], "exact");
        assert_eq!(preview["edits"][0]["replacements"], 1);
        assert!(preview["lines"].as_array().unwrap().iter().any(|l| l == "+     let x = 2;"), "{preview}");
        assert_eq!(std::fs::read_to_string(repo.path().join("a.rs")).unwrap().matches("let x = 1;").count(), 1, "previewing must not write");
    }

    #[test]
    fn patch_preview_reports_an_edit_that_does_not_match_instead_of_a_diff() {
        let repo = temp_repo();
        std::fs::write(repo.path().join("a.txt"), "one\ntwo\n").unwrap();
        let args = json!({ "path": "a.txt", "edits": [{ "old": "three", "new": "3" }] }).to_string();
        let preview = for_call(repo.path(), "patch_file", &args).unwrap();
        assert!(preview["error"].is_string(), "{preview}");
        assert!(preview.get("lines").is_none());
        let missing = for_call(repo.path(), "patch_file", &json!({ "path": "nope.txt", "edits": [{ "old": "a", "new": "b" }] }).to_string()).unwrap();
        assert!(missing["error"].is_string(), "{missing}");
        let bad = for_call(repo.path(), "patch_file", "{\"path\":\"a.txt\"}").unwrap();
        assert!(bad["error"].as_str().unwrap().contains("edits"), "{bad}");
    }

    #[test]
    fn invalid_requests_return_an_error_value() {
        let repo = temp_repo();
        let bad_json = for_call(repo.path(), "write_file", "not json").unwrap();
        assert!(bad_json["error"].as_str().unwrap().contains("missing"));
        let bad_kind = for_call(repo.path(), "write_file", &json!({ "path": "a", "content": "x", "kind": "delete" }).to_string()).unwrap();
        assert!(bad_kind["error"].as_str().unwrap().contains("unknown kind"));
        let escape = for_call(repo.path(), "write_file", &json!({ "path": "../outside.txt", "content": "x", "kind": "create" }).to_string()).unwrap();
        assert!(escape["error"].is_string(), "a path leaving the repo must be an error: {escape}");
        std::fs::write(repo.path().join("exists.txt"), "a").unwrap();
        let exists = for_call(repo.path(), "write_file", &json!({ "path": "exists.txt", "content": "b", "kind": "create" }).to_string()).unwrap();
        assert!(exists["error"].as_str().unwrap().contains("already exists"));
    }

    #[test]
    fn secret_like_lines_are_hidden_whole() {
        let repo = temp_repo();
        let args = json!({ "path": "c.txt", "content": "API_KEY=abc123\nplain\n", "kind": "create" }).to_string();
        let preview = for_call(repo.path(), "write_file", &args).unwrap();
        let lines: Vec<&str> = preview["lines"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
        assert!(lines.iter().all(|line| !line.contains("abc123")), "secret value leaked: {lines:?}");
        assert!(lines.iter().any(|line| line.contains("redacted")));
        assert!(lines.contains(&"+ plain"));
    }

    #[test]
    fn long_lines_and_large_changes_are_bounded() {
        let repo = temp_repo();
        let long = "x".repeat(1000);
        let many: String = (0..500).map(|n| format!("row {n}\n")).collect();
        let args = json!({ "path": "big.txt", "content": format!("{long}\n{many}"), "kind": "create" }).to_string();
        let preview = for_call(repo.path(), "write_file", &args).unwrap();
        let lines = preview["lines"].as_array().unwrap();
        assert!(lines.len() <= MAX_PREVIEW_LINES);
        assert_eq!(preview["truncated"], true);
        assert!(lines[0].as_str().unwrap().chars().count() <= MAX_LINE_CHARS + 1);
        assert_eq!(preview["additions"], 501, "counts cover the whole change, not just what is shown");
    }
}
