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
    use std::os::unix::fs::PermissionsExt;
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    let fake = fx.outer.path().join("slow-git");
    std::fs::write(&fake, "#!/bin/sh\nsleep 30\n").unwrap();
    std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
    let store = CheckpointStore::open_with_git(&fx.root, &fx.project, fake.into_os_string())
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
