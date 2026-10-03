//! `get_diff_files` feeds `audit --diff <base>`: which files to scan. A wrong
//! answer here means a security audit silently checks nothing, so a bad base
//! must be an error, never an empty set. Runs against real temp git repos.

use super::files::get_diff_files;
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::{tempdir, TempDir};

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .args(["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"])
        .args(args)
        .current_dir(dir)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

fn write(dir: &Path, name: &str, body: &str) {
    fs::write(dir.join(name), body).unwrap();
}

/// A repo with `a.py` and `b.py` committed.
fn repo() -> TempDir {
    let d = tempdir().unwrap();
    git(d.path(), &["init", "-q", "-b", "main"]);
    write(d.path(), "a.py", "1");
    write(d.path(), "b.py", "1");
    git(d.path(), &["add", "."]);
    git(d.path(), &["commit", "-q", "-m", "first"]);
    d
}

fn diff(d: &TempDir, base: &str) -> Result<Vec<String>, String> {
    let mut v: Vec<String> = get_diff_files(base, d.path().to_str().unwrap())?.into_iter().collect();
    v.sort();
    Ok(v)
}

#[test]
fn modified_and_staged_files_are_listed_and_untouched_or_untracked_ones_are_not() {
    let d = repo();
    write(d.path(), "a.py", "2");
    write(d.path(), "new.py", "x");
    git(d.path(), &["add", "new.py"]);
    write(d.path(), "untracked.py", "u");
    assert_eq!(diff(&d, "HEAD").unwrap(), vec!["a.py", "new.py"]);
}

#[test]
fn a_clean_tree_has_an_empty_result_which_is_a_real_answer() {
    assert_eq!(diff(&repo(), "HEAD").unwrap(), Vec::<String>::new());
}

#[test]
fn an_older_base_includes_files_changed_by_later_commits() {
    let d = repo();
    write(d.path(), "b.py", "2");
    git(d.path(), &["commit", "-q", "-am", "second"]);
    assert_eq!(diff(&d, "HEAD~1").unwrap(), vec!["b.py"]);
    assert_eq!(diff(&d, "HEAD").unwrap(), Vec::<String>::new());
}

#[test]
fn a_file_both_modified_and_staged_is_listed_once() {
    let d = repo();
    write(d.path(), "a.py", "2");
    git(d.path(), &["add", "a.py"]);
    write(d.path(), "a.py", "3");
    assert_eq!(diff(&d, "HEAD").unwrap(), vec!["a.py"]);
}

#[test]
fn a_base_that_is_not_a_revision_is_an_error_not_an_empty_set() {
    let d = repo();
    write(d.path(), "a.py", "eval(x)");
    let err = diff(&d, "mian").unwrap_err();
    assert!(err.contains("failed"), "{err}");
}

#[test]
fn a_directory_that_is_not_a_repository_is_an_error() {
    let plain = tempdir().unwrap();
    assert!(get_diff_files("HEAD", plain.path().to_str().unwrap()).is_err());
}

#[test]
fn a_base_that_looks_like_an_option_is_refused_and_writes_nothing() {
    let d = repo();
    let victim = d.path().join("victim.txt");
    write(d.path(), "victim.txt", "PRECIOUS");
    for base in [format!("--output={}", victim.display()), "-p".to_string(), "--".to_string()] {
        assert!(diff(&d, &base).is_err(), "{base}");
    }
    assert_eq!(fs::read_to_string(&victim).unwrap(), "PRECIOUS");
}

#[test]
fn a_file_staged_but_reverted_in_the_working_tree_is_still_listed() {
    let d = repo();
    write(d.path(), "a.py", "2");
    git(d.path(), &["add", "a.py"]);
    write(d.path(), "a.py", "1"); // back to the committed content
    assert_eq!(diff(&d, "HEAD").unwrap(), vec!["a.py"], "the index still differs from HEAD");
}
