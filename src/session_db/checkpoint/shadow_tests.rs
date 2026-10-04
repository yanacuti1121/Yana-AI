//! The shadow repository sits inside the workspace, so anything planted in it
//! must not change what git runs or what gets captured.

use super::tests::{fixture, put};
use super::*;
use std::time::{Duration, SystemTime};

fn shadow_dir(fx: &super::tests::Fixture) -> PathBuf {
    std::fs::read_dir(fx.root.path(StateKind::Checkpoints)).unwrap().next().unwrap().unwrap().path()
}

#[cfg(unix)]
#[test]
fn a_planted_filter_in_the_shadow_config_never_runs() {
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    let store = fx.store();
    store.snapshot("first").unwrap();
    let marker = fx.outer.path().join("filter-ran");
    let config = shadow_dir(&fx).join("config");
    let mut text = std::fs::read_to_string(&config).unwrap();
    text.push_str(&format!("[filter \"x\"]\n\tclean = touch {}\n", marker.display()));
    std::fs::write(&config, text).unwrap();
    put(&fx.project, ".gitattributes", "* filter=x\n");
    put(&fx.project, "b.txt", "two");
    store.snapshot("second").unwrap();
    assert!(!marker.exists(), "the filter command must not have run");
    assert!(!std::fs::read_to_string(&config).unwrap().contains("filter"), "the config was restored");
}

#[test]
fn a_longer_exclude_list_reaches_a_shadow_made_by_an_older_version() {
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    let store = fx.store();
    store.snapshot("first").unwrap();
    std::fs::write(shadow_dir(&fx).join("info").join("exclude"), ".git\n").unwrap();
    for name in [".envrc", ".git-credentials", ".pgpass", "state.tfstate", "key.jks"] {
        put(&fx.project, name, "sensitive");
    }
    let id = store.snapshot("second").unwrap();
    let files = store.files(id).unwrap();
    assert_eq!(files, vec!["a.txt"], "only the ordinary file is captured: {files:?}");
}

#[test]
fn a_lock_that_is_not_ours_is_left_alone_after_a_timeout() {
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    fx.store().snapshot("first").unwrap();
    let lock = shadow_dir(&fx).join("index.lock");
    let file = std::fs::File::create(&lock).unwrap();
    file.set_modified(SystemTime::now() - Duration::from_secs(3600)).unwrap();
    let store = fx.store().with_time_limit(Duration::ZERO);
    assert_eq!(store.snapshot("x").unwrap_err(), CheckpointError::TimedOut);
    assert!(lock.exists(), "a lock older than this snapshot belongs to someone else");
}
