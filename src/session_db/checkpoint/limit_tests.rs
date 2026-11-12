//! The snapshot time limit: a stuck git is stopped, and a normal one is unaffected.

use super::tests::{fixture, put};
use super::*;
use std::time::{Duration, Instant};

#[test]
fn a_limit_that_is_not_reached_changes_nothing() {
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    let store = fx.store().with_time_limit(Duration::from_secs(60));
    let id = store.snapshot("first").unwrap();
    assert_eq!(store.list().unwrap().len(), 1);
    assert_eq!(store.snapshot("again").unwrap(), id, "unchanged project: no duplicate, same as without a limit");
}

#[cfg(unix)]
#[test]
fn a_stuck_git_is_stopped_at_the_limit_and_reported() {
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    // The fake git runs as `/bin/sh slow-git.sh`, never as an executable file of its own: exec of a
    // file that was just written fails with ETXTBSY ("Text file busy") whenever another test thread
    // forks while this thread still holds the file open for writing (measured: 3-6% of execs under
    // load; writing to a temporary name and renaming does not help). `sh` only reads the script.
    let script = fx.outer.path().join("slow-git.sh");
    std::fs::write(&script, "#!/bin/sh\nsleep 30\n").unwrap();
    let store = CheckpointStore::open_with_git_command(&fx.root, &fx.project, "/bin/sh".into(), vec![script.into_os_string()])
        .unwrap()
        .with_time_limit(Duration::from_millis(300));
    let started = Instant::now();
    assert_eq!(store.snapshot("x").unwrap_err(), CheckpointError::TimedOut);
    assert!(started.elapsed() < Duration::from_secs(5), "returned after {:?}", started.elapsed());
}

#[test]
fn a_timed_out_snapshot_does_not_block_the_next_one() {
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    let slow = fx.store().with_time_limit(Duration::ZERO);
    assert_eq!(slow.snapshot("x").unwrap_err(), CheckpointError::TimedOut);
    let fine = fx.store();
    assert!(fine.snapshot("y").is_ok(), "a later snapshot works after a stopped one");
}

#[test]
fn a_stopped_snapshot_leaves_the_users_own_git_repository_untouched_and_no_lock_behind() {
    use super::tests::{fingerprint, setup_git};
    let fx = fixture();
    put(&fx.project, "tracked.txt", "v1");
    setup_git(&fx.project, &["init", "--quiet"]);
    setup_git(&fx.project, &["add", "tracked.txt"]);
    setup_git(&fx.project, &["commit", "--quiet", "-m", "init"]);
    let dot_git = fx.project.join(".git");
    let before = fingerprint(&dot_git);
    put(&fx.project, "new.txt", "n");
    let stopped = fx.store().with_time_limit(Duration::ZERO);
    assert_eq!(stopped.snapshot("x").unwrap_err(), CheckpointError::TimedOut);
    assert_eq!(fingerprint(&dot_git), before, "the project's .git is byte-for-byte what it was");
    assert!(fx.store().snapshot("after").is_ok(), "and the next snapshot works, so no lock was left behind");
}
