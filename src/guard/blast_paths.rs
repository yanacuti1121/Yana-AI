//! Path resolution for the blast-radius guard.
//!
//! Split out of blast_radius.rs so that file stays under the repo's 300-line
//! limit (agent-code-constraints.md), and so the protected-path matching — the
//! security-critical part — is isolated and unit-testable on its own.
//!
//! The job here is to defeat the absolute-path bypass: a protected prefix like
//! `core/rules` must match whether the agent writes `core/rules/x`,
//! `./core/../core/rules/x`, or the fully-qualified
//! `/workspaces/Yana-AI/core/rules/x`. We do that by reducing every operand to
//! a single canonical *repo-relative* form before comparing.

use std::path::{Component, Path, PathBuf};

/// Repo root used to strip absolute paths back to repo-relative form.
/// Defaults to the current working directory (where the hook runs = repo root
/// under Claude Code). Override with YANA_REPO_ROOT for tests or odd layouts.
fn repo_root() -> PathBuf {
    std::env::var("YANA_REPO_ROOT")
        .map(PathBuf::from)
        .ok()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Reduce an operand to a canonical repo-relative path string for comparison.
///
/// Steps: lexically fold `.`/`..`, then — if the result is absolute — strip the
/// repo-root prefix so an absolute path lands in the same namespace as a
/// relative one. An absolute path that is NOT under the repo root is returned
/// as-is (still absolute), so something like `/etc/passwd` won't silently be
/// treated as repo-relative.
fn repo_relative(raw: &str) -> String {
    let folded = lexical_fold(Path::new(raw));

    if folded.is_absolute() {
        let root = lexical_fold(&repo_root());
        if let Ok(stripped) = folded.strip_prefix(&root) {
            return stripped.to_string_lossy().into_owned();
        }
        return folded.to_string_lossy().into_owned();
    }
    folded.to_string_lossy().into_owned()
}

/// Lexically normalize `.` and `..` without touching the filesystem, so
/// `core/../core/rules` collapses to `core/rules`. Does not resolve symlinks
/// (we want a string-level guard that doesn't depend on what exists on disk).
fn lexical_fold(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Does this operand resolve inside any protected prefix? Returns the prefix.
///
/// Matching is on a path-segment boundary so `core/rules` flags
/// `core/rules/x` but not a sibling `core/rulesets-public/x`. Both the raw and
/// the repo-relative forms are checked, so a relative path with no repo root
/// configured still works.
pub fn protected_hit(raw: &str, protected: &[String]) -> Option<String> {
    let rel = repo_relative(raw);
    for p in protected {
        if matches_prefix(&rel, p) || matches_prefix(raw, p) {
            return Some(p.clone());
        }
    }
    None
}

fn matches_prefix(candidate: &str, prefix: &str) -> bool {
    candidate == prefix || candidate.starts_with(&format!("{prefix}/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prot() -> Vec<String> {
        vec!["core/rules".to_string(), ".git".to_string()]
    }

    #[test]
    fn relative_path_is_protected() {
        assert!(protected_hit("core/rules/00-meta.md", &prot()).is_some());
    }

    #[test]
    fn dotdot_path_is_protected() {
        assert!(protected_hit("core/../core/rules/x.md", &prot()).is_some());
    }

    #[test]
    fn absolute_path_under_repo_root_is_protected() {
        // THE BYPASS: the Codespaces reviewer caught this — an absolute path
        // used to slip straight past protected_hit. It must not anymore.
        std::env::set_var("YANA_REPO_ROOT", "/workspaces/Yana-AI");
        let hit = protected_hit("/workspaces/Yana-AI/core/rules/00-meta.md", &prot());
        std::env::remove_var("YANA_REPO_ROOT");
        assert!(hit.is_some(), "absolute path under repo root must be blocked");
    }

    #[test]
    fn sibling_dir_is_not_protected() {
        assert!(protected_hit("core/rulesets-public/x", &prot()).is_none());
    }

    #[test]
    fn unrelated_absolute_path_not_treated_as_repo_relative() {
        std::env::set_var("YANA_REPO_ROOT", "/workspaces/Yana-AI");
        // /etc/passwd is not under the repo and not a protected prefix → no hit
        let hit = protected_hit("/etc/passwd", &prot());
        std::env::remove_var("YANA_REPO_ROOT");
        assert!(hit.is_none());
    }
}
