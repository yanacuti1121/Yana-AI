//! `measure_since` builds `<since_ref>..HEAD` and hands it to `git diff` and
//! `git log`. A ref that starts with `-` would be read by git as an option
//! (`--output=<path>..HEAD` makes git create or overwrite a file), so it must be
//! refused before git runs.

use super::*;
use std::fs;
use tempfile::tempdir;

fn repo() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    for args in [vec!["init", "-q", "-b", "main"], vec!["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "first"]] {
        let out = Command::new("git").args(&args).current_dir(dir.path()).env("GIT_CONFIG_GLOBAL", "/dev/null").output().unwrap();
        assert!(out.status.success());
    }
    dir
}

#[test]
fn a_ref_that_looks_like_an_option_is_refused_and_creates_no_file() {
    let dir = repo();
    let marker = dir.path().join("created-by-git");
    for since in [format!("--output={}", marker.display()), "-p".to_string(), "--".to_string(), String::new()] {
        assert!(measure_since(dir.path(), &since).is_err(), "{since:?}");
    }
    assert!(!dir.path().join("created-by-git..HEAD").exists() && !marker.exists());
    assert_eq!(fs::read_dir(dir.path()).unwrap().filter_map(Result::ok).filter(|e| e.file_name() != ".git").count(), 0, "git must not have written anything");
}

#[test]
fn a_real_ref_still_measures_and_a_missing_ref_is_an_error() {
    let dir = repo();
    assert!(measure_since(dir.path(), "HEAD").is_ok());
    assert!(measure_since(dir.path(), "no-such-ref").is_err());
}
