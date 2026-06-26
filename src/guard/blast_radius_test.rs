//! Tests for `guard blast-radius`, split out of blast_radius.rs to keep that
//! file under the project's 300-line hard limit. Included via `#[path]` in
//! blast_radius.rs, so this is still the `blast_radius::tests` module.

use super::*;

fn targets(cmd: &str) -> Vec<String> {
    let toks = shell_words::split(cmd).unwrap();
    extract_write_targets(&toks, cmd)
}

#[test]
fn detects_find_delete_that_regex_guard_misses() {
    // The whole point: no `rm -rf` here, but it's a mass delete.
    assert_eq!(targets("find . -delete"), vec!["."]);
    assert_eq!(targets("find ./build -exec rm {} +"), vec!["./build"]);
}

#[test]
fn detects_redirection_truncate() {
    assert_eq!(targets("echo x > important.db"), vec!["important.db"]);
    assert_eq!(targets("cat a >> log.txt"), vec!["log.txt"]);
}

#[test]
fn ignores_read_only_commands() {
    assert!(targets("grep -r foo .").is_empty());
    assert!(targets("cat ./big.log").is_empty());
    assert!(targets("ls -la /etc").is_empty());
}

#[test]
fn rm_collects_every_path_operand() {
    assert_eq!(targets("rm a b c"), vec!["a", "b", "c"]);
    assert_eq!(targets("rm -rf build"), vec!["build"]); // flags dropped
}

#[test]
fn protected_path_matches_on_segment_boundary() {
    let prot = vec!["core/rules".to_string()];
    assert!(protected_hit("core/rules/00-meta.md", &prot).is_some());
    assert!(protected_hit("core/../core/rules", &prot).is_some());
    // sibling dir must NOT trip the prefix
    assert!(protected_hit("core/rulesets-public/x", &prot).is_none());
}

/// Regression test for the absolute-path bypass found during review: the
/// same protected file, spelled as an absolute path, must be caught
/// exactly like the relative form above.
#[test]
fn protected_hit_catches_absolute_path_bypass() {
    let prot = vec!["core/rules".to_string()];
    let cwd = std::env::current_dir().unwrap();
    let abs = cwd.join("core/rules/00-meta.md");
    assert!(protected_hit(abs.to_str().unwrap(), &prot).is_some());
}
