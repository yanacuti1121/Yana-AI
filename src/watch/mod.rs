use clap::Subcommand;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime};

#[derive(Subcommand)]
pub enum WatchAction {
    /// Watch skills/, agents/, rules/ for changes (default: all)
    Start {
        /// Comma-separated dirs to watch relative to repo root
        /// e.g. "core/skills,core/agents"
        #[arg(long, default_value = "core/skills,core/agents,core/rules")]
        dirs: String,

        /// Poll interval in seconds
        #[arg(long, default_value_t = 2)]
        interval: u64,

        /// Exit after N changes (0 = run forever)
        #[arg(long, default_value_t = 0)]
        max_changes: u32,
    },
}

pub fn dispatch(action: WatchAction) {
    match action {
        WatchAction::Start { dirs, interval, max_changes } => run(dirs, interval, max_changes),
    }
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
struct FileEntry {
    modified: SystemTime,
    size: u64,
}

type Snapshot = HashMap<PathBuf, FileEntry>;

fn snapshot_dir(root: &Path) -> Snapshot {
    let mut map = Snapshot::new();
    if let Ok(entries) = walk(root) {
        for path in entries {
            if let Ok(meta) = fs::metadata(&path) {
                let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                map.insert(path, FileEntry { modified, size: meta.len() });
            }
        }
    }
    map
}

fn walk(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    if !dir.is_dir() {
        return Ok(out);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            out.extend(walk(&path)?);
        } else {
            out.push(path);
        }
    }
    Ok(out)
}

// ── Diff ──────────────────────────────────────────────────────────────────────

struct Change {
    kind: &'static str,
    path: PathBuf,
}

fn diff(prev: &Snapshot, curr: &Snapshot) -> Vec<Change> {
    let mut changes = Vec::new();

    for (path, entry) in curr {
        match prev.get(path) {
            None => changes.push(Change { kind: "added  ", path: path.clone() }),
            Some(old) if old.modified != entry.modified || old.size != entry.size => {
                changes.push(Change { kind: "changed", path: path.clone() })
            }
            _ => {}
        }
    }
    for path in prev.keys() {
        if !curr.contains_key(path) {
            changes.push(Change { kind: "removed", path: path.clone() });
        }
    }
    changes
}

// ── Runner ────────────────────────────────────────────────────────────────────

fn run(dirs_arg: String, interval: u64, max_changes: u32) {
    let watch_dirs: Vec<PathBuf> = dirs_arg
        .split(',')
        .map(|s| PathBuf::from(s.trim()))
        .collect();

    println!("[watch] monitoring: {}", dirs_arg);
    println!("[watch] interval: {}s  |  Ctrl+C to stop", interval);
    println!("{}", "─".repeat(56));

    let mut snapshots: HashMap<PathBuf, Snapshot> = watch_dirs
        .iter()
        .map(|d| (d.clone(), snapshot_dir(d)))
        .collect();

    let mut total_changes: u32 = 0;

    loop {
        thread::sleep(Duration::from_secs(interval));

        let now = chrono::Local::now().format("%H:%M:%S");
        let mut any = false;

        for dir in &watch_dirs {
            let curr = snapshot_dir(dir);
            let prev = snapshots.get(dir).cloned().unwrap_or_default();
            let changes = diff(&prev, &curr);

            for ch in &changes {
                println!("[{}] {} {}", now, ch.kind, ch.path.display());
                any = true;
                total_changes += 1;
            }

            snapshots.insert(dir.clone(), curr);
        }

        if !any {
            // silent tick — no output
        }

        if max_changes > 0 && total_changes >= max_changes {
            println!("[watch] reached max_changes={} — exiting", max_changes);
            break;
        }
    }
}
