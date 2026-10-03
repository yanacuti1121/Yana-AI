//! Behavior tests for the doctor's git and secret checks, run against real
//! throwaway git repositories. Fake credentials are assembled at runtime so no
//! secret-shaped literal sits in the source.

use super::{check_env_secrets, check_git_branch, check_git_clean, check_git_repo, Check};
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::{tempdir, TempDir};

const GH_TOKEN_TAIL: usize = 36;
const AWS_KEY_TAIL: usize = 16;
const LONG_KEY_TAIL: usize = 24;

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .args(["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"])
        .args(args)
        .current_dir(dir)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .output()
        .expect("git must be installed to run the doctor tests");
    assert!(out.status.success(), "git {args:?} failed: {}", String::from_utf8_lossy(&out.stderr));
}

fn repo() -> (TempDir, String) {
    let dir = tempdir().unwrap();
    git(dir.path(), &["init", "-q", "-b", "main"]);
    let path = dir.path().to_str().unwrap().to_string();
    (dir, path)
}

fn commit_all(dir: &Path) {
    git(dir, &["add", "-A"]);
    git(dir, &["commit", "-q", "-m", "init"]);
}

fn status(c: &Check) -> &'static str {
    c.status_name()
}

// ── git repo / branch ────────────────────────────────────────────────────────

#[test]
fn git_repo_check_distinguishes_a_repo_from_a_plain_directory() {
    let plain = tempdir().unwrap();
    assert_eq!(status(&check_git_repo(plain.path().to_str().unwrap())), "WARN");
    let (_d, t) = repo();
    assert_eq!(status(&check_git_repo(&t)), "OK");
}

#[test]
fn branch_check_warns_on_default_branches_and_passes_on_a_feature_branch() {
    let (d, t) = repo();
    for name in ["main", "master", "develop", "dev"] {
        git(d.path(), &["checkout", "-q", "-B", name]);
        let c = check_git_branch(&t);
        assert_eq!(status(&c), "WARN", "{name}");
        assert!(c.detail.contains(name));
    }
    git(d.path(), &["checkout", "-q", "-B", "feature/x"]);
    assert_eq!(status(&check_git_branch(&t)), "OK");
}

#[test]
fn branch_check_reports_detached_head_as_informational() {
    let (d, t) = repo();
    fs::write(d.path().join("a.txt"), "a").unwrap();
    commit_all(d.path());
    git(d.path(), &["checkout", "-q", "--detach"]);
    let c = check_git_branch(&t);
    assert_eq!(status(&c), "INFO");
    assert!(c.detail.contains("detached"));
}

// ── working tree ─────────────────────────────────────────────────────────────

#[test]
fn clean_tree_passes() {
    let (d, t) = repo();
    fs::write(d.path().join("a.txt"), "a").unwrap();
    commit_all(d.path());
    assert_eq!(status(&check_git_clean(&t)), "OK");
}

#[test]
fn untracked_staged_and_unstaged_changes_are_counted_separately() {
    let (d, t) = repo();
    fs::write(d.path().join("tracked.txt"), "v1").unwrap();
    commit_all(d.path());

    fs::write(d.path().join("untracked.txt"), "u").unwrap();
    let c = check_git_clean(&t);
    assert_eq!(status(&c), "WARN");
    assert!(c.detail.contains("1 untracked") && !c.detail.contains("staged"));

    fs::write(d.path().join("tracked.txt"), "v2").unwrap();
    let c = check_git_clean(&t);
    assert!(c.detail.contains("1 unstaged") && c.detail.contains("1 untracked"));

    git(d.path(), &["add", "tracked.txt"]);
    let c = check_git_clean(&t);
    assert!(c.detail.contains("1 staged"));
    assert!(!c.detail.contains("unstaged"));
}

// ── .env secrets ─────────────────────────────────────────────────────────────

#[test]
fn env_tracked_by_git_fails() {
    let (d, t) = repo();
    fs::write(d.path().join(".env"), "A=1\n").unwrap();
    git(d.path(), &["add", ".env"]);
    let c = check_env_secrets(&t);
    assert_eq!(status(&c), "FAIL");
    assert!(c.detail.contains("tracked by git"));
}

#[test]
fn missing_env_file_is_informational() {
    let (_d, t) = repo();
    assert_eq!(status(&check_env_secrets(&t)), "INFO");
}

#[test]
fn untracked_env_without_secrets_passes() {
    let (d, t) = repo();
    fs::write(d.path().join(".env"), "DEBUG=true\nPORT=8080\n").unwrap();
    assert_eq!(status(&check_env_secrets(&t)), "OK");
}

#[test]
fn untracked_env_with_a_live_looking_key_warns_for_each_known_shape() {
    let shapes = [
        format!("sk-ant-{}", "a".repeat(LONG_KEY_TAIL)),
        format!("sk-{}", "b".repeat(LONG_KEY_TAIL)),
        format!("ghp_{}", "c".repeat(GH_TOKEN_TAIL)),
        format!("AKIA{}", "D".repeat(AWS_KEY_TAIL)),
    ];
    for key in shapes {
        let (d, t) = repo();
        fs::write(d.path().join(".env"), format!("SECRET={key}\n")).unwrap();
        let c = check_env_secrets(&t);
        assert_eq!(status(&c), "WARN", "{}", &key[..4]);
        assert!(!c.detail.contains(&key), "the key itself must never be echoed");
    }
}

#[test]
fn short_lookalike_values_are_not_treated_as_keys() {
    let (d, t) = repo();
    fs::write(d.path().join(".env"), "TOKEN=sk-short\nGH=ghp_tooshort\n").unwrap();
    assert_eq!(status(&check_env_secrets(&t)), "OK");
}
