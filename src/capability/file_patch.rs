//! `file.patch`: edit an existing repository file with search-and-replace
//! edits (WS3 T3, docs/contracts/ws3-tools.md 7).
//!
//! The matching lives in `patch.rs`. This file only reads the current content
//! and hands the result to the existing governed write path, so path checks,
//! the human-visible diff, backup, atomic write, hash verification and the
//! optional checkpoint are exactly those of `file.write` (Overwrite). Nothing
//! here writes a file itself.

// `file.patch` is a described capability (registry descriptor, contract section 7) that no
// chat or MCP path calls yet: the contract says wiring it needs `authorize` plus a
// refused-without-approval test, which is a separate piece of work. Until then only the tests
// call this module, so its dead-code warnings are expected and reasoned.
#![allow(dead_code)]

use super::error::CapabilityError;
use super::file_mutation::{apply_file_write, propose_file_write, FileMutationDiff, FileMutationKind, FileMutationOutcome};
use super::patch::{apply_edits, EditReport, FileEdit};
use super::repo::resolve_existing;
use std::fs;
use std::path::Path;

/// The file's new content after `edits`, and how each edit matched.
fn patched(root: &Path, requested: &str, edits: &[FileEdit]) -> Result<(String, Vec<EditReport>), CapabilityError> {
    // `resolve_existing` canonicalizes and rejects anything outside the root,
    // including a symlink that leads out of it.
    let path = resolve_existing(root, requested)?;
    if !path.is_file() {
        return Err(CapabilityError::NotAFile { requested: requested.to_string() });
    }
    let bytes = fs::read(&path).map_err(|e| CapabilityError::Io { detail: format!("read '{requested}': {e}") })?;
    let current = String::from_utf8(bytes).map_err(|_| CapabilityError::InvalidUtf8 { requested: requested.to_string() })?;
    apply_edits(&current, edits)
}

/// Read-only: what `apply_file_patch` would change. Safe to call before approval,
/// so the diff can be shown to the human as part of the approval prompt.
pub fn propose_file_patch(
    root: &Path,
    requested: &str,
    edits: &[FileEdit],
) -> Result<(FileMutationDiff, Vec<EditReport>), CapabilityError> {
    let (content, reports) = patched(root, requested, edits)?;
    Ok((propose_file_write(root, requested, FileMutationKind::Overwrite, &content)?, reports))
}

/// Apply the edits to the file as it is now. Must only be reached after the
/// approval decision, like `apply_file_write`. The edits are re-matched against
/// the current content, so a file changed since the proposal is patched (or
/// refused) on what it holds now, never on a stale copy.
pub fn apply_file_patch(
    root: &Path,
    requested: &str,
    edits: &[FileEdit],
    session_id: Option<String>,
) -> Result<(FileMutationOutcome, Vec<EditReport>), CapabilityError> {
    let (content, reports) = patched(root, requested, edits)?;
    let outcome = apply_file_write(root, requested, FileMutationKind::Overwrite, &content, session_id)?;
    Ok((outcome, reports))
}
