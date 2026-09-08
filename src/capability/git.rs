//! Git observation capabilities: status, diff. Moved as-is from the
//! original single-file `capability/mod.rs` — bodies unchanged, error type
//! changed from `String` to `CapabilityError`.
//!
//! Roadmap Phase 7 item 28 (Git Actions) added `git_stage`/`git_unstage`/
//! `git_commit` below: these ARE mutating, unlike status/diff above, but
//! they stay outside RuntimeAuthority/TurnEngine by design — same
//! category as the human PTY path (rule 2 in the Desktop handoff), not
//! an AI tool call. They are reachable ONLY from Desktop's own UI
//! (Electron main.js shelling out on a direct human button click, via
//! `capability::cli`'s adapter pattern — see cli.rs's own doc comments on
//! why that's a temporary transport, not a chat-tool registration). None
//! of these three functions are added to `registry.rs`'s
//! `CapabilityDescriptor` manifest, so chat's tool-calling path cannot
//! reach them — a human clicking "Commit" in the UI is the same trust
//! tier as that same human typing `git commit` in the Terminal panel.

use super::error::CapabilityError;
use super::repo::resolve_existing;
use super::{encode, run, MAX_DIFF_BYTES};
use std::path::Path;

pub fn git_status(root: &Path) -> Result<String, CapabilityError> {
    let root = root.to_string_lossy();
    encode(
        "git.status",
        serde_json::json!({"output": run("git", &["-C", &root, "status", "--porcelain=v2", "--branch"])?}),
        false,
    )
}

pub fn git_diff(root: &Path, staged: bool) -> Result<String, CapabilityError> {
    let root = root.to_string_lossy();
    let mut text = if staged {
        run("git", &["-C", &root, "diff", "--no-ext-diff", "--cached"])?
    } else {
        run("git", &["-C", &root, "diff", "--no-ext-diff"])?
    };
    let truncated = text.len() > MAX_DIFF_BYTES;
    if truncated {
        let mut end = MAX_DIFF_BYTES;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
    }
    encode(
        "git.diff",
        serde_json::json!({"staged": staged, "output": text}),
        truncated,
    )
}

/// Roadmap Phase 7 item 27 — Git Inspector: the diff for ONE changed file,
/// not the whole working tree. Separate function rather than adding a
/// third parameter to `git_diff` above, which `src/mcp.rs`'s dormant
/// "Phase 9 spike" tool already calls with its existing 2-arg shape —
/// this avoids touching code outside this slice for no functional reason.
pub fn git_diff_path(root: &Path, staged: bool, path: &str) -> Result<String, CapabilityError> {
    // Reuses the exact same sandbox check every other path-taking
    // capability in this module tree uses — a changed-file path clicked
    // in the UI still gets verified against the repo root, not trusted
    // as pre-sanitized just because it came from a git-status listing.
    resolve_existing(root, path)?;
    let root_str = root.to_string_lossy();
    let mut text = if staged {
        run("git", &["-C", &root_str, "diff", "--no-ext-diff", "--cached", "--", path])?
    } else {
        run("git", &["-C", &root_str, "diff", "--no-ext-diff", "--", path])?
    };
    let truncated = text.len() > MAX_DIFF_BYTES;
    if truncated {
        let mut end = MAX_DIFF_BYTES;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
    }
    encode(
        "git.diff",
        serde_json::json!({"staged": staged, "path": path, "output": text}),
        truncated,
    )
}

fn validate_paths(root: &Path, paths: &[String]) -> Result<(), CapabilityError> {
    if paths.is_empty() {
        return Err(CapabilityError::InvalidInput {
            detail: "at least one path is required".into(),
        });
    }
    for p in paths {
        resolve_existing(root, p)?;
    }
    Ok(())
}

pub fn git_stage(root: &Path, paths: &[String]) -> Result<String, CapabilityError> {
    validate_paths(root, paths)?;
    let root_str = root.to_string_lossy();
    let mut args = vec!["-C", root_str.as_ref(), "add", "--"];
    args.extend(paths.iter().map(String::as_str));
    run("git", &args)?;
    encode("git.stage", serde_json::json!({"paths": paths}), false)
}

pub fn git_unstage(root: &Path, paths: &[String]) -> Result<String, CapabilityError> {
    validate_paths(root, paths)?;
    let root_str = root.to_string_lossy();
    let mut args = vec!["-C", root_str.as_ref(), "restore", "--staged", "--"];
    args.extend(paths.iter().map(String::as_str));
    run("git", &args)?;
    encode("git.unstage", serde_json::json!({"paths": paths}), false)
}

pub fn git_commit(root: &Path, message: &str) -> Result<String, CapabilityError> {
    if message.trim().is_empty() {
        return Err(CapabilityError::InvalidInput {
            detail: "commit message must not be empty".into(),
        });
    }
    let root_str = root.to_string_lossy();
    let output = run("git", &["-C", root_str.as_ref(), "commit", "-m", message])?;
    encode("git.commit", serde_json::json!({"output": output}), false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;

    fn init_repo(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("yana-git-cap-{label}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let run_git = |args: &[&str]| {
            Command::new("git").args(["-C", root.to_str().unwrap()]).args(args).status().unwrap()
        };
        run_git(&["init", "--quiet"]);
        run_git(&["config", "user.email", "test@example.com"]);
        run_git(&["config", "user.name", "Test"]);
        fs::write(root.join("a.txt"), "hello\n").unwrap();
        run_git(&["add", "a.txt"]);
        run_git(&["commit", "--quiet", "-m", "init"]);
        root.canonicalize().unwrap()
    }

    #[test]
    fn git_stage_and_unstage_a_real_file() {
        let root = init_repo("stage");
        fs::write(root.join("a.txt"), "changed\n").unwrap();

        let staged = git_stage(&root, &["a.txt".to_string()]).unwrap();
        assert!(staged.contains("git.stage"));
        let status = git_status(&root).unwrap();
        assert!(status.contains("M  a.txt") || status.contains("1 M."), "expected staged change, got: {status}");

        let unstaged = git_unstage(&root, &["a.txt".to_string()]).unwrap();
        assert!(unstaged.contains("git.unstage"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn git_stage_rejects_a_path_outside_the_repo() {
        let root = init_repo("escape");
        let err = git_stage(&root, &["../../../../etc/passwd".to_string()]).unwrap_err();
        assert!(matches!(err, CapabilityError::NotFound { .. } | CapabilityError::PathEscape { .. }));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn git_stage_rejects_an_empty_path_list() {
        let root = init_repo("empty-list");
        let err = git_stage(&root, &[]).unwrap_err();
        assert!(matches!(err, CapabilityError::InvalidInput { .. }));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn git_commit_rejects_an_empty_message() {
        let root = init_repo("empty-msg");
        let err = git_commit(&root, "   ").unwrap_err();
        assert!(matches!(err, CapabilityError::InvalidInput { .. }));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn git_commit_creates_a_real_commit() {
        let root = init_repo("commit");
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        git_stage(&root, &["a.txt".to_string()]).unwrap();

        let json = git_commit(&root, "update a.txt").unwrap();
        assert!(json.contains("git.commit"));

        let status = git_status(&root).unwrap();
        assert!(!status.contains("a.txt"), "working tree should be clean after commit, got: {status}");

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn git_diff_path_scopes_to_one_file() {
        let root = init_repo("diff-path");
        fs::write(root.join("a.txt"), "changed\n").unwrap();
        fs::write(root.join("b.txt"), "untouched\n").unwrap();

        let json = git_diff_path(&root, false, "a.txt").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["data"]["path"], "a.txt");
        assert!(parsed["data"]["output"].as_str().unwrap().contains("a.txt"));
        assert!(!parsed["data"]["output"].as_str().unwrap().contains("b.txt"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn git_diff_path_rejects_a_nonexistent_file() {
        let root = init_repo("diff-missing");
        let err = git_diff_path(&root, false, "does-not-exist.txt").unwrap_err();
        assert!(matches!(err, CapabilityError::NotFound { .. }));
        fs::remove_dir_all(root).ok();
    }
}
