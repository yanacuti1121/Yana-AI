//! The pre-write checkpoint is off by default, runs only for an allowed write,
//! never changes what the write returns, and cannot hold it up.

use super::*;
use crate::capability::file_mutation::{apply_file_write_with, FileMutationKind};
use crate::capability::CapabilityError;
use crate::session_db::StateKind;
use std::ffi::OsString;

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("ws");
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("keep.txt"), "before").unwrap();
    (outer, root)
}

fn state(root: &Path) -> StateRoot {
    StateRoot::for_profile(root, &ProfileName::default_profile())
}

fn config() -> HookConfig {
    HookConfig { min_gap: Duration::ZERO, ..HookConfig::default() }
}

fn broken_git() -> HookConfig {
    HookConfig { git: OsString::from("definitely-not-git-xyz"), ..config() }
}

#[test]
fn only_the_value_1_turns_it_on() {
    assert_eq!(ENV_FLAG, "YANA_CHECKPOINTS");
    assert!(flag_on(Some("1")));
    for off in [None, Some(""), Some("0"), Some("true"), Some("11"), Some(" 1")] {
        assert!(!flag_on(off), "{off:?}");
    }
}

#[test]
fn off_creates_nothing_at_all() {
    let (_keep, root) = workspace();
    assert_eq!(before_write(None, &root, "keep.txt", "overwrite"), HookOutcome::Off);
    apply_file_write_with(&root, "keep.txt", FileMutationKind::Overwrite, "after", None, None).unwrap();
    assert!(!state(&root).path(StateKind::Checkpoints).exists(), "no checkpoint directory when off");
}

#[test]
fn on_takes_a_checkpoint_of_the_workspace_as_it_was_before_the_write() {
    let (_keep, root) = workspace();
    apply_file_write_with(&root, "keep.txt", FileMutationKind::Overwrite, "after", None, Some(&config())).unwrap();
    let store = CheckpointStore::open(&state(&root), &root).unwrap();
    let points = store.list().unwrap();
    assert_eq!(points.len(), 1);
    let diff = store.diff(points[0].id).unwrap();
    assert!(diff.contains("-before") && diff.contains("+after"), "the checkpoint holds the old text: {diff}");
    assert_eq!(std::fs::read_to_string(root.join("keep.txt")).unwrap(), "after");
}

#[test]
fn a_refused_write_takes_no_checkpoint() {
    let (_keep, root) = workspace();
    let cases = [("../escape.txt", FileMutationKind::Create), ("keep.txt", FileMutationKind::Create), ("missing.txt", FileMutationKind::Overwrite)];
    for (path, kind) in cases {
        let error = apply_file_write_with(&root, path, kind, "x", None, Some(&config())).unwrap_err();
        assert!(matches!(error, CapabilityError::InvalidInput { .. } | CapabilityError::NotFound { .. } | CapabilityError::PathEscape { .. }), "{path}: {error:?}");
    }
    assert!(!root.join(".yana-ai").exists(), "validation failed before the hook ran, so nothing was created");
}

#[test]
fn the_result_and_the_files_are_the_same_with_and_without_a_checkpoint() {
    let (_a, plain) = workspace();
    let (_b, checked) = workspace();
    let without = apply_file_write_with(&plain, "keep.txt", FileMutationKind::Overwrite, "after", Some("s".into()), None).unwrap();
    let with = apply_file_write_with(&checked, "keep.txt", FileMutationKind::Overwrite, "after", Some("s".into()), Some(&config())).unwrap();
    assert_eq!(without.diff, with.diff);
    assert_eq!(without.evidence.sha256, with.evidence.sha256);
    assert_eq!(without.evidence.byte_count, with.evidence.byte_count);
    let backup = |root: &Path, outcome: &crate::capability::FileMutationOutcome| std::fs::read_to_string(root.join(outcome.backup_path.as_ref().unwrap())).unwrap();
    assert_eq!(backup(&plain, &without), backup(&checked, &with));
    assert_eq!(std::fs::read_to_string(plain.join("keep.txt")).unwrap(), std::fs::read_to_string(checked.join("keep.txt")).unwrap());
}

#[test]
fn many_writes_in_one_turn_cost_one_checkpoint() {
    let (_keep, root) = workspace();
    let turn = HookConfig { min_gap: Duration::from_secs(60), ..HookConfig::default() };
    let first = before_write(Some(&turn), &root, "a", "create");
    let rest: Vec<_> = (0..4).map(|_| before_write(Some(&turn), &root, "b", "create")).collect();
    assert_eq!(first, HookOutcome::Taken);
    assert!(rest.iter().all(|o| *o == HookOutcome::Throttled), "{rest:?}");
}

#[test]
fn another_spelling_of_the_same_workspace_shares_the_throttle() {
    let (_keep, root) = workspace();
    let turn = HookConfig { min_gap: Duration::from_secs(60), ..HookConfig::default() };
    assert_eq!(before_write(Some(&turn), &root, "a", "create"), HookOutcome::Taken);
    let dotted = root.join("..").join("ws");
    assert_eq!(before_write(Some(&turn), &dotted, "a", "create"), HookOutcome::Throttled);
}

#[test]
fn without_git_the_write_still_completes_with_the_right_content() {
    let (_keep, root) = workspace();
    let outcome = apply_file_write_with(&root, "keep.txt", FileMutationKind::Overwrite, "after", None, Some(&broken_git()));
    assert!(outcome.is_ok(), "{outcome:?}");
    assert_eq!(std::fs::read_to_string(root.join("keep.txt")).unwrap(), "after");
}

#[test]
fn a_checkpoint_that_runs_out_of_time_lets_the_write_through_and_backs_off() {
    let (_keep, root) = workspace();
    let instant_limit = HookConfig { time_limit: Duration::ZERO, ..config() };
    assert_eq!(before_write(Some(&instant_limit), &root, "a", "create"), HookOutcome::Failed);
    let outcome = apply_file_write_with(&root, "keep.txt", FileMutationKind::Overwrite, "after", None, Some(&instant_limit));
    assert!(outcome.is_ok(), "{outcome:?}");
    assert_eq!(std::fs::read_to_string(root.join("keep.txt")).unwrap(), "after");
    assert_eq!(before_write(Some(&config()), &root, "a", "create"), HookOutcome::Throttled, "a failure backs the workspace off");
}

#[test]
fn the_label_names_the_file_and_the_reason_and_nothing_else() {
    assert_eq!(label("overwrite", "src/main.rs"), "before overwrite: src/main.rs");
    let long = label("create", &"a".repeat(500));
    assert!(long.chars().count() <= "before create: ".len() + LABEL_PATH_CHARS);
    let (_keep, root) = workspace();
    let secret = "SECRET-TOKEN-abc123";
    apply_file_write_with(&root, "keep.txt", FileMutationKind::Overwrite, secret, None, Some(&config())).unwrap();
    let points = CheckpointStore::open(&state(&root), &root).unwrap().list().unwrap();
    assert!(points.iter().all(|p| !p.label.contains(secret)), "file content must not reach a label");
}

/// Measurement, not a check: run with `-- --ignored --nocapture timing_on`.
#[test]
#[ignore]
fn timing_on_a_five_thousand_file_tree() {
    let (_keep, root) = workspace();
    for dir in 0..50 {
        let path = root.join(format!("d{dir}"));
        std::fs::create_dir(&path).unwrap();
        for file in 0..100 {
            std::fs::write(path.join(format!("f{file}.txt")), format!("content {dir} {file}\n").repeat(20)).unwrap();
        }
    }
    let store = CheckpointStore::open(&state(&root), &root).unwrap();
    for (name, change) in [("first (cold)", false), ("unchanged tree", false), ("after one edit", true)] {
        if change {
            std::fs::write(root.join("d0/f0.txt"), "edited").unwrap();
        }
        let started = Instant::now();
        store.snapshot(name).unwrap();
        println!("snapshot {name}: {:?}", started.elapsed());
    }
}
