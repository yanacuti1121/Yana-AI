//! Behavior tests for the file watcher: the snapshot and diff logic on temp
//! directories, and the runner's exit after `max_changes`. The runner test keeps
//! changing a file until the runner returns (a single write could race the
//! runner's first snapshot) and gives up after a deadline instead of hanging.

use super::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use tempfile::tempdir;

const RUNNER_DEADLINE_SECS: u64 = 20;
const WRITE_EVERY_MS: u64 = 150;

fn write(dir: &Path, rel: &str, body: &str) {
    let p = dir.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, body).unwrap();
}

fn kinds(changes: &[Change]) -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = changes
        .iter()
        .map(|c| (c.kind.trim().to_string(), c.path.file_name().unwrap().to_string_lossy().into_owned()))
        .collect();
    v.sort();
    v
}

// ── walk / snapshot ──────────────────────────────────────────────────────────

#[test]
fn walk_lists_files_recursively_and_skips_directories() {
    let d = tempdir().unwrap();
    write(d.path(), "a.txt", "1");
    write(d.path(), "sub/deeper/b.txt", "2");
    let mut names: Vec<String> = walk(d.path()).unwrap().iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    names.sort();
    assert_eq!(names, vec!["a.txt", "b.txt"]);
}

#[test]
fn a_missing_directory_or_a_file_snapshots_as_empty() {
    let d = tempdir().unwrap();
    assert!(walk(&d.path().join("nope")).unwrap().is_empty());
    write(d.path(), "f.txt", "x");
    assert!(snapshot_dir(&d.path().join("f.txt")).is_empty());
    assert!(snapshot_dir(&d.path().join("nope")).is_empty());
}

#[test]
fn a_snapshot_records_the_size_of_each_file() {
    let d = tempdir().unwrap();
    write(d.path(), "a.txt", "12345");
    let snap = snapshot_dir(d.path());
    assert_eq!(snap.values().map(|e| e.size).collect::<Vec<_>>(), vec![5]);
}

// ── diff ─────────────────────────────────────────────────────────────────────

#[test]
fn diff_reports_added_changed_and_removed_files_and_ignores_the_unchanged() {
    let d = tempdir().unwrap();
    write(d.path(), "keep.txt", "same");
    write(d.path(), "edit.txt", "v1");
    write(d.path(), "gone.txt", "bye");
    let before = snapshot_dir(d.path());
    write(d.path(), "edit.txt", "version two");
    write(d.path(), "new.txt", "hi");
    fs::remove_file(d.path().join("gone.txt")).unwrap();
    let after = snapshot_dir(d.path());
    assert_eq!(
        kinds(&diff(&before, &after)),
        vec![("added".into(), "new.txt".into()), ("changed".into(), "edit.txt".into()), ("removed".into(), "gone.txt".into())]
    );
}

#[test]
fn identical_snapshots_have_no_changes() {
    let d = tempdir().unwrap();
    write(d.path(), "a.txt", "x");
    let s = snapshot_dir(d.path());
    assert!(diff(&s, &s.clone()).is_empty());
}

#[test]
fn a_same_size_edit_is_still_seen_when_the_modification_time_moves() {
    let mut prev = Snapshot::new();
    let mut curr = Snapshot::new();
    let path = PathBuf::from("f.txt");
    prev.insert(path.clone(), FileEntry { modified: SystemTime::UNIX_EPOCH, size: 4 });
    curr.insert(path, FileEntry { modified: SystemTime::UNIX_EPOCH + Duration::from_secs(5), size: 4 });
    assert_eq!(kinds(&diff(&prev, &curr)), vec![("changed".to_string(), "f.txt".to_string())]);
}

#[test]
fn a_size_change_is_seen_even_when_the_modification_time_is_identical() {
    let mut prev = Snapshot::new();
    let mut curr = Snapshot::new();
    let path = PathBuf::from("f.txt");
    prev.insert(path.clone(), FileEntry { modified: SystemTime::UNIX_EPOCH, size: 4 });
    curr.insert(path, FileEntry { modified: SystemTime::UNIX_EPOCH, size: 5 });
    assert_eq!(kinds(&diff(&prev, &curr)), vec![("changed".to_string(), "f.txt".to_string())]);
}

// ── missing directories ──────────────────────────────────────────────────────

#[test]
fn only_directories_that_do_not_exist_are_reported_missing() {
    let d = tempdir().unwrap();
    write(d.path(), "real/x.txt", "x");
    let dirs = vec![d.path().join("real"), d.path().join("typo"), d.path().join("real/x.txt")];
    let missing: Vec<&PathBuf> = missing_dirs(&dirs);
    assert_eq!(missing.len(), 2);
    assert!(missing.iter().any(|p| p.ends_with("typo")) && missing.iter().any(|p| p.ends_with("x.txt")));
}

// ── runner ───────────────────────────────────────────────────────────────────

#[test]
fn the_runner_exits_once_max_changes_is_reached_and_would_not_without_a_change() {
    let d = tempdir().unwrap();
    let dir_arg = d.path().to_str().unwrap().to_string();
    let stop = Arc::new(AtomicBool::new(false));
    let writer_stop = stop.clone();
    let target = d.path().join("trigger.txt");
    let writer = thread::spawn(move || {
        let mut n = 0u32;
        while !writer_stop.load(Ordering::SeqCst) {
            n += 1;
            fs::write(&target, "x".repeat(n as usize)).ok();
            thread::sleep(Duration::from_millis(WRITE_EVERY_MS));
        }
    });
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        run(dir_arg, 1, 1);
        tx.send(()).ok();
    });
    let finished = rx.recv_timeout(Duration::from_secs(RUNNER_DEADLINE_SECS)).is_ok();
    stop.store(true, Ordering::SeqCst);
    writer.join().unwrap();
    assert!(finished, "run(max_changes = 1) did not return although files kept changing");
}
