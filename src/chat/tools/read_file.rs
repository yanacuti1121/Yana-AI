//! Read-only, repo-root-sandboxed file read tool. Runs synchronously
//! inline in the turn loop (see `tui/turn.rs`) — no approval prompt,
//! since it's read-only and outside the scope of anh's explicit
//! "only `run_command` needs to ask" decision.

use std::path::Path;

/// Generous enough for source files, bounded against a runaway model
/// asking to read a huge binary/log file.
const MAX_READ_BYTES: u64 = 256 * 1024;

/// Reads `requested_path`, resolved relative to `repo_root`, after
/// confirming the resolved path stays inside `repo_root` (Gate L5 path
/// traversal check — see `execution-environment.md`). Canonicalizes both
/// sides first, so this also catches a symlink inside the repo that
/// points outside it (not a defense against a TOCTOU race between the
/// canonicalize and the read — out of scope, see the plan).
pub fn execute(repo_root: &Path, requested_path: &str) -> Result<String, String> {
    let candidate = repo_root.join(requested_path);
    let resolved = candidate.canonicalize().map_err(|e| format!("cannot resolve path: {e}"))?;
    let root = repo_root.canonicalize().map_err(|e| format!("cannot resolve repo root: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err(format!("path escapes repo root (Gate L5): {requested_path}"));
    }
    let meta = std::fs::metadata(&resolved).map_err(|e| e.to_string())?;
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("file too large ({} bytes, cap is {MAX_READ_BYTES})", meta.len()));
    }
    std::fs::read_to_string(&resolved).map_err(|e| format!("read failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp_repo(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yana-read-file-test-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_file_inside_repo() {
        let root = tmp_repo("inside");
        fs::write(root.join("a.txt"), "hello").unwrap();
        assert_eq!(execute(&root, "a.txt").unwrap(), "hello");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn denies_path_traversal_via_dotdot() {
        let root = tmp_repo("dotdot");
        let outside = root.parent().unwrap().join(format!("outside-{}.txt", uuid::Uuid::new_v4()));
        fs::write(&outside, "secret").unwrap();
        let rel = format!("../{}", outside.file_name().unwrap().to_str().unwrap());
        let result = execute(&root, &rel);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("escapes repo root"));
        fs::remove_file(&outside).ok();
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn denies_symlink_escaping_repo_root() {
        let root = tmp_repo("symlink");
        let outside = root.parent().unwrap().join(format!("outside-link-target-{}.txt", uuid::Uuid::new_v4()));
        fs::write(&outside, "secret").unwrap();
        let link = root.join("escape-link.txt");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        let result = execute(&root, "escape-link.txt");
        assert!(result.is_err());
        fs::remove_file(&outside).ok();
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn denies_oversized_file() {
        let root = tmp_repo("oversize");
        let big = vec![b'x'; (MAX_READ_BYTES + 1) as usize];
        fs::write(root.join("big.txt"), &big).unwrap();
        let result = execute(&root, "big.txt");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too large"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn missing_file_is_a_clean_error_not_a_panic() {
        let root = tmp_repo("missing");
        let result = execute(&root, "does-not-exist.txt");
        assert!(result.is_err());
        fs::remove_dir_all(&root).ok();
    }
}
