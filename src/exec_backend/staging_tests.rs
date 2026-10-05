//! Tests for the private copy and the copy back (WS6 E1b). Real files in temporary
//! directories, no Docker; the "container" is a function that edits the copy.

use super::docker_mounts::check_root;
use super::staging::{excluded, Staging, StagingLimits};
use super::staging_sync::sync_back;
use std::path::{Path, PathBuf};

struct Project {
    _outer: tempfile::TempDir,
    root: PathBuf,
    base: PathBuf,
}

fn project() -> Project {
    let outer = tempfile::tempdir().unwrap();
    let base = outer.path().canonicalize().unwrap();
    let root = base.join("project");
    let scratch = base.join("scratch");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&scratch).unwrap();
    Project { _outer: outer, root, base: scratch }
}

fn put(root: &Path, relative: &str, text: &str) {
    let path = root.join(relative);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn text(root: &Path, relative: &str) -> String {
    std::fs::read_to_string(root.join(relative)).unwrap()
}

fn stage(p: &Project) -> Staging {
    Staging::copy_in(&p.root, &p.base, StagingLimits::default()).unwrap()
}

#[test]
fn the_copy_has_the_project_without_what_a_command_must_not_see() {
    let p = project();
    put(&p.root, "src/main.rs", "fn main() {}");
    put(&p.root, "README.md", "hi");
    put(&p.root, ".env", "SECRET=1");
    put(&p.root, "config/prod/id_rsa", "key");
    put(&p.root, "deploy/cert.pem", "pem");
    put(&p.root, ".git/config", "[core]");
    put(&p.root, ".yana-ai/leases.json", "{}");
    put(&p.root, "node_modules/x/index.js", "vendored");
    put(&p.root, "tokenizer.rs", "source, not a secret");
    let staging = stage(&p);
    for kept in ["src/main.rs", "README.md", "tokenizer.rs"] {
        assert!(staging.dir.join(kept).is_file(), "{kept}");
    }
    for left_out in [".env", "config/prod/id_rsa", "deploy/cert.pem", ".git", ".yana-ai", "node_modules"] {
        assert!(!staging.dir.join(left_out).exists(), "{left_out} must not be in the copy");
    }
    assert!(staging.left_out.iter().any(|n| n.contains(".env (secret-looking name)")), "{:?}", staging.left_out);
    assert_eq!(text(&staging.dir, "src/main.rs"), "fn main() {}");
}

#[cfg(unix)]
#[test]
fn links_and_special_files_are_not_copied_and_modes_lose_setuid() {
    use std::os::unix::fs::PermissionsExt;
    let p = project();
    let outside = tempfile::tempdir().unwrap();
    put(outside.path(), "host-secret.txt", "outside");
    std::os::unix::fs::symlink(outside.path().join("host-secret.txt"), p.root.join("link.txt")).unwrap();
    std::os::unix::fs::symlink(outside.path(), p.root.join("linked-dir")).unwrap();
    put(&p.root, "run.sh", "#!/bin/sh\n");
    std::fs::set_permissions(p.root.join("run.sh"), std::fs::Permissions::from_mode(0o4755)).unwrap();
    let fifo = std::ffi::CString::new(p.root.join("pipe").to_str().unwrap()).unwrap();
    // SAFETY: creates a named pipe at a path inside this test's own directory.
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    let staging = stage(&p);
    assert!(!staging.dir.join("link.txt").exists() && !staging.dir.join("linked-dir").exists() && !staging.dir.join("pipe").exists());
    let mode = std::fs::metadata(staging.dir.join("run.sh")).unwrap().permissions().mode();
    assert_eq!(mode & 0o7000, 0, "no setuid, setgid or sticky bit: {mode:o}");
    assert_eq!(mode & 0o111, 0o111, "the execute bits stay");
    assert!(staging.left_out.iter().any(|n| n.contains("symbolic link")) && staging.left_out.iter().any(|n| n.contains("not a plain file")));
}

#[test]
fn the_copy_is_removed_when_it_is_dropped_and_is_private() {
    let p = project();
    put(&p.root, "a.txt", "a");
    let staging = stage(&p);
    let dir = staging.dir.clone();
    #[cfg(unix)]
    assert_eq!(std::os::unix::fs::PermissionsExt::mode(&std::fs::metadata(&dir).unwrap().permissions()) & 0o777, 0o700);
    assert!(dir.starts_with(&p.base));
    drop(staging);
    assert!(!dir.exists());
}

#[test]
fn a_tree_over_a_limit_is_refused_not_cut() {
    let p = project();
    for n in 0..6 {
        put(&p.root, &format!("f{n}.txt"), "12345");
    }
    let small = |max_files, max_bytes, max_depth| StagingLimits { max_files, max_bytes, max_depth };
    for (limits, what) in [(small(5, 1 << 20, 16), "files"), (small(100, 20, 16), "bytes")] {
        let error = Staging::copy_in(&p.root, &p.base, limits).err().expect(what);
        assert!(error.to_string().contains("more "), "{what}: {error}");
    }
    put(&p.root, "a/b/c/d.txt", "deep");
    assert!(Staging::copy_in(&p.root, &p.base, small(100, 1 << 20, 2)).is_err());
    let leftovers = std::fs::read_dir(&p.base).unwrap().count();
    assert_eq!(leftovers, 0, "a refused copy leaves nothing behind");
}

#[test]
fn changes_come_back_new_changed_and_deleted_files_and_nothing_else() {
    let p = project();
    put(&p.root, "keep.txt", "same");
    put(&p.root, "edit.txt", "before");
    put(&p.root, "gone.txt", "bye");
    let staging = stage(&p);
    put(&staging.dir, "edit.txt", "after");
    put(&staging.dir, "new/dir/made.txt", "made");
    std::fs::remove_file(staging.dir.join("gone.txt")).unwrap();
    let report = sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    assert_eq!((report.written, report.deleted), (2, 1), "{report:?}");
    assert_eq!(text(&p.root, "edit.txt"), "after");
    assert_eq!(text(&p.root, "new/dir/made.txt"), "made");
    assert!(!p.root.join("gone.txt").exists());
    assert_eq!(text(&p.root, "keep.txt"), "same");
    assert!(report.skipped.is_empty(), "{:?}", report.skipped);
}

#[cfg(unix)]
#[test]
fn a_command_cannot_plant_protected_or_secret_files_or_links_on_this_machine() {
    let p = project();
    put(&p.root, "a.txt", "a");
    let staging = stage(&p);
    // What a hostile command would try, all inside its own copy.
    put(&staging.dir, ".git/config", "[core]\nfsmonitor = evil");
    put(&staging.dir, ".git/hooks/pre-commit", "evil");
    put(&staging.dir, ".yana-ai/leases.json", "{}");
    put(&staging.dir, ".env", "planted");
    put(&staging.dir, "deploy/key.pem", "planted");
    put(&staging.dir, "node_modules/x.js", "planted");
    std::os::unix::fs::symlink("/etc/passwd", staging.dir.join("passwd-link")).unwrap();
    std::os::unix::fs::symlink("/tmp", staging.dir.join("tmp-link")).unwrap();
    let report = sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    assert_eq!((report.written, report.deleted), (0, 0), "{report:?}");
    for planted in [".git", ".yana-ai", ".env", "deploy", "node_modules", "passwd-link", "tmp-link"] {
        assert!(!p.root.join(planted).exists(), "{planted} must not appear on this machine");
    }
    assert!(report.skipped.len() >= 6, "each refusal is reported: {:?}", report.skipped);
}

#[test]
fn renaming_a_secret_folder_inside_the_copy_reaches_nothing() {
    // The attack that defeats path-based hiding: move a folder into a place that is not
    // searched, then read it in the next run. With a copy, the secret was never in it.
    let p = project();
    put(&p.root, "config/.env", "TOKEN=real");
    put(&p.root, "config/app.toml", "name = 'x'");
    let first = stage(&p);
    assert!(!first.dir.join("config/.env").exists(), "the secret is not in the copy");
    std::fs::create_dir_all(first.dir.join("node_modules")).unwrap();
    std::fs::rename(first.dir.join("config"), first.dir.join("node_modules/config")).unwrap();
    let report = sync_back(&first, &p.root, StagingLimits::default()).unwrap();
    drop(first);
    assert_eq!(text(&p.root, "config/.env"), "TOKEN=real", "the real secret is where it was");
    assert!(!p.root.join("node_modules").exists(), "nothing was written into the vendored folder");
    // config/app.toml looks deleted from the copy, and it is the one thing that may go: it is a plain file.
    assert_eq!(report.deleted, 1, "{report:?}");
    let second = stage(&p);
    assert!(!second.dir.join("config/.env").exists() && !second.dir.join("node_modules").exists());
}

#[cfg(unix)]
#[test]
fn nothing_is_written_through_or_over_a_link_on_this_machine() {
    let p = project();
    let outside = tempfile::tempdir().unwrap();
    put(&p.root, "docs/a.txt", "a");
    let staging = stage(&p);
    put(&staging.dir, "docs/a.txt", "changed");
    put(&staging.dir, "docs/b.txt", "new");
    // Meanwhile on this machine `docs` became a link to somewhere else.
    std::fs::remove_dir_all(p.root.join("docs")).unwrap();
    std::os::unix::fs::symlink(outside.path(), p.root.join("docs")).unwrap();
    let report = sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    assert_eq!(report.written, 0, "{report:?}");
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0, "nothing was written through the link");
}

#[test]
fn a_file_that_changed_on_this_machine_meanwhile_is_not_overwritten_or_deleted() {
    let p = project();
    put(&p.root, "edit.txt", "before");
    put(&p.root, "drop.txt", "before");
    let staging = stage(&p);
    put(&staging.dir, "edit.txt", "from the command");
    std::fs::remove_file(staging.dir.join("drop.txt")).unwrap();
    put(&staging.dir, "fresh.txt", "from the command");
    // The person edits files on this machine while the command runs.
    put(&p.root, "edit.txt", "typed by the person");
    put(&p.root, "drop.txt", "typed by the person");
    put(&p.root, "fresh.txt", "typed by the person");
    let report = sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    assert_eq!((report.written, report.deleted), (0, 0), "{report:?}");
    for file in ["edit.txt", "drop.txt", "fresh.txt"] {
        assert_eq!(text(&p.root, file), "typed by the person", "{file}");
    }
    assert_eq!(report.skipped.len(), 3);
}

#[test]
fn a_command_that_leaves_too_much_behind_copies_nothing_back() {
    let p = project();
    put(&p.root, "a.txt", "a");
    let staging = stage(&p);
    put(&staging.dir, "ok.txt", "fine");
    put(&staging.dir, "big.bin", &"x".repeat(1000));
    let limits = StagingLimits { max_bytes: 100, ..StagingLimits::default() };
    let error = sync_back(&staging, &p.root, limits).unwrap_err();
    assert!(error.to_string().contains("nothing was copied back"), "{error}");
    assert!(!p.root.join("ok.txt").exists() && !p.root.join("big.bin").exists());
}

#[cfg(unix)]
#[test]
fn copied_back_files_keep_their_execute_bit_but_never_setuid() {
    use std::os::unix::fs::PermissionsExt;
    let p = project();
    put(&p.root, "a.txt", "a");
    let staging = stage(&p);
    put(&staging.dir, "tool.sh", "#!/bin/sh\n");
    std::fs::set_permissions(staging.dir.join("tool.sh"), std::fs::Permissions::from_mode(0o6755)).unwrap();
    sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    let mode = std::fs::metadata(p.root.join("tool.sh")).unwrap().permissions().mode();
    assert_eq!((mode & 0o7000, mode & 0o111), (0, 0o111), "{mode:o}");
    assert!(std::fs::read_dir(&p.root).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".yana-sync-")), "no temporary file is left");
}

#[test]
fn names_are_judged_without_regard_to_case() {
    for name in [".GIT/config", ".Yana-AI/x", "Node_Modules/a", ".ENV", "ID_RSA", "keys/Server.PEM"] {
        assert!(excluded(name).is_some(), "{name}");
    }
    for name in ["src/main.rs", "tokenizer.rs", "docs/build.md", "git-notes.txt"] {
        assert!(excluded(name).is_none(), "{name}");
    }
}

#[test]
fn a_working_directory_that_is_the_home_a_parent_of_it_the_disk_or_unknowable_is_refused() {
    let outer = tempfile::tempdir().unwrap();
    let home = outer.path().canonicalize().unwrap().join("home/me");
    let project = home.join("project");
    std::fs::create_dir_all(&project).unwrap();
    assert!(check_root(&project, Some(&home)).is_ok(), "a project under the home directory is the normal case");
    for root in [home.clone(), home.parent().unwrap().to_path_buf(), PathBuf::from("/")] {
        let error = check_root(&root, Some(&home)).unwrap_err();
        assert!(error.to_string().contains("home directory"), "{}: {error}", root.display());
    }
    assert!(check_root(&project, None).is_err(), "no home directory known: refuse, do not skip the check");
}
