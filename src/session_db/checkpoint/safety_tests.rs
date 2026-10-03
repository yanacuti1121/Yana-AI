//! Restore safety: paths may not leave the project, links are never followed.

use super::tests::{fixture, put, read};
use super::*;

#[test]
fn hostile_paths_are_rejected_for_a_single_file_restore() {
    let fx = fixture();
    put(&fx.project, "a.txt", "a");
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    for bad in ["../outside.txt", "a/../../outside.txt", "/etc/passwd", "./a.txt", "", "a/./b", "..", "C:\\x"] {
        let result = store.restore(id, RestoreScope::OneFile(PathBuf::from(bad)));
        assert!(matches!(result, Err(CheckpointError::InvalidPath(_))), "{bad:?}: {result:?}");
    }
}

#[test]
fn a_file_that_is_not_in_the_checkpoint_is_reported_not_created() {
    let fx = fixture();
    put(&fx.project, "a.txt", "a");
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    let result = store.restore(id, RestoreScope::OneFile(PathBuf::from("never-there.txt")));
    assert!(matches!(result, Err(CheckpointError::NotFound(_))), "{result:?}");
    assert!(!fx.project.join("never-there.txt").exists());
}

#[cfg(unix)]
#[test]
fn a_directory_replaced_by_a_link_cannot_redirect_a_restore_outside() {
    let fx = fixture();
    put(&fx.project, "d/f.txt", "inside");
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    let outside = fx.outer.path().join("outside");
    std::fs::create_dir(&outside).unwrap();
    std::fs::remove_dir_all(fx.project.join("d")).unwrap();
    std::os::unix::fs::symlink(&outside, fx.project.join("d")).unwrap();
    let single = store.restore(id, RestoreScope::OneFile(PathBuf::from("d/f.txt")));
    assert!(single.is_err(), "{single:?}");
    let whole = store.restore(id, RestoreScope::Whole).unwrap();
    assert!(whole.skipped.iter().any(|(path, _)| path == "d/f.txt"), "{whole:?}");
    assert!(std::fs::read_dir(&outside).unwrap().next().is_none(), "nothing may be written through the link");
}

#[cfg(unix)]
#[test]
fn a_file_replaced_by_a_link_is_not_written_through() {
    let fx = fixture();
    put(&fx.project, "a.txt", "original");
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    let target = fx.outer.path().join("victim.txt");
    std::fs::write(&target, "victim").unwrap();
    std::fs::remove_file(fx.project.join("a.txt")).unwrap();
    std::os::unix::fs::symlink(&target, fx.project.join("a.txt")).unwrap();
    let result = store.restore(id, RestoreScope::OneFile(PathBuf::from("a.txt")));
    assert!(result.is_err(), "{result:?}");
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "victim");
}

#[cfg(unix)]
#[test]
fn links_stored_in_a_checkpoint_are_skipped_on_restore() {
    let fx = fixture();
    put(&fx.project, "real.txt", "r");
    std::os::unix::fs::symlink("real.txt", fx.project.join("ln")).unwrap();
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    std::fs::remove_file(fx.project.join("ln")).unwrap();
    let report = store.restore(id, RestoreScope::Whole).unwrap();
    assert!(report.skipped.iter().any(|(path, why)| path == "ln" && why.contains("link")), "{report:?}");
    assert!(!fx.project.join("ln").exists(), "a link is never recreated");
    assert_eq!(read(&fx.project, "real.txt"), "r");
}

#[test]
fn git_runs_with_inherited_repo_variables_removed_and_config_isolated() {
    let command = git::git_command(std::ffi::OsStr::new("git"), Path::new("/shadow"), Some(Path::new("/proj")));
    let envs: Vec<_> = command.get_envs().collect();
    for var in ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY"] {
        assert!(envs.iter().any(|(k, v)| *k == var && v.is_none()), "{var} must be removed");
    }
    assert!(envs.iter().any(|(k, v)| *k == "GIT_CONFIG_GLOBAL" && v.is_some()));
    assert!(envs.iter().any(|(k, v)| *k == "GIT_CONFIG_NOSYSTEM" && v.is_some()));
    let args: Vec<String> = command.get_args().map(|a| a.to_string_lossy().to_string()).collect();
    assert!(args.windows(2).any(|w| w[0] == "--git-dir" && w[1] == "/shadow"));
    assert!(args.windows(2).any(|w| w[0] == "--work-tree" && w[1] == "/proj"));
    assert!(args.iter().any(|a| a == "core.hooksPath=/dev/null" || a == "core.hooksPath=NUL"));
}

#[test]
fn no_destructive_git_verbs_appear_in_the_checkpoint_sources() {
    let sources = [
        include_str!("../checkpoint.rs"),
        include_str!("git.rs"),
        include_str!("limit.rs"),
        include_str!("shadow.rs"),
        include_str!("restore.rs"),
    ];
    for text in sources {
        let code = text.split("#[cfg(test)]").next().unwrap();
        for verb in ["\"reset\"", "\"clean\"", "\"checkout\"", "\"restore\"", "\"rm\"", "\"stash\"", "\"push\"", "\"fetch\"", "\"clone\""] {
            assert!(!code.contains(verb), "{verb} must not be used by checkpoints");
        }
    }
}
