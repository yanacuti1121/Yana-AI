//! Writing checkpoint contents back into the project, safely.
//!
//! Restoring never uses git to touch the working tree (no checkout, no
//! reset). It reads each file's bytes from the shadow repository and writes
//! them itself, after checking the destination:
//! - the path is relative and has no `.`, `..`, empty or drive segments;
//! - the deepest existing ancestor resolves (links followed) to somewhere
//!   inside the project, checked BEFORE anything is created;
//! - the destination is not itself a link and not a directory;
//! - links stored in a checkpoint are never recreated.

use super::CheckpointError;
use std::fs;
use std::path::Path;

/// One row of `git ls-tree -r`.
pub(super) struct TreeEntry {
    pub mode: String,
    pub sha: String,
    pub path: String,
}

/// Why one file was not restored.
pub(super) struct Skip {
    pub reason: String,
    /// True when the destination would leave the project or go through a link.
    pub unsafe_path: bool,
}

const MODE_SYMLINK: &str = "120000";
const MODE_GITLINK: &str = "160000";
const MODE_EXECUTABLE: &str = "100755";

pub(super) fn parse_tree(bytes: &[u8]) -> Result<Vec<TreeEntry>, CheckpointError> {
    let text = String::from_utf8_lossy(bytes);
    let mut entries = Vec::new();
    for record in text.split('\0').filter(|r| !r.is_empty()) {
        let (meta, path) = record
            .split_once('\t')
            .ok_or_else(|| CheckpointError::Git(format!("unexpected ls-tree line: {record}")))?;
        let mut fields = meta.split(' ');
        let (mode, _kind, sha) = (fields.next(), fields.next(), fields.next());
        let (Some(mode), Some(sha)) = (mode, sha) else {
            return Err(CheckpointError::Git(format!("unexpected ls-tree line: {record}")));
        };
        entries.push(TreeEntry { mode: mode.to_string(), sha: sha.to_string(), path: path.to_string() });
    }
    Ok(entries)
}

/// Validate a caller-supplied relative path and return it with `/` separators.
pub(super) fn normalize(path: &Path) -> Result<String, CheckpointError> {
    let invalid = |why: &str| CheckpointError::InvalidPath(format!("{}: {why}", path.display()));
    let text = path.to_str().ok_or_else(|| invalid("not valid UTF-8"))?;
    if text.is_empty() || text.starts_with('/') {
        return Err(invalid("must be a relative path"));
    }
    if text.contains(['\\', ':', '\0']) {
        return Err(invalid("contains a separator or drive character"));
    }
    if text.split('/').any(|segment| matches!(segment, "" | "." | "..")) {
        return Err(invalid("contains an empty, '.' or '..' segment"));
    }
    Ok(text.to_string())
}

fn skip(reason: &str, unsafe_path: bool) -> Skip {
    Skip { reason: reason.to_string(), unsafe_path }
}

/// Write `content` to `entry.path` under `project` (already canonical).
pub(super) fn write_entry(project: &Path, entry: &TreeEntry, content: &[u8]) -> Result<(), Skip> {
    if entry.mode == MODE_SYMLINK {
        return Err(skip("stored as a link, links are never recreated", false));
    }
    if entry.mode == MODE_GITLINK {
        return Err(skip("nested repository, not restored", false));
    }
    normalize(Path::new(&entry.path)).map_err(|error| skip(&error.to_string(), true))?;
    let target = project.join(&entry.path);
    let parent = target.parent().ok_or_else(|| skip("no parent directory", true))?;
    check_inside(project, parent)?;
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() {
            return Err(skip("the destination is a link, not writing through it", true));
        }
        if meta.is_dir() {
            return Err(skip("a directory is in the way", false));
        }
    }
    fs::create_dir_all(parent).map_err(|e| skip(&format!("creating directories: {e}"), false))?;
    check_inside(project, parent)?;
    write_atomically(&target, content, entry.mode == MODE_EXECUTABLE)
}

/// The deepest existing ancestor of `dir`, with links resolved, must lie
/// inside `project`. Runs before anything is created.
fn check_inside(project: &Path, dir: &Path) -> Result<(), Skip> {
    let mut existing = dir;
    while !existing.exists() {
        existing = existing.parent().ok_or_else(|| skip("no existing ancestor", true))?;
    }
    let real = existing.canonicalize().map_err(|e| skip(&format!("resolving path: {e}"), true))?;
    if real.starts_with(project) {
        Ok(())
    } else {
        Err(skip("the destination resolves outside the project", true))
    }
}

fn write_atomically(target: &Path, content: &[u8], executable: bool) -> Result<(), Skip> {
    let io = |what: &str, e: std::io::Error| skip(&format!("{what}: {e}"), false);
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let temporary = target.with_file_name(format!(".{name}.yana-restore"));
    fs::write(&temporary, content).map_err(|e| io("writing", e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = if executable { 0o755 } else { 0o644 };
        fs::set_permissions(&temporary, fs::Permissions::from_mode(mode)).map_err(|e| io("setting permissions", e))?;
    }
    #[cfg(not(unix))]
    let _ = executable;
    fs::rename(&temporary, target).map_err(|e| io("replacing", e))
}
