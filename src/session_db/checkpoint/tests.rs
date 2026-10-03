//! Checkpoint tests that use the real `git` binary in temporary directories.
//! The user's own repository is never touched; one test proves it.

use super::*;
use crate::session_db::ProfileName;
use std::ffi::OsString;
use std::process::Command;

pub(super) struct Fixture {
    pub outer: tempfile::TempDir,
    pub project: PathBuf,
    pub root: StateRoot,
}

pub(super) fn fixture() -> Fixture {
    let outer = tempfile::tempdir().unwrap();
    let project = outer.path().join("proj");
    std::fs::create_dir(&project).unwrap();
    let root = StateRoot::for_profile(&project, &ProfileName::default_profile());
    Fixture { outer, project, root }
}

pub(super) fn put(project: &Path, rel: &str, content: &str) {
    let path = project.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, content).unwrap();
}

pub(super) fn read(project: &Path, rel: &str) -> String {
    std::fs::read_to_string(project.join(rel)).unwrap()
}

impl Fixture {
    pub fn store(&self) -> CheckpointStore {
        CheckpointStore::open(&self.root, &self.project).unwrap()
    }
}

/// A plain git command for test setup, isolated from any user configuration.
pub(super) fn setup_git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(dir)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        // gc.auto and maintenance.auto off: after a commit git may start a detached maintenance
        // run that rewrites files under .git, which races with the before/after comparison.
        .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false"])
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "{args:?}: {}", String::from_utf8_lossy(&output.stderr));
}

/// Every file under `.git` with its bytes, for before/after comparison.
pub(super) fn fingerprint(dot_git: &Path) -> Vec<(String, Vec<u8>)> {
    let mut found = Vec::new();
    let mut stack = vec![dot_git.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                stack.push(path);
            } else {
                let name = path.strip_prefix(dot_git).unwrap().to_string_lossy().to_string();
                found.push((name, std::fs::read(&path).unwrap()));
            }
        }
    }
    found.sort();
    found
}

#[test]
fn snapshot_lists_and_does_not_duplicate_an_unchanged_project() {
    let fx = fixture();
    put(&fx.project, "a.txt", "one");
    let store = fx.store();
    assert!(store.list().unwrap().is_empty());
    let first = store.snapshot("first").unwrap();
    assert_eq!(store.snapshot("again, nothing changed").unwrap(), first);
    put(&fx.project, "a.txt", "two");
    let second = store.snapshot("second").unwrap();
    assert_ne!(first, second);
    let listed = store.list().unwrap();
    assert_eq!(listed.iter().map(|c| c.label.as_str()).collect::<Vec<_>>(), vec!["first", "second"]);
    assert_eq!(listed[0].id, first);
}

#[test]
fn secrets_state_and_build_output_are_never_captured() {
    let fx = fixture();
    put(&fx.project, "src/main.rs", "fn main() {}");
    for rel in [".env", ".env.production", "server.pem", "id_rsa", "key.p12", ".ssh/config", ".aws/credentials", "node_modules/x/index.js", "target/debug/out", ".yana-ai/note.txt"] {
        put(&fx.project, rel, "sensitive-or-generated");
    }
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    assert_eq!(store.files(id).unwrap(), vec!["src/main.rs"]);
}

#[test]
fn credential_files_the_doctor_warns_about_and_other_common_ones_are_excluded() {
    let fx = fixture();
    put(&fx.project, "src/main.rs", "fn main() {}");
    let secret_paths = [
        "credentials.json",
        "config/credentials.json",
        "token.json",
        "app/token.json",
        "prod.env",
        "deploy/staging.env",
        ".pypirc",
        ".kube/config",
        ".gnupg/pubring.kbx",
        ".docker/config.json",
        "id_ecdsa",
        "id_dsa",
        "keys/id_ecdsa",
    ];
    for rel in secret_paths {
        put(&fx.project, rel, "sensitive");
    }
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    assert_eq!(store.files(id).unwrap(), vec!["src/main.rs"]);
}

#[test]
fn ordinary_source_files_with_secret_sounding_names_are_still_captured() {
    let fx = fixture();
    let ordinary = [
        "src/token_budget.rs",
        "src/credentials_store.rs",
        "docs/credentials-guide.md",
        "src/environment.rs",
        "src/keys.rs",
        "config/settings.json",
        "notes/pem-format.txt",
    ];
    for rel in ordinary {
        put(&fx.project, rel, "code");
    }
    let store = fx.store();
    let id = store.snapshot("s").unwrap();
    let mut captured = store.files(id).unwrap();
    captured.sort();
    let mut expected: Vec<String> = ordinary.iter().map(|s| s.to_string()).collect();
    expected.sort();
    assert_eq!(captured, expected, "the exclude list must not swallow ordinary files");
}

#[test]
fn the_users_own_git_repository_is_left_byte_for_byte_alone() {
    let fx = fixture();
    put(&fx.project, "tracked.txt", "v1");
    setup_git(&fx.project, &["init", "--quiet"]);
    setup_git(&fx.project, &["add", "tracked.txt"]);
    setup_git(&fx.project, &["commit", "--quiet", "-m", "init"]);
    let dot_git = fx.project.join(".git");
    let before = fingerprint(&dot_git);
    let store = fx.store();
    store.snapshot("s").unwrap();
    put(&fx.project, "tracked.txt", "v2");
    put(&fx.project, "new.txt", "n");
    store.snapshot("s2").unwrap();
    store.diff(store.list().unwrap()[0].id).unwrap();
    store.restore(store.list().unwrap()[0].id, RestoreScope::Whole).unwrap();
    store.prune(PrunePolicy { max_points: 1, ..PrunePolicy::default() }).unwrap();
    assert_eq!(fingerprint(&dot_git), before, "the project's .git must not change");
    assert!(!store.files(store.list().unwrap()[0].id).unwrap().iter().any(|f| f.starts_with(".git/")));
}

#[test]
fn restoring_one_file_brings_it_back_and_leaves_other_edits_alone() {
    let fx = fixture();
    put(&fx.project, "a.txt", "original a");
    put(&fx.project, "b.txt", "original b");
    let store = fx.store();
    let id = store.snapshot("base").unwrap();
    put(&fx.project, "a.txt", "changed a");
    put(&fx.project, "b.txt", "changed b");
    let report = store.restore(id, RestoreScope::OneFile(PathBuf::from("a.txt"))).unwrap();
    assert_eq!(read(&fx.project, "a.txt"), "original a");
    assert_eq!(read(&fx.project, "b.txt"), "changed b");
    assert_eq!(report.restored, vec!["a.txt"]);
    let safety = report.safety_checkpoint.expect("a restore takes a safety checkpoint first");
    assert_eq!(store.list().unwrap().last().unwrap().id, safety);
    // The restore itself can be undone: the safety checkpoint still has the edited file.
    store.restore(safety, RestoreScope::OneFile(PathBuf::from("a.txt"))).unwrap();
    assert_eq!(read(&fx.project, "a.txt"), "changed a");
}

#[test]
fn whole_restore_puts_back_edits_and_deletions_but_keeps_new_files() {
    let fx = fixture();
    put(&fx.project, "keep.txt", "k");
    put(&fx.project, "dir/gone.txt", "g");
    let store = fx.store();
    let id = store.snapshot("base").unwrap();
    put(&fx.project, "keep.txt", "edited");
    std::fs::remove_file(fx.project.join("dir/gone.txt")).unwrap();
    put(&fx.project, "created-later.txt", "new");
    let report = store.restore(id, RestoreScope::Whole).unwrap();
    assert_eq!(read(&fx.project, "keep.txt"), "k");
    assert_eq!(read(&fx.project, "dir/gone.txt"), "g");
    assert_eq!(read(&fx.project, "created-later.txt"), "new", "restore never deletes");
    assert_eq!(report.restored.len(), 2);
}

#[cfg(unix)]
#[test]
fn executable_bit_survives_a_restore() {
    use std::os::unix::fs::PermissionsExt;
    let fx = fixture();
    put(&fx.project, "run.sh", "#!/bin/sh\n");
    std::fs::set_permissions(fx.project.join("run.sh"), std::fs::Permissions::from_mode(0o755)).unwrap();
    let store = fx.store();
    let id = store.snapshot("x").unwrap();
    std::fs::write(fx.project.join("run.sh"), "changed").unwrap();
    std::fs::set_permissions(fx.project.join("run.sh"), std::fs::Permissions::from_mode(0o644)).unwrap();
    store.restore(id, RestoreScope::OneFile(PathBuf::from("run.sh"))).unwrap();
    let mode = std::fs::metadata(fx.project.join("run.sh")).unwrap().permissions().mode();
    assert_eq!(mode & 0o111, 0o111);
}

#[test]
fn diff_shows_edits_new_files_and_is_bounded() {
    let fx = fixture();
    put(&fx.project, "a.txt", "old line\n");
    let store = fx.store();
    let id = store.snapshot("base").unwrap();
    put(&fx.project, "a.txt", "new line\n");
    put(&fx.project, "b.txt", "brand new\n");
    let diff = store.diff(id).unwrap();
    assert!(diff.contains("+new line") && diff.contains("-old line") && diff.contains("b.txt"), "{diff}");
    put(&fx.project, "huge.txt", &"x\n".repeat(2_000_000));
    assert!(store.diff(id).unwrap().len() <= MAX_DIFF_BYTES + 200);
}

#[test]
fn prune_keeps_the_newest_points_and_the_store_still_works() {
    let fx = fixture();
    let store = fx.store();
    let mut ids = Vec::new();
    for n in 0..5 {
        put(&fx.project, "a.txt", &format!("version {n}"));
        ids.push(store.snapshot(&format!("v{n}")).unwrap());
    }
    let report = store.prune(PrunePolicy { max_points: 3, ..PrunePolicy::default() }).unwrap();
    assert_eq!((report.removed, report.kept), (2, 3));
    let left: Vec<_> = store.list().unwrap().iter().map(|c| c.id).collect();
    assert_eq!(left, ids[2..].to_vec());
    put(&fx.project, "a.txt", "after prune");
    store.snapshot("still works").unwrap();
}

#[test]
fn a_size_cap_removes_the_oldest_points_but_never_the_last_one() {
    let fx = fixture();
    let store = fx.store();
    for n in 0..3 {
        put(&fx.project, "blob.bin", &format!("{n}{}", "z".repeat(50_000)));
        store.snapshot("v").unwrap();
    }
    let report = store.prune(PrunePolicy { max_points: 50, max_bytes: 1 }).unwrap();
    assert_eq!(report.kept, 1);
    assert_eq!(store.list().unwrap().len(), 1);
}

#[test]
fn a_missing_git_binary_is_reported_not_a_panic() {
    let fx = fixture();
    let missing = CheckpointStore::open_with_git(&fx.root, &fx.project, OsString::from("definitely-not-a-git-binary-xyz"));
    let store = missing.unwrap();
    assert_eq!(store.snapshot("x").unwrap_err(), CheckpointError::GitMissing);
    assert_eq!(store.list().unwrap_err(), CheckpointError::GitMissing);
}

#[test]
fn two_profiles_keep_separate_checkpoints_of_the_same_project() {
    let fx = fixture();
    put(&fx.project, "a.txt", "x");
    let alpha = StateRoot::for_profile(&fx.project, &ProfileName::new("alpha").unwrap());
    let beta = StateRoot::for_profile(&fx.project, &ProfileName::new("beta").unwrap());
    let a = CheckpointStore::open(&alpha, &fx.project).unwrap();
    let b = CheckpointStore::open(&beta, &fx.project).unwrap();
    a.snapshot("alpha only").unwrap();
    assert_eq!(a.list().unwrap().len(), 1);
    assert!(b.list().unwrap().is_empty());
    let top: Vec<_> = std::fs::read_dir(fx.outer.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(top, vec![OsString::from("proj")], "nothing outside the project");
}

#[test]
fn a_project_root_that_is_the_filesystem_root_is_refused() {
    let fx = fixture();
    let refused = CheckpointStore::open(&fx.root, Path::new("/"));
    assert!(matches!(refused, Err(CheckpointError::InvalidProject(_))), "{:?}", refused.err());
}
