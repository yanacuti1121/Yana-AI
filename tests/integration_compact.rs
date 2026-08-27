/// Integration tests for `yana-rt compact` — end-to-end through the real
/// built binary, not just the in-process matcher functions (see
/// src/compact/tests.rs for those). The one test here that matters most:
/// reproducing the exact rtk incident (`git log --oneline | wc -l` silently
/// returning a wrong, truncated count) and proving the native path cannot,
/// because it declines on shell composition before any matcher runs.
use std::process::Command;

fn bin() -> std::path::PathBuf {
    let mut p = std::env::current_exe().unwrap();
    p.pop();
    p.pop(); // target/debug/deps → target
    p.push("yana-rt");
    p
}

fn tmp_git_repo(commit_count: usize) -> tempfile::TempDir {
    let dir = tempfile::tempdir().expect("create tmpdir");
    let root = dir.path();
    let run = |args: &[&str]| {
        let status = Command::new("git")
            .args(args)
            .current_dir(root)
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .status()
            .expect("run git");
        assert!(status.success(), "git {args:?} failed");
    };
    run(&["init", "-q"]);
    for i in 0..commit_count {
        std::fs::write(root.join("file.txt"), format!("{i}\n")).unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", &format!("commit {i}")]);
    }
    dir
}

fn compact_command(dir: &std::path::Path) -> Command {
    let mut c = Command::new(bin());
    c.current_dir(dir);
    c
}

#[test]
fn detect_recognizes_git_status() {
    let dir = tempfile::tempdir().unwrap();
    let out = compact_command(dir.path())
        .args(["compact", "--detect", "--", "bash", "-c", "git status --porcelain"])
        .output()
        .expect("run yana-rt compact --detect");
    assert!(out.status.success(), "expected exit 0 for a known pattern");
}

#[test]
fn detect_declines_unknown_command() {
    let dir = tempfile::tempdir().unwrap();
    let out = compact_command(dir.path())
        .args(["compact", "--detect", "--", "bash", "-c", "curl http://example.com"])
        .output()
        .expect("run yana-rt compact --detect");
    assert!(!out.status.success(), "expected exit 1 for no known pattern");
}

#[test]
fn detect_declines_shell_composition() {
    let dir = tempfile::tempdir().unwrap();
    let out = compact_command(dir.path())
        .args(["compact", "--detect", "--", "bash", "-c", "git log --oneline | wc -l"])
        .output()
        .expect("run yana-rt compact --detect");
    assert!(!out.status.success(), "a piped command must never be detected as compactable");
}

/// The regression test for the exact rtk incident: with a real repo of a
/// known commit count, `git log --oneline | wc -l` run through
/// `yana-rt compact` must produce the true count, byte-for-byte identical
/// to running the same pipeline directly — not a truncated approximation.
#[test]
fn end_to_end_git_log_pipe_wc_l_is_never_wrong() {
    let commit_count = 47;
    let dir = tmp_git_repo(commit_count);

    let direct = Command::new("bash")
        .arg("-c")
        .arg("git log --oneline | wc -l")
        .current_dir(dir.path())
        .output()
        .expect("run direct pipeline");
    let direct_stdout = String::from_utf8_lossy(&direct.stdout).to_string();

    let via_compact = compact_command(dir.path())
        .args(["compact", "--", "bash", "-c", "git log --oneline | wc -l"])
        .output()
        .expect("run yana-rt compact");
    let compact_stdout = String::from_utf8_lossy(&via_compact.stdout).to_string();

    assert_eq!(
        direct_stdout.trim(),
        compact_stdout.trim(),
        "compact must reproduce the exact same count as the direct pipeline — \
         this is the exact class of bug (git log --oneline | wc -l returning \
         50 instead of 1,478) that motivated building this module"
    );
    assert_eq!(compact_stdout.trim(), commit_count.to_string());
}

/// Regression test for the security-auditor's live-reproduced finding
/// (2026-08-27): a command joining two `git log --oneline` invocations with
/// a literal embedded newline (not `;`/`&&`/`|`) used to slip past
/// `has_shell_composition`, get pattern-matched, and produce a doubled
/// "exact" commit count — the exact failure class this module exists to
/// make structurally impossible, just via an operator the marker list
/// didn't originally cover.
#[test]
fn end_to_end_newline_joined_commands_never_produce_a_doubled_count() {
    let commit_count = 20;
    let dir = tmp_git_repo(commit_count);

    let out = compact_command(dir.path())
        .args(["compact", "--", "bash", "-c", "git log --oneline\ngit log --oneline"])
        .output()
        .expect("run yana-rt compact");
    let stdout = String::from_utf8_lossy(&out.stdout);

    // Must NOT report "40 commits total" (the doubled count the bug
    // produced) or any compacted "# ... commits total" header at all —
    // shell composition must decline to raw passthrough, whatever that
    // passthrough happens to contain.
    assert!(
        !stdout.contains("commits total"),
        "a newline-joined command must decline compaction entirely, got: {stdout}"
    );
}

#[test]
fn bypass_env_var_forces_raw_passthrough() {
    let commit_count = 40;
    let dir = tmp_git_repo(commit_count);

    let out = compact_command(dir.path())
        .args(["compact", "--", "bash", "-c", "git log --oneline"])
        .env("YANA_COMPACT_BYPASS", "1")
        .output()
        .expect("run yana-rt compact with bypass");
    let stdout = String::from_utf8_lossy(&out.stdout);
    // Bypassed — every commit line must be present, none omitted.
    assert_eq!(stdout.lines().filter(|l| !l.is_empty()).count(), commit_count);
    assert!(!stdout.contains("more commits omitted"));
}

#[test]
fn exit_code_of_failing_command_survives_compaction() {
    let dir = tempfile::tempdir().unwrap();
    let out = compact_command(dir.path())
        .args(["compact", "--", "bash", "-c", "exit 7"])
        .output()
        .expect("run yana-rt compact");
    assert_eq!(out.status.code(), Some(7));
}
