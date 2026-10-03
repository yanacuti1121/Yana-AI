//! Behavior tests for `load_scanner_rules`: YAML first, compiled-JSON fallback,
//! malformed and incomplete files skipped without aborting the load.

use super::rules::load_scanner_rules;
use std::fs;
use tempfile::tempdir;

const VALID_YAML: &str = "scope: files\n\
file_patterns: ['**/*.py']\n\
file_patterns_extra: ['skills/**/*.py']\n\
exclude_patterns: ['**/test_*']\n\
checks:\n  - id: T1\n    match:\n      pattern: 'eval\\('\n      lines: 5\n";

fn write(dir: &std::path::Path, rel: &str, body: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

#[test]
fn empty_directory_loads_no_rules() {
    let dir = tempdir().unwrap();
    assert!(load_scanner_rules(dir.path().to_str().unwrap()).is_empty());
}

#[test]
fn missing_directory_loads_no_rules_and_does_not_panic() {
    assert!(load_scanner_rules("/nonexistent/yana-scanner-dir").is_empty());
}

#[test]
fn valid_yaml_is_loaded_with_all_fields() {
    let dir = tempdir().unwrap();
    write(dir.path(), "a.yml", VALID_YAML);
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    assert_eq!(sets.len(), 1);
    let rs = &sets[0];
    assert_eq!(rs.scope, "files");
    assert_eq!(rs.file_patterns, vec!["**/*.py"]);
    assert_eq!(rs.file_patterns_extra, vec!["skills/**/*.py"]);
    assert_eq!(rs.exclude_patterns, vec!["**/test_*"]);
    assert_eq!(rs.checks.len(), 1);
    assert!(rs.source_file.ends_with("a.yml"));
}

#[test]
fn yaml_numbers_survive_conversion_to_json() {
    let dir = tempdir().unwrap();
    write(dir.path(), "a.yml", VALID_YAML);
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    let lines = sets[0].checks[0]["match"]["lines"].as_u64();
    assert_eq!(lines, Some(5));
}

#[test]
fn optional_lists_default_to_empty() {
    let dir = tempdir().unwrap();
    write(dir.path(), "a.yml", "scope: files\nchecks: []\n");
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    assert_eq!(sets.len(), 1);
    assert!(sets[0].file_patterns.is_empty());
    assert!(sets[0].file_patterns_extra.is_empty());
    assert!(sets[0].exclude_patterns.is_empty());
}

#[test]
fn files_missing_scope_or_checks_are_skipped() {
    let dir = tempdir().unwrap();
    write(dir.path(), "no_scope.yml", "checks: []\n");
    write(dir.path(), "no_checks.yml", "scope: files\n");
    write(dir.path(), "ok.yml", "scope: files\nchecks: []\n");
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    assert_eq!(sets.len(), 1);
    assert!(sets[0].source_file.ends_with("ok.yml"));
}

#[test]
fn unparseable_yaml_is_skipped_without_aborting_the_load() {
    let dir = tempdir().unwrap();
    write(dir.path(), "a_bad.yml", "scope: [unclosed\n  - : :\n");
    write(dir.path(), "b_ok.yml", "scope: files\nchecks: []\n");
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    assert_eq!(sets.len(), 1);
    assert!(sets[0].source_file.ends_with("b_ok.yml"));
}

#[test]
fn rule_sets_load_in_filename_order() {
    let dir = tempdir().unwrap();
    write(dir.path(), "b.yml", "scope: second\nchecks: []\n");
    write(dir.path(), "a.yml", "scope: first\nchecks: []\n");
    let scopes: Vec<String> = load_scanner_rules(dir.path().to_str().unwrap())
        .into_iter()
        .map(|r| r.scope)
        .collect();
    assert_eq!(scopes, vec!["first", "second"]);
}

#[test]
fn compiled_json_is_the_fallback_when_no_yaml_loads() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        "compiled/x.json",
        r#"{"scope":"files","checks":[{"id":"J1"}],"file_patterns":["**/*.js"]}"#,
    );
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    assert_eq!(sets.len(), 1);
    assert_eq!(sets[0].file_patterns, vec!["**/*.js"]);
    assert!(sets[0].source_file.ends_with("x.json"));
}

#[test]
fn yaml_wins_over_compiled_json_when_both_exist() {
    let dir = tempdir().unwrap();
    write(dir.path(), "a.yml", "scope: from_yaml\nchecks: []\n");
    write(
        dir.path(),
        "compiled/x.json",
        r#"{"scope":"from_json","checks":[]}"#,
    );
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    assert_eq!(sets.len(), 1);
    assert_eq!(sets[0].scope, "from_yaml");
}

#[test]
fn malformed_compiled_json_is_skipped() {
    let dir = tempdir().unwrap();
    write(dir.path(), "compiled/bad.json", "{not json");
    write(dir.path(), "compiled/good.json", r#"{"scope":"s","checks":[]}"#);
    let sets = load_scanner_rules(dir.path().to_str().unwrap());
    assert_eq!(sets.len(), 1);
    assert_eq!(sets[0].scope, "s");
}
