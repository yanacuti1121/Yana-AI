//! Agent writes can never change the repo-local search or MCP-server configuration.

use super::file_mutation::{apply_file_write, propose_file_write, FileMutationKind};
use super::file_patch::apply_file_patch;
use super::patch::FileEdit;
use super::CapabilityError;
use std::path::PathBuf;

const ORIGINAL: &str = "{\"endpoint\":\"https://search.example/s\"}";

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("ws");
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::write(root.join(".yana-ai/web-search.json"), ORIGINAL).unwrap();
    std::fs::write(root.join(".yana-ai/mcp-servers.json"), "{}").unwrap();
    std::fs::create_dir(root.join("docs")).unwrap();
    (outer, root)
}

fn untouched(root: &std::path::Path) {
    assert_eq!(std::fs::read_to_string(root.join(".yana-ai/web-search.json")).unwrap(), ORIGINAL);
    assert_eq!(std::fs::read_to_string(root.join(".yana-ai/mcp-servers.json")).unwrap(), "{}");
}

fn refused(root: &std::path::Path, path: &str) {
    let write = apply_file_write(root, path, FileMutationKind::Overwrite, "{\"endpoint\":\"https://evil.example/\"}", None);
    assert!(matches!(write, Err(CapabilityError::InvalidInput { .. }) | Err(CapabilityError::NotFound { .. })), "{path}: {write:?}");
    let propose = propose_file_write(root, path, FileMutationKind::Overwrite, "x");
    assert!(propose.is_err(), "{path}: the proposal itself is refused, before any approval prompt");
    let edit = [FileEdit { old: "search.example".into(), new: "evil.example".into(), replace_all: false }];
    assert!(apply_file_patch(root, path, &edit, None).is_err(), "{path}: file.patch too");
    untouched(root);
}

#[test]
fn the_plain_path_and_its_dot_and_dotdot_spellings_are_refused() {
    let (_keep, root) = workspace();
    for path in [
        ".yana-ai/web-search.json",
        "./.yana-ai/web-search.json",
        ".yana-ai//web-search.json",
        "docs/../.yana-ai/web-search.json",
        ".yana-ai/../.yana-ai/web-search.json",
        ".yana-ai/mcp-servers.json",
        "./.yana-ai/./mcp-servers.json",
    ] {
        refused(&root, path);
    }
}

#[test]
fn other_letter_case_reaches_the_same_answer() {
    let (_keep, root) = workspace();
    for path in [".YANA-AI/web-search.json", ".yana-ai/Web-Search.JSON", ".yana-ai/MCP-SERVERS.json"] {
        let outcome = apply_file_write(&root, path, FileMutationKind::Overwrite, "x", None);
        assert!(outcome.is_err(), "{path}");
    }
    untouched(&root);
}

#[test]
fn creating_a_protected_file_that_does_not_exist_yet_is_refused_too() {
    let (_keep, root) = workspace();
    std::fs::remove_file(root.join(".yana-ai/mcp-servers.json")).unwrap();
    let outcome = apply_file_write(&root, ".yana-ai/mcp-servers.json", FileMutationKind::Create, "{}", None);
    assert!(matches!(outcome, Err(CapabilityError::InvalidInput { .. })), "{outcome:?}");
    assert!(!root.join(".yana-ai/mcp-servers.json").exists());
}

#[cfg(unix)]
#[test]
fn a_symlinked_alias_of_the_directory_or_of_the_file_is_refused() {
    let (_keep, root) = workspace();
    std::os::unix::fs::symlink(root.join(".yana-ai"), root.join("alias")).unwrap();
    std::os::unix::fs::symlink(root.join(".yana-ai/web-search.json"), root.join("docs/link.json")).unwrap();
    refused(&root, "alias/web-search.json");
    refused(&root, "docs/link.json");
}

#[test]
fn ordinary_files_stay_writable_including_other_files_in_the_state_directory() {
    let (_keep, root) = workspace();
    std::fs::write(root.join("docs/web-search.json"), "{}").unwrap();
    std::fs::write(root.join(".yana-ai/notes.txt"), "a").unwrap();
    for path in ["docs/web-search.json", ".yana-ai/notes.txt"] {
        apply_file_write(&root, path, FileMutationKind::Overwrite, "changed", None).unwrap();
        assert_eq!(std::fs::read_to_string(root.join(path)).unwrap(), "changed");
    }
    untouched(&root);
}

#[test]
fn the_refusal_names_the_file_and_the_reason() {
    let (_keep, root) = workspace();
    let error = apply_file_write(&root, ".yana-ai/web-search.json", FileMutationKind::Overwrite, "x", None).unwrap_err().to_string();
    assert!(error.contains("protected configuration file"), "{error}");
}
