//! Tests for `repo.rs` — split into its own file purely for the repo's
//! 300-line file-length limit (loaded via `#[path]` from `repo.rs`, still
//! logically `capability::repo::tests`).

use super::*;

fn tmp_repo(tag: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("yana-capability-{tag}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn denies_path_escape() {
    let root = tmp_repo("escape");
    let outside = root
        .parent()
        .unwrap()
        .join(format!("outside-{}", uuid::Uuid::new_v4()));
    fs::write(&outside, "secret").unwrap();
    let req = format!("../{}", outside.file_name().unwrap().to_string_lossy());
    assert!(resolve_existing(&root, &req).is_err());
    fs::remove_file(outside).ok();
    fs::remove_dir_all(root).ok();
}
#[test]
fn tree_and_search_work() {
    let root = tmp_repo("tree");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("src/lib.rs"), "const TOKEN_BUDGET: usize = 1;").unwrap();
    assert!(repo_tree(&root, ".", 2).unwrap().contains("src/lib.rs"));
    assert!(search_code(&root, ".", "token_budget")
        .unwrap()
        .contains("TOKEN_BUDGET"));
    fs::remove_dir_all(root).ok();
}

#[test]
fn read_observation_and_mcp_envelope_share_one_implementation() {
    let root = tmp_repo("read");
    fs::write(root.join("a.txt"), "hello").unwrap();
    let observation = read_file_observation(&root, "a.txt").unwrap();
    assert_eq!(observation.path, "a.txt");
    assert_eq!(observation.size_bytes, 5);
    assert_eq!(observation.content, "hello");

    let envelope: serde_json::Value =
        serde_json::from_str(&read_file(&root, "a.txt").unwrap()).unwrap();
    assert_eq!(envelope["capability"], "repo.read");
    assert_eq!(envelope["data"]["path"], "a.txt");
    assert_eq!(envelope["data"]["size_bytes"], 5);
    assert_eq!(envelope["data"]["content"], "hello");
    assert_eq!(envelope["truncated"], false);
    fs::remove_dir_all(root).ok();
}

#[test]
fn read_rejects_dotdot_escape() {
    let root = tmp_repo("read-dotdot");
    let outside = root
        .parent()
        .unwrap()
        .join(format!("outside-{}.txt", uuid::Uuid::new_v4()));
    fs::write(&outside, "secret").unwrap();
    let requested = format!("../{}", outside.file_name().unwrap().to_string_lossy());
    assert!(matches!(
        read_file_observation(&root, &requested),
        Err(CapabilityError::PathEscape { .. })
    ));
    fs::remove_file(outside).ok();
    fs::remove_dir_all(root).ok();
}

#[test]
fn read_rejects_oversized_file() {
    let root = tmp_repo("read-errors");
    fs::write(
        root.join("big.txt"),
        vec![b'x'; (MAX_READ_BYTES + 1) as usize],
    )
    .unwrap();
    assert!(matches!(
        read_file_observation(&root, "big.txt"),
        Err(CapabilityError::TooLarge { .. })
    ));
    fs::remove_dir_all(root).ok();
}

#[test]
fn read_missing_file_is_a_clean_error() {
    let root = tmp_repo("read-missing");
    assert!(matches!(
        read_file_observation(&root, "missing.txt"),
        Err(CapabilityError::NotFound { .. })
    ));
    fs::remove_dir_all(root).ok();
}

#[cfg(unix)]
#[test]
fn read_rejects_symlink_escape() {
    let root = tmp_repo("symlink");
    let outside = root
        .parent()
        .unwrap()
        .join(format!("outside-{}.txt", uuid::Uuid::new_v4()));
    fs::write(&outside, "secret").unwrap();
    std::os::unix::fs::symlink(&outside, root.join("escape.txt")).unwrap();
    assert!(read_file_observation(&root, "escape.txt").is_err());
    fs::remove_file(outside).ok();
    fs::remove_dir_all(root).ok();
}

#[test]
fn search_rejects_empty_query() {
    let root = tmp_repo("search-empty");
    assert!(matches!(
        search_code(&root, ".", "  "),
        Err(CapabilityError::InvalidInput { .. })
    ));
    fs::remove_dir_all(root).ok();
}
