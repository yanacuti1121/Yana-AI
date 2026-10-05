//! More tests for the private copy and the copy back (WS6 E1b): second names for protected
//! items, letter-case renames, links replacing folders, huge files, unreadable folders.

use super::staging::StagingLimits;
use super::staging_sync::sync_back;
use super::staging_tests::{project, put, stage};

#[test]
fn hard_links_and_a_second_name_for_a_protected_item_are_not_copied_or_written_through() {
    let p = project();
    put(&p.root, "notes.txt", "plain");
    put(&p.root, "keys/server.pem", "private key");
    std::fs::hard_link(p.root.join("keys/server.pem"), p.root.join("harmless-name.txt")).unwrap();
    let staging = stage(&p);
    assert!(!staging.dir.join("harmless-name.txt").exists(), "a second name for a secret is not copied");
    assert!(staging.left_out.iter().any(|n| n.contains("hard link")));
    // A name that is the same folder as a protected one on this machine, however spelled
    // (a case-insensitive disk folds some letters), is not written into.
    std::fs::create_dir_all(p.root.join(".ssh")).unwrap();
    let staging = stage(&p);
    put(&staging.dir, ".\u{17f}sh/authorized_keys", "attacker key");
    let report = sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    assert!(!p.root.join(".ssh/authorized_keys").exists(), "{report:?}");
}

#[test]
fn a_rename_that_only_changes_letter_case_never_deletes_the_original() {
    let p = project();
    put(&p.root, "README.md", "text");
    let staging = stage(&p);
    std::fs::rename(staging.dir.join("README.md"), staging.dir.join("readme.md")).unwrap();
    sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    let names: Vec<String> = std::fs::read_dir(&p.root).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_lowercase()).collect();
    assert!(names.iter().any(|n| n == "readme.md"), "the file must still exist: {names:?}");
    assert_eq!(std::fs::read_to_string(p.root.join("README.md")).unwrap_or_else(|_| std::fs::read_to_string(p.root.join("readme.md")).unwrap()), "text");
}

#[cfg(unix)]
#[test]
fn replacing_a_folder_by_a_link_deletes_nothing_on_this_machine() {
    let p = project();
    put(&p.root, "src/a.rs", "a");
    put(&p.root, "src/b.rs", "b");
    let staging = stage(&p);
    std::fs::remove_dir_all(staging.dir.join("src")).unwrap();
    std::os::unix::fs::symlink("/tmp", staging.dir.join("src")).unwrap();
    let report = sync_back(&staging, &p.root, StagingLimits::default()).unwrap();
    assert_eq!(report.deleted, 0, "{report:?}");
    assert!(p.root.join("src/a.rs").exists() && p.root.join("src/b.rs").exists());
}

#[test]
fn a_huge_file_is_refused_by_its_size_before_it_is_read() {
    let p = project();
    put(&p.root, "a.txt", "a");
    let staging = stage(&p);
    let big = std::fs::File::create(staging.dir.join("sparse.bin")).unwrap();
    big.set_len(10 * 1024 * 1024 * 1024).unwrap();
    let limits = StagingLimits { max_bytes: 1024 * 1024, ..StagingLimits::default() };
    let started = std::time::Instant::now();
    let error = sync_back(&staging, &p.root, limits).unwrap_err();
    assert!(error.to_string().contains("nothing was copied back"), "{error}");
    assert!(started.elapsed() < std::time::Duration::from_secs(5), "it must not read ten gigabytes first");
}

#[cfg(unix)]
#[test]
fn the_copy_is_removed_even_when_a_command_made_a_folder_unreadable() {
    use std::os::unix::fs::PermissionsExt;
    let p = project();
    put(&p.root, "a.txt", "a");
    let staging = stage(&p);
    let parent = staging.dir.parent().unwrap().to_path_buf();
    std::fs::create_dir_all(staging.dir.join("locked/inner")).unwrap();
    std::fs::set_permissions(staging.dir.join("locked"), std::fs::Permissions::from_mode(0o000)).unwrap();
    drop(staging);
    assert!(!parent.exists(), "the whole copy, including the locked folder, is gone");
}
