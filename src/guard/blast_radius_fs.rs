//! Filesystem measurement helpers for `guard blast-radius` — counting real
//! files an operand would touch, and resolving paths to repo-relative form
//! so the protected-path check can't be bypassed by spelling the same
//! target as an absolute path instead of a relative one.

use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

/// Count real files under `raw` (expanding a trailing glob), bounded by `cap`.
/// A non-existent path counts as 0 (e.g. `rm newfile` that doesn't exist yet
/// is harmless). A single existing file counts as 1. A directory walks.
pub fn count_files(raw: &str, cap: usize) -> usize {
    // Glob expansion first: `rm build/*.o` -> each match walked.
    if raw.contains('*') || raw.contains('?') || raw.contains('[') {
        if let Ok(paths) = glob::glob(raw) {
            let mut n = 0;
            for entry in paths.flatten() {
                n += count_path(&entry, cap - n.min(cap));
                if n >= cap {
                    return cap;
                }
            }
            return n;
        }
    }
    count_path(Path::new(raw), cap)
}

fn count_path(p: &Path, cap: usize) -> usize {
    if !p.exists() {
        return 0;
    }
    if p.is_file() {
        return 1;
    }
    let mut n = 0;
    for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            n += 1;
            if n >= cap {
                return cap;
            }
        }
    }
    n
}

/// Lexically normalize `.` and `..` without touching the filesystem, so a
/// `core/../core/rules` style path still maps onto the protected prefix.
pub fn normalize(p: &Path) -> PathBuf {
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

/// Resolve `raw` to a repo-relative, lexically normalized path. Absolute
/// paths are collapsed against the current working directory (the hook
/// always runs with cwd = repo root) so `/repo/core/rules/x` and
/// `core/rules/x` hit the same protected-prefix check.
///
/// Bug fix (found during integration review, before this guard was wired
/// into any hook): the original version only normalized `.`/`..` and never
/// relativized an absolute path, so `rm /abs/path/core/rules/x.md` — a
/// single file, well under the file-count ceiling — slipped through the
/// protected-path check entirely. Verified against the real binary before
/// and after this fix.
pub fn repo_relative(raw: &Path) -> PathBuf {
    let norm = normalize(raw);
    if !norm.is_absolute() {
        return norm;
    }
    match std::env::current_dir() {
        Ok(cwd) => norm
            .strip_prefix(normalize(&cwd))
            .map(PathBuf::from)
            .unwrap_or(norm),
        Err(_) => norm,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_relative_collapses_absolute_path_under_cwd() {
        let cwd = std::env::current_dir().unwrap();
        let abs = cwd.join("core/rules/x.md");
        assert_eq!(repo_relative(&abs), PathBuf::from("core/rules/x.md"));
    }

    #[test]
    fn repo_relative_passes_through_relative_path() {
        assert_eq!(
            repo_relative(Path::new("core/rules/x.md")),
            PathBuf::from("core/rules/x.md")
        );
    }

    #[test]
    fn normalize_resolves_parent_dir_segments() {
        assert_eq!(
            normalize(Path::new("core/../core/rules")),
            PathBuf::from("core/rules")
        );
    }
}
