//! Project Workspace Service (Yana Studio architecture audit, Phase 5):
//! a headless, file-tree/dev-workspace service — deliberately **not**
//! named `Workspace`, because `crate::workspace` already owns that name
//! for a different, already-shipped concept (an event-sourced CRM/inbox
//! model: Message/Document/Email/Contact/…, with its own
//! `ActionGovernor`). This module is unrelated to that one; see the
//! architecture report for the naming-collision writeup
//! (https://claude.ai/code/artifact/b755a46b-0615-47d1-bcf2-fbc4d3aa83af,
//! §A/§D).
//!
//! Patterns adopted from the FileManagerTUI research reviewed for that
//! same report, and the patterns deliberately NOT copied from it:
//!
//! - cheap listing (name + is_dir only) separate from expensive per-file
//!   stat, so `refresh()` stays fast on a large tree — matches
//!   FileManagerTUI's `DirSnapshot` split, not its "stat everything up
//!   front" alternative
//! - symlink-loop protection via a real inode identity check on Unix
//!   (device, inode pair), not path-string comparison — same principle
//!   FileManagerTUI used, adapted to this module's own scan loop
//! - `Selection` is its own type, independent of any clipboard — the
//!   FileManagerTUI anti-pattern this report flagged (`SelectionState`
//!   hard-wired into `ClipboardState`) is not repeated here
//! - this module is plain data + pure functions with a `Path` argument,
//!   never a UI type in the signature — FileManagerTUI's own worst part
//!   was an App-state monolith with UI and model fused; nothing here
//!   imports `ratatui` or ties to the TUI's `App`
//!
//! No new crate dependency was added for filesystem watching (`notify` et
//! al. are not in Cargo.toml). `refresh()` is poll-based: a caller calls
//! it on whatever interval it chooses and gets a real diff summary,
//! including flood protection (`RefreshOutcome::flood`) for a change set
//! too large to show item-by-item. This is a real, documented tradeoff,
//! not a hidden one — OS-native filesystem events would need a vetted
//! dependency, which is out of scope for this increment (see
//! `44-supply-chain-vetting.md` / `dependency-vetting-law.md`: adding one
//! requires its own evidence-and-human-confirmation gate, not something
//! to fold into an unrelated capability change).

use std::collections::{HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Same skip-list `capability::repo`'s tree/search functions already use
/// — one convention, not a second independently-chosen list.
const DEFAULT_IGNORE: &[&str] = &[".git", "target", "node_modules", ".venv", "__pycache__"];

/// Flood-protection threshold (FileManagerTUI's own watcher collapses
/// >100 events in a window into one full refresh; this module reuses that
/// number for the same reason — past it, an itemized diff is more noise
/// than signal for a human or an AI caller to review).
const FLOOD_THRESHOLD: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize)]
pub struct TreeEntry {
    /// Repo-relative, forward-slash-separated regardless of platform.
    pub path: String,
    pub is_dir: bool,
}

/// Cheap listing only — `path` + `is_dir`. Expensive per-file metadata
/// (size, mtime) is a separate, on-demand call (`stat_one`), never done
/// during a scan — the split FileManagerTUI's own `DirSnapshot` uses.
fn scan_tree(root: &Path, ignore: &[String]) -> std::io::Result<Vec<TreeEntry>> {
    let mut out = Vec::new();
    let mut visited_dirs: HashSet<(u64, u64)> = HashSet::new();
    scan_dir(root, root, ignore, &mut visited_dirs, &mut out)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn is_ignored(name: &str, ignore: &[String]) -> bool {
    DEFAULT_IGNORE.contains(&name) || ignore.iter().any(|p| p == name)
}

#[cfg(unix)]
fn dir_identity(meta: &fs::Metadata) -> (u64, u64) {
    use std::os::unix::fs::MetadataExt;
    (meta.dev(), meta.ino())
}

#[cfg(not(unix))]
fn dir_identity(_meta: &fs::Metadata) -> (u64, u64) {
    // No stable cross-platform inode identity without a new dependency.
    // Falling back to "never matches" means symlink loops are NOT caught
    // on non-Unix — a real, documented gap, not a silent one. Unix is
    // this project's actual target platform (`cfg!(unix)` gates other
    // capabilities the same way, e.g. `capability::system::process.list`).
    (0, 0)
}

fn scan_dir(
    root: &Path,
    dir: &Path,
    ignore: &[String],
    visited_dirs: &mut HashSet<(u64, u64)>,
    out: &mut Vec<TreeEntry>,
) -> std::io::Result<()> {
    let entries = fs::read_dir(dir)?;
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else { continue };
        if is_ignored(name_str, ignore) {
            continue;
        }
        let path = entry.path();
        let symlink_meta = fs::symlink_metadata(&path)?;
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        if symlink_meta.file_type().is_symlink() {
            // Record the symlink as a leaf entry (its own is_dir per the
            // link's target, best-effort) but never traverse through it —
            // the always-safe fallback on every platform, matching this
            // module's doc comment on `dir_identity`.
            let is_dir = fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false);
            out.push(TreeEntry { path: rel, is_dir });
            continue;
        }

        let is_dir = symlink_meta.is_dir();
        out.push(TreeEntry {
            path: rel,
            is_dir,
        });
        if is_dir {
            let identity = dir_identity(&symlink_meta);
            if identity != (0, 0) && !visited_dirs.insert(identity) {
                // Already visited this exact directory via another path —
                // a real loop (e.g. a bind mount or a hardlinked dir),
                // not merely a similarly-named sibling. Skip recursing.
                continue;
            }
            scan_dir(root, &path, ignore, visited_dirs, out)?;
        }
    }
    Ok(())
}

/// On-demand, expensive metadata for exactly one entry — the counterpart
/// to `scan_tree`'s cheap listing. Never called during a scan.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct FileStat {
    pub size_bytes: u64,
    pub modified_at: Option<String>,
}

pub fn stat_one(root: &Path, relative: &str) -> std::io::Result<FileStat> {
    let meta = fs::metadata(root.join(relative))?;
    let modified_at = meta.modified().ok().and_then(|t| {
        t.duration_since(std::time::UNIX_EPOCH)
            .ok()
            .and_then(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
            .map(|dt| dt.to_rfc3339())
    });
    Ok(FileStat {
        size_bytes: meta.len(),
        modified_at,
    })
}

/// Independent of any clipboard — the FileManagerTUI anti-pattern this
/// module's own doc comment calls out. An agent or UI can select paths
/// for any purpose (batch review, a multi-file operation proposal)
/// without that selection implying "these are queued to copy/cut."
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct Selection(HashSet<String>);

impl Selection {
    pub fn toggle(&mut self, path: &str) {
        if !self.0.remove(path) {
            self.0.insert(path.to_string());
        }
    }
    pub fn add(&mut self, path: &str) {
        self.0.insert(path.to_string());
    }
    pub fn remove(&mut self, path: &str) {
        self.0.remove(path);
    }
    pub fn clear(&mut self) {
        self.0.clear();
    }
    pub fn contains(&self, path: &str) -> bool {
        self.0.contains(path)
    }
    pub fn paths(&self) -> Vec<&str> {
        self.0.iter().map(|s| s.as_str()).collect()
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Outcome of one `refresh()` poll — a real diff, not just "did it
/// change." `flood` mirrors FileManagerTUI's watcher: past
/// `FLOOD_THRESHOLD` combined additions/removals, a caller should treat
/// this as "much of the tree changed, re-render everything" rather than
/// itemizing every entry.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct RefreshOutcome {
    pub version: u64,
    pub changed: bool,
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub flood: bool,
}

/// A project/file-tree workspace, headless — no UI type appears in this
/// struct or any of its methods. `snapshot_version` only advances when
/// `refresh()` observes a real difference from the previous scan, never
/// on every poll unconditionally (a caller polling on a fixed interval
/// with nothing changing sees a stable version).
pub struct ProjectWorkspace {
    pub root_path: PathBuf,
    pub ignore_patterns: Vec<String>,
    pub snapshot_version: u64,
    pub open_files: Vec<String>,
    pub selection: Selection,
    tree: Vec<TreeEntry>,
}

impl ProjectWorkspace {
    pub fn new(root_path: PathBuf, ignore_patterns: Vec<String>) -> Self {
        Self {
            root_path,
            ignore_patterns,
            snapshot_version: 0,
            open_files: Vec::new(),
            selection: Selection::default(),
            tree: Vec::new(),
        }
    }

    pub fn tree(&self) -> &[TreeEntry] {
        &self.tree
    }

    pub fn stat(&self, relative: &str) -> std::io::Result<FileStat> {
        stat_one(&self.root_path, relative)
    }

    /// Rescans `root_path` and diffs against the previous snapshot.
    /// Bumps `snapshot_version` only when the tree actually differs.
    pub fn refresh(&mut self) -> std::io::Result<RefreshOutcome> {
        let fresh = scan_tree(&self.root_path, &self.ignore_patterns)?;
        let old_set: HashSet<&TreeEntry> = self.tree.iter().collect();
        let new_set: HashSet<&TreeEntry> = fresh.iter().collect();
        let added: Vec<String> = new_set
            .difference(&old_set)
            .map(|e| e.path.clone())
            .collect();
        let removed: Vec<String> = old_set
            .difference(&new_set)
            .map(|e| e.path.clone())
            .collect();
        let changed = !added.is_empty() || !removed.is_empty();
        let flood = added.len() + removed.len() > FLOOD_THRESHOLD;
        if changed {
            self.snapshot_version += 1;
            self.tree = fresh;
        }
        Ok(RefreshOutcome {
            version: self.snapshot_version,
            changed,
            added,
            removed,
            flood,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("yana-project-workspace-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn first_refresh_reports_every_entry_as_added_and_bumps_version() {
        let root = tmp_root("first-refresh");
        fs::write(root.join("a.txt"), "1").unwrap();
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("sub/b.txt"), "2").unwrap();

        let mut ws = ProjectWorkspace::new(root.clone(), Vec::new());
        let outcome = ws.refresh().unwrap();
        assert_eq!(outcome.version, 1);
        assert!(outcome.changed);
        assert!(outcome.added.contains(&"a.txt".to_string()));
        assert!(outcome.added.contains(&"sub".to_string()));
        assert!(outcome.added.contains(&"sub/b.txt".to_string()));
        assert!(outcome.removed.is_empty());
        assert!(!outcome.flood);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn refresh_with_no_changes_does_not_bump_version() {
        let root = tmp_root("no-change");
        fs::write(root.join("a.txt"), "1").unwrap();
        let mut ws = ProjectWorkspace::new(root.clone(), Vec::new());
        let first = ws.refresh().unwrap();
        let second = ws.refresh().unwrap();
        assert_eq!(first.version, second.version);
        assert!(!second.changed);
        assert!(second.added.is_empty());
        assert!(second.removed.is_empty());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn refresh_detects_a_real_addition_and_removal() {
        let root = tmp_root("add-remove");
        fs::write(root.join("keep.txt"), "1").unwrap();
        fs::write(root.join("gone.txt"), "1").unwrap();
        let mut ws = ProjectWorkspace::new(root.clone(), Vec::new());
        ws.refresh().unwrap();

        fs::remove_file(root.join("gone.txt")).unwrap();
        fs::write(root.join("new.txt"), "1").unwrap();
        let outcome = ws.refresh().unwrap();
        assert_eq!(outcome.version, 2);
        assert_eq!(outcome.added, vec!["new.txt".to_string()]);
        assert_eq!(outcome.removed, vec!["gone.txt".to_string()]);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn refresh_reports_flood_when_many_entries_change_at_once() {
        let root = tmp_root("flood");
        let mut ws = ProjectWorkspace::new(root.clone(), Vec::new());
        ws.refresh().unwrap(); // empty baseline
        for i in 0..(FLOOD_THRESHOLD + 5) {
            fs::write(root.join(format!("f{i}.txt")), "x").unwrap();
        }
        let outcome = ws.refresh().unwrap();
        assert!(outcome.flood, "expected flood when {} entries were added", FLOOD_THRESHOLD + 5);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn default_ignore_list_is_applied() {
        let root = tmp_root("ignore");
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git/config"), "x").unwrap();
        fs::write(root.join("real.txt"), "1").unwrap();
        let mut ws = ProjectWorkspace::new(root.clone(), Vec::new());
        let outcome = ws.refresh().unwrap();
        assert!(!outcome.added.iter().any(|p| p.starts_with(".git")));
        assert!(outcome.added.contains(&"real.txt".to_string()));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn extra_ignore_pattern_is_respected() {
        let root = tmp_root("extra-ignore");
        fs::create_dir(root.join("dist")).unwrap();
        fs::write(root.join("dist/bundle.js"), "x").unwrap();
        fs::write(root.join("real.txt"), "1").unwrap();
        let mut ws = ProjectWorkspace::new(root.clone(), vec!["dist".to_string()]);
        let outcome = ws.refresh().unwrap();
        assert!(!outcome.added.iter().any(|p| p.starts_with("dist")));
        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn a_real_directory_symlink_loop_does_not_hang_or_duplicate_entries() {
        use std::os::unix::fs::symlink;
        let root = tmp_root("symlink-loop");
        fs::create_dir(root.join("a")).unwrap();
        // "a/loop" points back at "a" itself — a real cycle.
        symlink(root.join("a"), root.join("a/loop")).unwrap();
        fs::write(root.join("a/real.txt"), "1").unwrap();

        let mut ws = ProjectWorkspace::new(root.clone(), Vec::new());
        let outcome = ws.refresh().unwrap(); // must terminate, not hang
        assert!(outcome.added.contains(&"a/real.txt".to_string()));
        assert!(outcome.added.contains(&"a/loop".to_string()), "the symlink itself is listed as a leaf");
        assert!(
            !outcome.added.contains(&"a/loop/real.txt".to_string()),
            "must not have traversed through the symlink back into a/"
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn stat_one_returns_real_size() {
        let root = tmp_root("stat");
        fs::write(root.join("sized.txt"), "hello").unwrap();
        let stat = stat_one(&root, "sized.txt").unwrap();
        assert_eq!(stat.size_bytes, 5);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn selection_is_independent_of_any_clipboard_concept() {
        let mut sel = Selection::default();
        assert!(sel.is_empty());
        sel.add("a.txt");
        sel.add("b.txt");
        assert_eq!(sel.len(), 2);
        assert!(sel.contains("a.txt"));
        sel.toggle("a.txt");
        assert!(!sel.contains("a.txt"));
        sel.remove("b.txt");
        assert!(sel.is_empty());
    }
}
