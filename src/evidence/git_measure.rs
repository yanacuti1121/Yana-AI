//! git_measure — narrow, additive evidence signal: real `git diff --numstat`
//! measurement of what a WorkUnit's execution actually touched since a given
//! point in its history.
//!
//! Scope, deliberately narrow (BMAD-YANA-CAPABILITY-MATRIX.md row 13,
//! corrected): this does NOT replace or compete with `crate::evidence`'s
//! HMAC-signed command receipts (`evidence run`/`evidence verify`, this
//! module's sibling in `mod.rs`) or `crate::capability::evidence::ToolEvidence`
//! — both are real, already stronger for what they each guarantee, and
//! untouched by this module. This answers one narrow question only: what is
//! the real shape and size of a code change between two points in git
//! history, measured from git itself, never from anything an agent claims.
//! "Measurement only, never judges" — the same discipline BMAD's own
//! `git_evidence.py` documents for its equivalent measurement.
//!
//! Deliberate difference from BMAD's technique: BMAD's `git_evidence.py`
//! sums per-commit `git log --numstat` output across a range, and does a
//! second pass to separate merge-commit churn from direct-commit churn so
//! the same lines are not double-counted when a range includes a merge.
//! That two-pass design exists because BMAD is measuring *cumulative
//! contributor effort* for a retrospective (work that was later reverted or
//! rewritten within the same range still counts). This module measures
//! something different: the *net diff* between two tree states, which is
//! what a review-gate evidence check actually wants ("does the final change
//! match what the SPEC declared," e.g. against `SPEC.limits.max_files_changed`
//! from the extended spec schema). `git diff --numstat A..HEAD` computes that
//! net diff directly and is not subject to the double-counting failure mode
//! at all, since it diffs two trees rather than summing per-commit deltas —
//! so no second pass is needed here for that reason. Commit count is still
//! reported separately (via `git log`) as a distinct, complementary fact.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitChurn {
    /// Commits reachable from HEAD but not from `since_ref` (both direct and
    /// merge commits; `git log`'s range syntax already excludes duplicates).
    pub commits: u32,
    pub files_changed: u32,
    pub lines_added: u32,
    pub lines_removed: u32,
}

#[derive(Debug)]
pub enum GitMeasureError {
    CommandFailed(String),
    Utf8(std::string::FromUtf8Error),
}

impl std::fmt::Display for GitMeasureError {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitMeasureError::CommandFailed(detail) => write!(fmt, "git_measure: {detail}"),
            GitMeasureError::Utf8(error) => write!(fmt, "git_measure: non-UTF-8 git output: {error}"),
        }
    }
}

impl std::error::Error for GitMeasureError {}

/// Measures real churn in `repo_dir` between `since_ref` (a commit-ish: sha,
/// tag, branch) and `HEAD`. Never shells through a string; every argument is
/// passed as a distinct argv element, matching this repo's own
/// `execution-environment.md` safe-wrapper requirement (no `sh -c`, no
/// interpolation).
pub fn measure_since(repo_dir: &Path, since_ref: &str) -> Result<GitChurn, GitMeasureError> {
    let range = format!("{since_ref}..HEAD");

    let numstat_output = run_git(repo_dir, &["diff", "--numstat", &range])?;
    let (files_changed, lines_added, lines_removed) = parse_numstat(&numstat_output);

    let log_output = run_git(repo_dir, &["log", "--oneline", &range])?;
    let commits = log_output.lines().filter(|line| !line.trim().is_empty()).count() as u32;

    Ok(GitChurn { commits, files_changed, lines_added, lines_removed })
}

/// Parses `git diff --numstat` output: each line is
/// `<added>\t<removed>\t<path>`, where `added`/`removed` are `-` for binary
/// files (counted toward `files_changed`, not toward line counts, since a
/// binary file genuinely has no meaningful added/removed line count).
fn parse_numstat(output: &str) -> (u32, u32, u32) {
    let mut files_changed = 0u32;
    let mut lines_added = 0u32;
    let mut lines_removed = 0u32;
    for line in output.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let mut parts = line.splitn(3, '\t');
        let added = parts.next().unwrap_or("");
        let removed = parts.next().unwrap_or("");
        files_changed += 1;
        lines_added += added.parse::<u32>().unwrap_or(0);
        lines_removed += removed.parse::<u32>().unwrap_or(0);
    }
    (files_changed, lines_added, lines_removed)
}

fn run_git(repo_dir: &Path, args: &[&str]) -> Result<String, GitMeasureError> {
    let output = Command::new("git")
        .current_dir(repo_dir)
        .args(args)
        .output()
        .map_err(|error| GitMeasureError::CommandFailed(format!("spawn git {args:?}: {error}")))?;
    if !output.status.success() {
        return Err(GitMeasureError::CommandFailed(format!(
            "git {args:?} exited {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    String::from_utf8(output.stdout).map_err(GitMeasureError::Utf8)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    /// Real git plumbing, not a mock: every test below runs actual `git`
    /// commands against a throwaway repo, matching this repo's own
    /// `verification.md` Iron Law (fresh evidence, not assumed behavior).
    fn init_repo(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yana-git-measure-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        git(&dir, &["init", "-q"]);
        dir
    }

    fn git(dir: &Path, args: &[&str]) -> String {
        let out = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .unwrap_or_else(|e| panic!("failed to spawn git {args:?}: {e}"));
        assert!(
            out.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn commit(dir: &Path, file: &str, content: &str, message: &str) -> String {
        fs::write(dir.join(file), content).unwrap();
        git(dir, &["add", "-A"]);
        git(
            dir,
            &[
                "-c", "user.email=test@example.com",
                "-c", "user.name=test",
                "commit", "-q", "-m", message,
            ],
        );
        git(dir, &["rev-parse", "HEAD"])
    }

    #[test]
    fn measures_a_single_commit_since_the_baseline() {
        let dir = init_repo("single");
        let baseline = commit(&dir, "a.txt", "line1\n", "baseline");
        commit(&dir, "a.txt", "line1\nline2\nline3\n", "add two lines");

        let churn = measure_since(&dir, &baseline).unwrap();
        assert_eq!(churn.commits, 1);
        assert_eq!(churn.files_changed, 1);
        assert_eq!(churn.lines_added, 2);
        assert_eq!(churn.lines_removed, 0);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn measures_multiple_commits_and_multiple_files() {
        let dir = init_repo("multi");
        let baseline = commit(&dir, "a.txt", "keep\n", "baseline");
        commit(&dir, "a.txt", "keep\nnew\n", "touch a");
        commit(&dir, "b.txt", "brand new file\n", "add b");

        let churn = measure_since(&dir, &baseline).unwrap();
        assert_eq!(churn.commits, 2);
        assert_eq!(churn.files_changed, 2);
        assert_eq!(churn.lines_added, 2); // "new" in a.txt + the one line of b.txt
        assert_eq!(churn.lines_removed, 0);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn measures_removed_lines_and_deleted_files() {
        let dir = init_repo("removed");
        let baseline = commit(&dir, "a.txt", "one\ntwo\nthree\n", "baseline");
        fs::write(dir.join("a.txt"), "one\n").unwrap();
        git(&dir, &["add", "-A"]);
        git(
            &dir,
            &["-c", "user.email=test@example.com", "-c", "user.name=test",
              "commit", "-q", "-m", "trim a"],
        );

        let churn = measure_since(&dir, &baseline).unwrap();
        assert_eq!(churn.commits, 1);
        assert_eq!(churn.files_changed, 1);
        assert_eq!(churn.lines_added, 0);
        assert_eq!(churn.lines_removed, 2);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn zero_commits_since_head_itself_is_empty_churn() {
        let dir = init_repo("zero");
        let head = commit(&dir, "a.txt", "content\n", "only commit");

        let churn = measure_since(&dir, &head).unwrap();
        assert_eq!(churn, GitChurn::default());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn merge_commit_is_not_double_counted_against_the_net_diff() {
        // This is the exact failure mode BMAD's two-pass design exists to
        // avoid for *cumulative* measurement. This module sidesteps it
        // entirely by diffing trees rather than summing per-commit deltas —
        // this test proves that sidestep actually holds for a real merge.
        let dir = init_repo("merge");
        let baseline = commit(&dir, "a.txt", "base\n", "baseline");

        git(&dir, &["checkout", "-q", "-b", "feature"]);
        commit(&dir, "feature.txt", "feature content\n", "feature work");
        git(&dir, &["checkout", "-q", "-"]); // back to the original branch

        commit(&dir, "main.txt", "main content\n", "main work");

        git(&dir, &["-c", "user.email=test@example.com", "-c", "user.name=test",
                    "merge", "--no-ff", "-q", "-m", "merge feature", "feature"]);

        let churn = measure_since(&dir, &baseline).unwrap();
        // Net tree diff since baseline: feature.txt + main.txt, one line each.
        assert_eq!(churn.files_changed, 2);
        assert_eq!(churn.lines_added, 2);
        assert_eq!(churn.lines_removed, 0);
        // Three commits reachable from HEAD but not baseline: feature work,
        // main work, and the merge commit itself.
        assert_eq!(churn.commits, 3);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unknown_ref_returns_an_error_not_a_panic() {
        let dir = init_repo("badref");
        commit(&dir, "a.txt", "content\n", "only commit");

        let result = measure_since(&dir, "not-a-real-ref-at-all");
        assert!(result.is_err());

        fs::remove_dir_all(&dir).ok();
    }
}
