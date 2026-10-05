//! The edit engine and `file.patch`, with real temporary files.

use super::file_patch::{apply_file_patch, propose_file_patch};
use super::patch::*;
use super::CapabilityError;

fn edit(old: &str, new: &str) -> FileEdit {
    FileEdit { old: old.to_string(), new: new.to_string(), replace_all: false }
}

fn one(content: &str, old: &str, new: &str) -> (String, EditReport) {
    let (text, mut reports) = apply_edits(content, &[edit(old, new)]).unwrap();
    (text, reports.remove(0))
}

fn message(error: CapabilityError) -> String {
    error.to_string()
}

#[test]
fn an_exact_match_replaces_once_and_reports_the_level() {
    let (text, report) = one("a\nb\nc\n", "b", "B");
    assert_eq!(text, "a\nB\nc\n");
    assert_eq!(report, EditReport { level: MatchLevel::Exact, replacements: 1 });
}

#[test]
fn more_than_one_match_is_refused_and_says_where() {
    let error = apply_edits("x\ny\nx\n", &[edit("x", "z")]).unwrap_err();
    let text = message(error);
    assert!(text.contains("2 places") && text.contains("lines 1, 3"), "{text}");
}

#[test]
fn replace_all_replaces_every_match() {
    let (text, reports) = apply_edits("x\ny\nx\n", &[FileEdit { replace_all: true, ..edit("x", "z") }]).unwrap();
    assert_eq!(text, "z\ny\nz\n");
    assert_eq!(reports[0].replacements, 2);
}

#[test]
fn trailing_whitespace_differences_still_match_whole_lines() {
    let (text, report) = one("fn a() {  \n    1\n}\n", "fn a() {\n    1\n}", "fn a() {\n    2\n}");
    assert_eq!(text, "fn a() {\n    2\n}\n");
    assert_eq!(report.level, MatchLevel::TrailingSpace);
}

#[test]
fn indentation_differences_match_and_the_replacement_takes_the_files_indent() {
    let file = "class A:\n    def f(self):\n        return 1\n";
    let (text, report) = one(file, "def f(self):\n    return 1", "def f(self):\n    return 2");
    assert_eq!(text, "class A:\n    def f(self):\n        return 2\n");
    assert_eq!(report.level, MatchLevel::Trimmed);
}

#[test]
fn a_loose_match_never_runs_when_the_exact_one_found_something() {
    // "a" is inside the indented line, so it matches exactly there; the
    // whole-line levels are never consulted.
    let (text, report) = one("  a\nb\n", "a", "z");
    assert_eq!(report.level, MatchLevel::Exact);
    assert_eq!(text, "  z\nb\n");
    // Two exact hits stay ambiguous; they do not fall through to a looser level.
    assert!(apply_edits("  a\na\n", &[edit("a", "b")]).is_err());
}

#[test]
fn text_that_is_not_there_is_an_error_not_a_guess() {
    let error = message(apply_edits("hello world\n", &[edit("goodbye", "x")]).unwrap_err());
    assert!(error.contains("not found"), "{error}");
    assert!(apply_edits("let x = 1;\n", &[edit("let y = 1;", "z")]).is_err(), "similar is not a match");
}

#[test]
fn crlf_files_keep_their_line_endings() {
    let (text, _) = one("a\r\nb  \r\nc\r\n", "b\nc", "B\nC");
    assert_eq!(text, "a\r\nB\r\nC\r\n");
}

#[test]
fn deleting_whole_lines_and_a_missing_final_newline_are_preserved() {
    assert_eq!(one("a\nb\nc\n", "b\n", "").0, "a\nc\n");
    assert_eq!(one("a\nb", "b  ", "B").0, "a\nB");
}

#[test]
fn bad_edits_are_refused_before_anything_changes() {
    for bad in [edit("", "x"), edit("   \n", "x"), edit("same", "same"), edit(&"a".repeat(MAX_EDIT_TEXT + 1), "x")] {
        assert!(matches!(apply_edits("same\n", &[bad]), Err(CapabilityError::InvalidInput { .. })));
    }
    assert!(apply_edits("x", &[]).is_err(), "no edits");
    let many: Vec<FileEdit> = (0..=MAX_EDITS).map(|_| edit("x", "y")).collect();
    assert!(apply_edits("x", &many).is_err(), "too many edits");
}

#[test]
fn edits_apply_in_order_and_a_failure_names_the_edit() {
    let (text, _) = apply_edits("one\n", &[edit("one", "two"), edit("two", "three")]).unwrap();
    assert_eq!(text, "three\n");
    let error = message(apply_edits("one\n", &[edit("one", "two"), edit("nine", "x")]).unwrap_err());
    assert!(error.starts_with("edit 2:"), "{error}");
}

#[test]
fn a_huge_input_and_odd_characters_do_not_panic() {
    let big = "line\n".repeat(20_000);
    assert!(apply_edits(&big, &[edit("line\nline", "x")]).is_err(), "many matches, no replace_all");
    let (text, _) = one("héllo wörld ✓\n", "wörld", "x");
    assert_eq!(text, "héllo x ✓\n");
    assert!(apply_edits("a\0b\n", &[edit("\0", "x")]).is_ok());
}

fn workspace(content: &str) -> (tempfile::TempDir, std::path::PathBuf) {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("ws");
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("f.txt"), content).unwrap();
    (outer, root)
}

#[test]
fn a_patch_goes_through_the_governed_write_with_a_diff_and_a_backup() {
    let (_keep, root) = workspace("alpha\nbeta\n");
    let (diff, _) = propose_file_patch(&root, "f.txt", &[edit("beta", "BETA")]).unwrap();
    assert!(diff.unified_diff.contains("- beta") && diff.unified_diff.contains("+ BETA"), "{}", diff.unified_diff);
    assert_eq!(std::fs::read_to_string(root.join("f.txt")).unwrap(), "alpha\nbeta\n", "proposing writes nothing");
    let (outcome, reports) = apply_file_patch(&root, "f.txt", &[edit("beta", "BETA")], None).unwrap();
    assert_eq!(std::fs::read_to_string(root.join("f.txt")).unwrap(), "alpha\nBETA\n");
    assert_eq!(reports[0].level, MatchLevel::Exact);
    assert_eq!(std::fs::read_to_string(root.join(outcome.backup_path.unwrap())).unwrap(), "alpha\nbeta\n");
}

#[test]
fn paths_outside_the_repository_and_missing_files_are_refused() {
    let (keep, root) = workspace("x\n");
    std::fs::write(keep.path().join("outside.txt"), "secret\n").unwrap();
    for path in ["../outside.txt", "nope.txt", "/etc/hosts"] {
        assert!(apply_file_patch(&root, path, &[edit("secret", "x")], None).is_err(), "{path}");
    }
    assert_eq!(std::fs::read_to_string(keep.path().join("outside.txt")).unwrap(), "secret\n");
}

#[cfg(unix)]
#[test]
fn a_symlink_to_a_file_outside_is_not_followed() {
    let (keep, root) = workspace("x\n");
    std::fs::write(keep.path().join("outside.txt"), "secret\n").unwrap();
    std::os::unix::fs::symlink(keep.path().join("outside.txt"), root.join("link.txt")).unwrap();
    assert!(apply_file_patch(&root, "link.txt", &[edit("secret", "x")], None).is_err());
    assert_eq!(std::fs::read_to_string(keep.path().join("outside.txt")).unwrap(), "secret\n");
}

#[test]
fn a_failed_match_leaves_the_file_untouched() {
    let (_keep, root) = workspace("alpha\n");
    assert!(apply_file_patch(&root, "f.txt", &[edit("alpha", "A"), edit("missing", "x")], None).is_err());
    assert_eq!(std::fs::read_to_string(root.join("f.txt")).unwrap(), "alpha\n", "all or nothing");
}

#[test]
fn a_binary_file_is_refused() {
    let (_keep, root) = workspace("x");
    std::fs::write(root.join("f.bin"), [0xff, 0xfe, 0x00]).unwrap();
    assert!(matches!(apply_file_patch(&root, "f.bin", &[edit("x", "y")], None), Err(CapabilityError::InvalidUtf8 { .. })));
}

fn decision_for(origin: crate::runtime::TurnOrigin, human: bool) -> crate::runtime::AuthorityDecision {
    use crate::runtime::{RuntimeAuthority, TurnContext, YanaAuthorityChain};
    let outer = tempfile::tempdir().unwrap();
    let session = crate::session_context::SessionContext::new("s", outer.path().to_path_buf(), "p", "m", false);
    let context = TurnContext::new(session, origin, human);
    let call = crate::model::tool::ToolCall { id: "1".into(), name: "patch_file".into(), arguments_json: "{}".into() };
    YanaAuthorityChain.authorize_tool(&context, &call)
}

#[test]
fn the_patch_tool_is_never_allowed_without_a_human_or_a_lease() {
    use crate::runtime::{AuthorityDecision, TurnOrigin};
    assert!(matches!(decision_for(TurnOrigin::Mcp, false), AuthorityDecision::Deny { .. }), "non-human origin");
    assert!(
        matches!(decision_for(TurnOrigin::Mcp, true), AuthorityDecision::HumanApprovalRequired { .. }),
        "even a human turn must approve each call"
    );
}
