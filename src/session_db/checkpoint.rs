//! Checkpoints and rollback for a project's files (WS4 step 4,
//! docs/contracts/ws4-state.md section 7).
//!
//! A checkpoint is a commit in a SHADOW git repository that lives in the
//! profile's state directory. The project's own `.git` is never read or
//! written: every command names the shadow repository explicitly (see
//! `git.rs`). Restoring writes files itself, after path checks (`restore.rs`).
//!
//! Not captured: `.git`, `.yana-ai`, `node_modules`, `target`, and the usual
//! credential files (`.env*`, keys, certificates, `.ssh`, `.aws`, `.npmrc`).
//! Nothing is hooked into the agent's file writes yet; callers decide when to
//! call `snapshot`.

mod git;
mod limit;
#[cfg(test)]
mod limit_tests;
mod restore;
mod shadow;
#[cfg(test)]
mod shadow_tests;
#[cfg(test)]
mod safety_tests;
#[cfg(test)]
mod tests;
mod types;

pub use types::{
    CheckpointError, CheckpointId, CheckpointInfo, PruneReport, PrunePolicy, RestoreReport,
    RestoreScope,
};

use super::{StateKind, StateRoot};
use git::{git_command, init_command, run_until};
use restore::{normalize, parse_tree, write_entry, TreeEntry};
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Largest diff returned, in bytes.
pub const MAX_DIFF_BYTES: usize = 1024 * 1024;
const REF_PREFIX: &str = "refs/yana/cp/";
const MAX_LABEL_CHARS: usize = 200;
/// Hex characters of the project-path hash used in the shadow directory name.
const SHADOW_NAME_HEX: usize = 16;

pub struct CheckpointStore {
    git: OsString,
    project: PathBuf,
    shadow: PathBuf,
    /// Longest a `snapshot` may take (see `limit.rs`); `None` means no limit.
    time_limit: Option<std::time::Duration>,
    deadline: std::cell::Cell<Option<std::time::Instant>>,
}

impl CheckpointStore {
    pub fn open(root: &StateRoot, project: &Path) -> Result<Self, CheckpointError> {
        Self::open_with_git(root, project, OsString::from("git"))
    }

    /// `git` names the program to run; tests use it to simulate a missing git.
    pub fn open_with_git(root: &StateRoot, project: &Path, git: OsString) -> Result<Self, CheckpointError> {
        root.ensure_dir().map_err(|e| CheckpointError::Io(e.to_string()))?;
        let invalid = |why: String| CheckpointError::InvalidProject(why);
        let project = project.canonicalize().map_err(|e| invalid(format!("{}: {e}", project.display())))?;
        if !project.is_dir() {
            return Err(invalid(format!("{} is not a directory", project.display())));
        }
        if project.parent().is_none() {
            return Err(invalid("the filesystem root is not a project".to_string()));
        }
        let dir = root.path(StateKind::Checkpoints);
        fs::create_dir_all(&dir).map_err(|e| CheckpointError::Io(format!("creating {}: {e}", dir.display())))?;
        let digest = Sha256::digest(project.to_string_lossy().as_bytes());
        let name: String = digest.iter().map(|b| format!("{b:02x}")).collect::<String>()[..SHADOW_NAME_HEX].to_string();
        let shadow = dir.join(format!("{name}.git"));
        Ok(Self { git, project, shadow, time_limit: None, deadline: std::cell::Cell::new(None) })
    }

    fn cmd(&self, needs_work_tree: bool) -> Command {
        git_command(&self.git, &self.shadow, needs_work_tree.then_some(self.project.as_path()))
    }

    fn require_git(&self) -> Result<(), CheckpointError> {
        let mut probe = Command::new(&self.git);
        probe.arg("--version");
        self.run(&mut probe).map(|_| ())
    }

    fn ensure_shadow(&self) -> Result<(), CheckpointError> {
        if !self.shadow.join("HEAD").exists() {
            self.run(&mut init_command(&self.git, &self.shadow))?;
        }
        self.harden()
    }

    /// Record the project's current files. Returns the newest checkpoint when
    /// nothing changed since it, so repeated calls do not pile up duplicates.
    fn snapshot_inner(&self, label: &str) -> Result<CheckpointId, CheckpointError> {
        self.require_git()?;
        self.ensure_shadow()?;
        self.add_all()?;
        let tree =self.run_text(self.cmd(false).arg("write-tree"))?;
        let existing = self.list()?;
        if let Some(last) = existing.last() {
            let last_tree = self.run_text(self.cmd(false).args(["rev-parse", &format!("{}^{{tree}}", last.commit)]))?;
            if last_tree == tree {
                return Ok(last.id);
            }
        }
        let commit = self.run_text(self.cmd(false).args(["commit-tree", &tree, "-m", &clean_label(label)]))?;
        let id = CheckpointId(existing.last().map_or(1, |c| c.id.0 + 1));
        // The empty old value means "must not exist yet": a racing snapshot is never overwritten.
        self.run(self.cmd(false).args(["update-ref", &format!("{REF_PREFIX}{:06}", id.0), &commit, ""]))?;
        Ok(id)
    }

    /// Checkpoints, oldest first.
    pub fn list(&self) -> Result<Vec<CheckpointInfo>, CheckpointError> {
        self.require_git()?;
        if !self.shadow.join("HEAD").exists() {
            return Ok(Vec::new());
        }
        let format = "--format=%(refname)%09%(objectname)%09%(creatordate:iso-strict)%09%(contents:subject)";
        let output = self.run_text(self.cmd(false).args(["for-each-ref", format, REF_PREFIX]))?;
        Ok(output.lines().filter_map(parse_ref_line).collect())
    }

    fn commit_of(&self, id: CheckpointId) -> Result<String, CheckpointError> {
        self.list()?
            .into_iter()
            .find(|c| c.id == id)
            .map(|c| c.commit)
            .ok_or_else(|| CheckpointError::NotFound(format!("checkpoint {}", id.0)))
    }

    /// Paths recorded in a checkpoint.
    pub fn files(&self, id: CheckpointId) -> Result<Vec<String>, CheckpointError> {
        let commit = self.commit_of(id)?;
        let out = self.run(self.cmd(false).args(["ls-tree", "-r", "--name-only", "-z", &commit]))?;
        Ok(String::from_utf8_lossy(&out).split('\0').filter(|p| !p.is_empty()).map(str::to_string).collect())
    }

    /// What changed in the project since checkpoint `id`, as a unified diff.
    pub fn diff(&self, id: CheckpointId) -> Result<String, CheckpointError> {
        let commit = self.commit_of(id)?;
        self.add_all()?;
        let out =self.run(self.cmd(false).args(["diff", "--cached", "--no-color", "--no-ext-diff", &commit]))?;
        let mut text = String::from_utf8_lossy(&out).to_string();
        if text.len() > MAX_DIFF_BYTES {
            let mut end = MAX_DIFF_BYTES;
            while !text.is_char_boundary(end) {
                end -= 1;
            }
            text.truncate(end);
            text.push_str("\n[diff truncated]");
        }
        Ok(text)
    }

    /// Put files from checkpoint `id` back. Takes a safety checkpoint first,
    /// never deletes anything, and skips links.
    pub fn restore(&self, id: CheckpointId, scope: RestoreScope) -> Result<RestoreReport, CheckpointError> {
        let commit = self.commit_of(id)?;
        let wanted_path = match &scope {
            RestoreScope::Whole => None,
            RestoreScope::OneFile(path) => Some(normalize(path)?),
        };
        let mut entries = parse_tree(&self.run(self.cmd(false).args(["ls-tree", "-r", "-z", "--full-tree", &commit]))?)?;
        if let Some(path) = &wanted_path {
            entries.retain(|entry| &entry.path == path);
            if entries.is_empty() {
                return Err(CheckpointError::NotFound(format!("{path} in checkpoint {}", id.0)));
            }
        }
        let safety = self.snapshot("before restore")?;
        let mut report = RestoreReport { restored: Vec::new(), skipped: Vec::new(), safety_checkpoint: Some(safety) };
        for entry in entries {
            match self.restore_entry(&entry) {
                Ok(()) => report.restored.push(entry.path),
                Err(skip) if wanted_path.is_some() && skip.unsafe_path => {
                    return Err(CheckpointError::OutsideProject(format!("{}: {}", entry.path, skip.reason)));
                }
                Err(skip) if wanted_path.is_some() => {
                    return Err(CheckpointError::InvalidPath(format!("{}: {}", entry.path, skip.reason)));
                }
                Err(skip) => report.skipped.push((entry.path, skip.reason)),
            }
        }
        Ok(report)
    }

    fn restore_entry(&self, entry: &TreeEntry) -> Result<(), restore::Skip> {
        let content = self.run(self.cmd(false).args(["cat-file", "blob", &entry.sha]))
            .map_err(|e| restore::Skip { reason: e.to_string(), unsafe_path: false })?;
        write_entry(&self.project, entry, &content)
    }

    /// Drop the oldest checkpoints beyond `max_points`, then beyond the size
    /// cap. The newest checkpoint is never removed.
    pub fn prune(&self, policy: PrunePolicy) -> Result<PruneReport, CheckpointError> {
        let mut points = self.list()?;
        let keep = policy.max_points.max(1);
        let mut removed = 0;
        while points.len() > keep {
            self.delete_point(&points.remove(0))?;
            removed += 1;
        }
        if removed > 0 {
            self.collect_garbage()?;
        }
        while points.len() > 1 && dir_size(&self.shadow) > policy.max_bytes {
            self.delete_point(&points.remove(0))?;
            self.collect_garbage()?;
            removed += 1;
        }
        Ok(PruneReport { removed, kept: points.len() })
    }

    fn delete_point(&self, point: &CheckpointInfo) -> Result<(), CheckpointError> {
        self.run(self.cmd(false).args(["update-ref", "-d", &format!("{REF_PREFIX}{:06}", point.id.0)])).map(|_| ())
    }

    fn collect_garbage(&self) -> Result<(), CheckpointError> {
        self.run(self.cmd(false).args(["gc", "--prune=now", "--quiet"])).map(|_| ())
    }
}

fn parse_ref_line(line: &str) -> Option<CheckpointInfo> {
    let mut parts = line.splitn(4, '\t');
    let (name, commit, created_at, label) = (parts.next()?, parts.next()?, parts.next()?, parts.next()?);
    let id = name.strip_prefix(REF_PREFIX)?.parse::<u32>().ok()?;
    Some(CheckpointInfo {
        id: CheckpointId(id),
        commit: commit.to_string(),
        label: label.to_string(),
        created_at: created_at.to_string(),
    })
}

/// One line, no control characters, bounded length.
fn clean_label(label: &str) -> String {
    let single: String = label.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let trimmed = single.trim();
    if trimmed.is_empty() {
        "checkpoint".to_string()
    } else {
        trimmed.chars().take(MAX_LABEL_CHARS).collect()
    }
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| match entry.metadata() {
            Ok(meta) if meta.is_dir() => dir_size(&entry.path()),
            Ok(meta) => meta.len(),
            Err(_) => 0,
        })
        .sum()
}
