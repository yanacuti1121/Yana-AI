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
///
/// Reads $PWD, not std::env::current_dir() — this was the absolute-path
/// bypass regression (2026-07-03): current_dir() calls getcwd(), which
/// resolves symlinks and returns the *physical* path, while a command's raw
/// operand is whatever the caller typed (the *logical* path). On any system
/// where part of the cwd is a symlink — every macOS run of this guard's own
/// test suite, since /tmp -> /private/tmp there, and potentially real repo
/// checkouts on iCloud Desktop sync or similar — repo_root() would resolve
/// to /private/var/... while an absolute operand stayed /var/..., the
/// strip_prefix below would never match, and the operand would fall through
/// to the raw-absolute-path comparison, which a relative protected prefix
/// like "core/rules" can never match. $PWD is what the shell's `cd` set it
/// to, unresolved — the same logical form a typed command path would use.
fn repo_root() -> PathBuf {
    std::env::var("YANA_REPO_ROOT")
        .or_else(|_| std::env::var("PWD"))
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

/// Repo-relative paths registered as fragile entry points — see
/// core/rules/71-entry-point-verify-law.md. A syntactic mistake in one of
/// these can break the whole tool (not just degrade a code path), so edits
/// require an independent verify-agent exec pass, not just a diff review.
/// Extend via YANA_ENTRY_POINT_PATHS (colon-separated) without recompiling.
pub fn entry_point_prefixes() -> Vec<String> {
    let mut v = vec![
        "scripts/yana-rt-wrapper.js".to_string(),
        // Same npm-bin-linked, shebang-at-byte-0 fragility as
        // yana-rt-wrapper.js's two incidents (71-entry-point-verify-law.md)
        // — bin/yana is the primary `yana-ai` CLI entry point itself.
        "bin/yana".to_string(),
        "scripts/npm-install.js".to_string(),
    ];
    if let Ok(extra) = std::env::var("YANA_ENTRY_POINT_PATHS") {
        v.extend(extra.split(':').filter(|s| !s.is_empty()).map(String::from));
    }
    v
}

/// Does this operand match a registered entry-point file? Reuses the same
/// repo-relative normalization as `protected_hit`.
pub fn entry_point_hit(raw: &str, entry_points: &[String]) -> Option<String> {
    let rel = repo_relative(raw);
    for p in entry_points {
        // matches_prefix already covers the exact-match case internally
        // (candidate == prefix), so no separate `rel == *p` check is needed.
        if matches_prefix(&rel, p) || matches_prefix(raw, p) {
            return Some(p.clone());
        }
    }
    None
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
    fn absolute_path_via_pwd_fallback_with_symlinked_cwd_is_protected() {
        // THE 2026-07-03 REGRESSION: the test above only ever exercised the
        // YANA_REPO_ROOT override branch, never the default fallback — so it
        // kept passing even after repo_root() started calling
        // std::env::current_dir() (which resolves symlinks) instead of
        // reading $PWD (which doesn't). On macOS, /tmp -> /private/tmp, so
        // any real invocation with cwd under /tmp — including this guard's
        // own bash-driven end-to-end test suite — hit exactly this: raw
        // operand path stayed "/var/folders/.../core/rules/x", repo_root()
        // resolved to "/private/var/folders/.../", strip_prefix failed
        // silently, and the absolute-path bypass was back. This test forces
        // that exact mismatch (a $PWD that isn't what current_dir() would
        // return) without needing an actual symlinked directory on disk.
        std::env::remove_var("YANA_REPO_ROOT");
        let prior_pwd = std::env::var("PWD").ok();
        std::env::set_var("PWD", "/var/folders/fake/tmp.abc123");
        let hit = protected_hit("/var/folders/fake/tmp.abc123/core/rules/00-meta.md", &prot());
        match prior_pwd {
            Some(v) => std::env::set_var("PWD", v),
            None => std::env::remove_var("PWD"),
        }
        assert!(hit.is_some(), "absolute path resolved via $PWD fallback must be blocked");
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

    // ── entry_point_hit / entry_point_prefixes (71-entry-point-verify-law) ──

    fn entry_points() -> Vec<String> {
        vec!["scripts/yana-rt-wrapper.js".to_string()]
    }

    #[test]
    fn registered_entry_point_is_hit() {
        assert!(entry_point_hit("scripts/yana-rt-wrapper.js", &entry_points()).is_some());
    }

    #[test]
    fn dotdot_path_to_entry_point_is_hit() {
        assert!(entry_point_hit("scripts/../scripts/yana-rt-wrapper.js", &entry_points()).is_some());
    }

    #[test]
    fn absolute_path_to_entry_point_is_hit() {
        std::env::set_var("YANA_REPO_ROOT", "/workspaces/Yana-AI");
        let hit = entry_point_hit(
            "/workspaces/Yana-AI/scripts/yana-rt-wrapper.js",
            &entry_points(),
        );
        std::env::remove_var("YANA_REPO_ROOT");
        assert!(hit.is_some());
    }

    #[test]
    fn sibling_script_is_not_hit() {
        assert!(entry_point_hit("scripts/other-wrapper.js", &entry_points()).is_none());
    }

    #[test]
    fn bin_yana_is_registered_entry_point() {
        assert!(entry_point_hit("bin/yana", &entry_point_prefixes()).is_some());
    }

    #[test]
    fn npm_install_js_is_registered_entry_point() {
        assert!(entry_point_hit("scripts/npm-install.js", &entry_point_prefixes()).is_some());
    }

    #[test]
    fn unrelated_file_is_not_hit() {
        assert!(entry_point_hit("src/main.rs", &entry_points()).is_none());
    }

    #[test]
    fn env_extension_adds_entry_point() {
        std::env::set_var("YANA_ENTRY_POINT_PATHS", "scripts/other-wrapper.sh:bin/cli.js");
        let points = entry_point_prefixes();
        std::env::remove_var("YANA_ENTRY_POINT_PATHS");
        assert!(points.iter().any(|p| p == "scripts/yana-rt-wrapper.js"));
        assert!(points.iter().any(|p| p == "scripts/other-wrapper.sh"));
        assert!(points.iter().any(|p| p == "bin/cli.js"));
    }
}
