//! Behavior tests for the scanner's regex and JSON match engines.
//!
//! These pin the contract callers (scanner/*.yml rules) rely on: 1-based line
//! numbers, condition semantics over a line window, comment skipping, the
//! 200-char cap on matched values, and that malformed input never panics.

use super::matchers::{run_json_match, run_regex_match};
use serde_json::json;

/// Length cap `run_regex_match` and `run_json_match` apply to matched_value.
const MATCHED_VALUE_CAP: usize = 200;
/// 2^16 chars, the max-length boundary from the fuzz-testing constraints.
const MAX_LEN_INPUT: usize = 65_536;

fn lines_of(hits: &[super::matchers::Match]) -> Vec<Option<u32>> {
    hits.iter().map(|h| h.line).collect()
}

// ── run_regex_match: basics ──────────────────────────────────────────────────

#[test]
fn regex_empty_pattern_yields_no_hits() {
    assert!(run_regex_match("anything", &json!({"pattern": ""})).is_empty());
}

#[test]
fn regex_invalid_pattern_yields_no_hits_and_does_not_panic() {
    assert!(run_regex_match("a(b", &json!({"pattern": "("})).is_empty());
}

#[test]
fn regex_empty_content_yields_no_hits() {
    assert!(run_regex_match("", &json!({"pattern": "x"})).is_empty());
}

#[test]
fn regex_reports_one_based_line_and_matched_text() {
    let hits = run_regex_match("ok\nsecret=abc\nok", &json!({"pattern": "secret=\\w+"}));
    assert_eq!(lines_of(&hits), vec![Some(2)]);
    assert_eq!(hits[0].matched_value, "secret=abc");
}

#[test]
fn regex_case_insensitive_flag_only_applies_when_set() {
    let check_i = json!({"pattern": "token", "flags": "i"});
    let check_plain = json!({"pattern": "token"});
    assert_eq!(run_regex_match("TOKEN", &check_i).len(), 1);
    assert!(run_regex_match("TOKEN", &check_plain).is_empty());
}

#[test]
fn regex_nested_match_block_equals_flat_check() {
    let flat = json!({"pattern": "eval\\("});
    let nested = json!({"match": {"pattern": "eval\\("}});
    let content = "x = eval(y)";
    assert_eq!(
        lines_of(&run_regex_match(content, &flat)),
        lines_of(&run_regex_match(content, &nested))
    );
}

#[test]
fn regex_skip_comment_lines_ignores_hash_lines_even_when_indented() {
    let content = "# secret=abc\n   # secret=abc\nsecret=abc";
    let check = json!({"pattern": "secret", "skip_comment_lines": true});
    assert_eq!(lines_of(&run_regex_match(content, &check)), vec![Some(3)]);
    let no_skip = json!({"pattern": "secret"});
    assert_eq!(run_regex_match(content, &no_skip).len(), 3);
}

#[test]
fn regex_matched_value_is_capped() {
    let content = "A".repeat(MATCHED_VALUE_CAP + 100);
    let hits = run_regex_match(&content, &json!({"pattern": "A+"}));
    assert_eq!(hits[0].matched_value.chars().count(), MATCHED_VALUE_CAP);
}

// ── run_regex_match: boundary inputs (fuzz-testing-constraints) ─────────────

#[test]
fn regex_survives_max_length_line() {
    let content = "A".repeat(MAX_LEN_INPUT);
    let hits = run_regex_match(&content, &json!({"pattern": "A"}));
    assert_eq!(hits.len(), 1);
}

#[test]
fn regex_survives_null_bytes_and_crlf() {
    let content = "a\0b\r\nsecret\r\n\0";
    let hits = run_regex_match(content, &json!({"pattern": "secret"}));
    assert_eq!(lines_of(&hits), vec![Some(2)]);
}

// ── run_regex_match: companion conditions over a line window ────────────────

#[test]
fn regex_accompanied_by_requires_companion_within_window() {
    let content = "x\nfoo\ny\nz\nbar";
    let narrow = json!({"pattern": "foo", "condition": "accompanied_by",
                        "accompanied_by_pattern": "bar", "lines": 1});
    let wide = json!({"pattern": "foo", "condition": "accompanied_by",
                      "accompanied_by_pattern": "bar", "lines": 3});
    assert!(run_regex_match(content, &narrow).is_empty());
    assert_eq!(lines_of(&run_regex_match(content, &wide)), vec![Some(2)]);
}

#[test]
fn regex_not_accompanied_by_flags_only_when_companion_absent() {
    let with_companion = "foo\nguard";
    let without = "foo\nother";
    let check = json!({"pattern": "foo", "condition": "not_accompanied_by",
                       "not_accompanied_by_pattern": "guard", "lines": 1});
    assert!(run_regex_match(with_companion, &check).is_empty());
    assert_eq!(run_regex_match(without, &check).len(), 1);
}

#[test]
fn regex_not_followed_by_only_looks_forward() {
    let content = "a\nb\nc";
    let short = json!({"pattern": "^a$", "condition": "not_followed_by",
                       "not_followed_by_pattern": "c", "lines": 1});
    let long = json!({"pattern": "^a$", "condition": "not_followed_by",
                      "not_followed_by_pattern": "c", "lines": 2});
    assert_eq!(run_regex_match(content, &short).len(), 1);
    assert!(run_regex_match(content, &long).is_empty());
    // a companion that only exists BEFORE the line must not count
    let behind = "c\na";
    assert_eq!(run_regex_match(behind, &long).len(), 1);
}

#[test]
fn regex_not_preceded_by_only_looks_backward() {
    let content = "a\nb\nc";
    let short = json!({"pattern": "^c$", "condition": "not_preceded_by",
                       "not_preceded_by_pattern": "a", "lines": 1});
    let long = json!({"pattern": "^c$", "condition": "not_preceded_by",
                      "not_preceded_by_pattern": "a", "lines": 2});
    assert_eq!(run_regex_match(content, &short).len(), 1);
    assert!(run_regex_match(content, &long).is_empty());
}

#[test]
fn regex_condition_without_companion_pattern_reports_every_hit() {
    let check = json!({"pattern": "foo", "condition": "not_accompanied_by"});
    assert_eq!(run_regex_match("foo\nfoo", &check).len(), 2);
}

#[test]
fn regex_unknown_condition_reports_every_hit() {
    let check = json!({"pattern": "foo", "condition": "no_such_condition",
                       "accompanied_by_pattern": "bar"});
    assert_eq!(run_regex_match("foo", &check).len(), 1);
}

// ── run_json_match ───────────────────────────────────────────────────────────

#[test]
fn json_invalid_document_yields_no_hits() {
    assert!(run_json_match("{not json", &json!({"path": "$.a", "condition": "missing"})).is_empty());
    assert!(run_json_match("", &json!({"path": "$.a", "condition": "missing"})).is_empty());
}

#[test]
fn json_missing_reports_absent_path_only() {
    let check = json!({"path": "$.a.b", "condition": "missing"});
    let hits = run_json_match(r#"{"a":{}}"#, &check);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].line, None);
    assert!(hits[0].matched_value.contains("not present"));
    assert!(run_json_match(r#"{"a":{"b":1}}"#, &check).is_empty());
}

#[test]
fn json_missing_key_flags_objects_without_the_key() {
    let doc = r#"{"servers":{"a":{"command":"x"},"b":{"args":[]}}}"#;
    let check = json!({"path": "$.servers.*", "condition": "missing_key", "key": "command"});
    let hits = run_json_match(doc, &check);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].matched_value, "missing key 'command'");
}

#[test]
fn json_missing_key_pattern_narrows_which_objects_are_checked() {
    let doc = r#"{"servers":{"a":{"command":"x"},"b":{"args":[]}}}"#;
    let hit = json!({"path": "$.servers.*", "condition": "missing_key",
                     "key": "command", "pattern": "args"});
    let none = json!({"path": "$.servers.*", "condition": "missing_key",
                      "key": "command", "pattern": "zzz"});
    assert_eq!(run_json_match(doc, &hit).len(), 1);
    assert!(run_json_match(doc, &none).is_empty());
}

#[test]
fn json_array_length_gt_uses_strict_threshold_and_ignores_non_arrays() {
    let check = json!({"path": "$.xs", "condition": "array_length_gt_2"});
    assert_eq!(run_json_match(r#"{"xs":[1,2,3]}"#, &check).len(), 1);
    assert!(run_json_match(r#"{"xs":[1,2]}"#, &check).is_empty());
    assert!(run_json_match(r#"{"xs":"abc"}"#, &check).is_empty());
    assert!(run_json_match(r#"{"ys":[1,2,3]}"#, &check).is_empty());
}

#[test]
fn json_value_condition_matches_by_equality() {
    let check = json!({"path": "$.a.b", "value": true});
    let hits = run_json_match(r#"{"a":{"b":true,"c":false}}"#, &check);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].matched_value, "true");
    assert!(run_json_match(r#"{"a":{"b":false}}"#, &check).is_empty());
}

#[test]
fn json_pattern_condition_honours_exact_and_wildcard_allowlist() {
    let doc = r#"{"env":{"K":"sk-abc123","J":"ok","L":"sk-safe-1"}}"#;
    let open = json!({"path": "$.env.*", "pattern": "^sk-"});
    assert_eq!(run_json_match(doc, &open).len(), 2);

    let exact = json!({"path": "$.env.*", "pattern": "^sk-", "allowlist": ["sk-abc123"]});
    let hits = run_json_match(doc, &exact);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].matched_value, "sk-safe-1");

    let wild = json!({"path": "$.env.*", "pattern": "^sk-", "allowlist": ["sk-*"]});
    assert!(run_json_match(doc, &wild).is_empty());
}

#[test]
fn json_array_wildcard_walks_each_element() {
    let doc = r#"{"items":[{"name":"a"},{"name":"b"},{"other":"c"}]}"#;
    let check = json!({"path": "$.items[*].name", "pattern": "^b$"});
    let hits = run_json_match(doc, &check);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].matched_value, "b");
}

#[test]
fn json_without_condition_pattern_or_value_yields_no_hits() {
    assert!(run_json_match(r#"{"a":1}"#, &json!({"path": "$.a"})).is_empty());
}

#[test]
fn json_survives_deeply_nested_input() {
    let depth = 100;
    let doc = format!("{}1{}", "{\"a\":".repeat(depth), "}".repeat(depth));
    let check = json!({"path": "$.a.a", "condition": "missing"});
    // serde_json may reject the depth (recursion limit); either way: no panic.
    let _ = run_json_match(&doc, &check);
}
