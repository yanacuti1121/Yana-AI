//! Copying a command's changes from the private copy back to the real working directory
//! (WS6 E1b). Nothing the container produced is trusted: only plain files come back, never
//! over `.git`, `.yana-ai` or a secret-looking name, never through or over a symbolic link,
//! never where the real file changed in the meantime, and never past the size limits. Limits
//! are checked before anything is written.

use super::staging::{excluded, hash_file, open_plain, Digest32, Staging, StagingLimits};
use crate::capability::CapabilityError;
use std::collections::BTreeSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct SyncReport {
    pub written: usize,
    pub deleted: usize,
    /// What was not copied back, and why (names only, never contents).
    pub skipped: Vec<String>,
}

enum Change {
    Write { relative: String, source: PathBuf },
    Delete { relative: String },
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn skip(report: &mut SyncReport, relative: &str, reason: &str) {
    const MAX_NOTES: usize = 20;
    if report.skipped.len() < MAX_NOTES {
        report.skipped.push(format!("{relative} ({reason})"));
    }
}

/// Decide what changed in the copy, within the limits. Writes nothing.
fn plan(staging: &Staging, limits: StagingLimits, report: &mut SyncReport) -> Result<Vec<Change>, CapabilityError> {
    let mut changes = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let (mut examined, mut changed_bytes) = (0usize, 0u64);
    let mut stack = vec![(String::new(), 0usize)];
    while let Some((relative_dir, depth)) = stack.pop() {
        let dir = if relative_dir.is_empty() { staging.dir.clone() } else { staging.dir.join(&relative_dir) };
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            examined += 1;
            if examined > limits.max_files.saturating_mul(2) {
                return Err(invalid("the command left far more files than the limit allows: nothing was copied back"));
            }
            let Ok(kind) = entry.file_type() else { continue };
            let Ok(name) = entry.file_name().into_string() else {
                skip(report, "(a name that is not valid UTF-8)", "not copied back");
                continue;
            };
            let relative = if relative_dir.is_empty() { name } else { format!("{relative_dir}/{name}") };
            if relative.contains(|c: char| c.is_control()) {
                skip(report, "(a name with a control character)", "not copied back");
            } else if let Some(reason) = excluded(&relative) {
                skip(report, &relative, reason);
            } else if kind.is_symlink() {
                skip(report, &relative, "symbolic link");
            } else if kind.is_dir() {
                if depth + 1 > limits.max_depth {
                    return Err(invalid("the command nested directories deeper than the limit: nothing was copied back"));
                }
                stack.push((relative, depth + 1));
            } else if kind.is_file() {
                seen.insert(relative.clone());
                let digest = hash_file(&entry.path()).map_err(|error| CapabilityError::Io { detail: format!("cannot read {relative} in the copy: {error}") })?;
                if staging.baseline.get(&relative) != Some(&digest) {
                    changed_bytes += entry.metadata().map_or(0, |m| m.len());
                    if changed_bytes > limits.max_bytes || changes.len() >= limits.max_files {
                        return Err(invalid("the command changed more than the limit allows: nothing was copied back"));
                    }
                    changes.push(Change::Write { relative, source: entry.path() });
                }
            } else {
                skip(report, &relative, "not a plain file");
            }
        }
    }
    for relative in staging.baseline.keys().filter(|r| !seen.contains(*r)) {
        changes.push(Change::Delete { relative: relative.clone() });
    }
    Ok(changes)
}

/// The real path for `relative`, with every directory above it checked to be a real
/// directory (made when missing), so nothing is written through a symbolic link.
fn host_path(root: &Path, relative: &str, create: bool) -> Result<PathBuf, String> {
    let mut path = root.to_path_buf();
    let parts: Vec<&str> = relative.split('/').collect();
    for part in &parts[..parts.len() - 1] {
        path.push(part);
        match std::fs::symlink_metadata(&path) {
            Ok(meta) if meta.is_dir() => {}
            Ok(_) => return Err("a folder on this machine is a link or a file".into()),
            Err(_) if create => {
                std::fs::create_dir(&path).map_err(|error| format!("cannot create a folder ({:?})", error.kind()))?;
            }
            Err(_) => return Err("the folder is gone".into()),
        }
    }
    path.push(parts[parts.len() - 1]);
    Ok(path)
}

fn apply_write(root: &Path, staging: &Staging, relative: &str, source: &Path) -> Result<(), String> {
    let target = host_path(root, relative, true)?;
    let expected: Option<&Digest32> = staging.baseline.get(relative);
    match std::fs::symlink_metadata(&target) {
        Ok(meta) if !meta.is_file() => return Err("a link or folder is there on this machine".into()),
        Ok(_) => {
            let now = hash_file(&target).map_err(|_| "cannot read the file on this machine".to_string())?;
            if expected != Some(&now) {
                return Err("changed on this machine meanwhile".into());
            }
        }
        Err(_) if expected.is_some() => return Err("deleted on this machine meanwhile".into()),
        Err(_) => {}
    }
    let temp = target.with_file_name(format!(".yana-sync-{}", uuid::Uuid::new_v4().simple()));
    let result = (|| -> std::io::Result<()> {
        let mut input = open_plain(source)?;
        let mut output = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp)?;
        let mut chunk = [0u8; 65536];
        loop {
            let n = input.read(&mut chunk)?;
            if n == 0 {
                break;
            }
            output.write_all(&chunk[..n])?;
        }
        output.flush()?;
        #[cfg(unix)]
        {
            let mode = super::staging::plain_mode(std::os::unix::fs::PermissionsExt::mode(&input.metadata()?.permissions()));
            std::fs::set_permissions(&temp, std::os::unix::fs::PermissionsExt::from_mode(mode))?;
        }
        std::fs::rename(&temp, &target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result.map_err(|error| format!("cannot write ({:?})", error.kind()))
}

fn apply_delete(root: &Path, staging: &Staging, relative: &str) -> Result<(), String> {
    let target = host_path(root, relative, false)?;
    match std::fs::symlink_metadata(&target) {
        Ok(meta) if meta.is_file() => {
            let now = hash_file(&target).map_err(|_| "cannot read the file on this machine".to_string())?;
            if staging.baseline.get(relative) != Some(&now) {
                return Err("changed on this machine, so it was not deleted".into());
            }
            std::fs::remove_file(&target).map_err(|error| format!("cannot delete ({:?})", error.kind()))
        }
        Ok(_) => Err("not a plain file on this machine, so it was not deleted".into()),
        Err(_) => Ok(()),
    }
}

/// Copy what the command changed in `staging` back into `root`.
pub(super) fn sync_back(staging: &Staging, root: &Path, limits: StagingLimits) -> Result<SyncReport, CapabilityError> {
    let mut report = SyncReport::default();
    let changes = plan(staging, limits, &mut report)?;
    for change in changes {
        let (relative, outcome, is_write) = match &change {
            Change::Write { relative, source } => (relative.as_str(), apply_write(root, staging, relative, source), true),
            Change::Delete { relative } => (relative.as_str(), apply_delete(root, staging, relative), false),
        };
        match (outcome, is_write) {
            (Ok(()), true) => report.written += 1,
            (Ok(()), false) => report.deleted += 1,
            (Err(reason), _) => skip(&mut report, relative, &reason),
        }
    }
    Ok(report)
}
