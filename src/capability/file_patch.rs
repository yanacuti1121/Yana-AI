//! `file.patch`: edit an existing repository file with search-and-replace
//! edits (WS3 T3, docs/contracts/ws3-tools.md 7).
//!
//! The matching lives in `patch.rs`. This file only reads the current content
//! and hands the result to the existing governed write path, so path checks,
//! the human-visible diff, backup, atomic write, hash verification and the
//! optional checkpoint are exactly those of `file.write` (Overwrite). Nothing
//! here writes a file itself.

// `file.patch` is called from chat (`patch_file`, see `chat/tools` and `chat/tui/tool_dispatch.rs`) only after a
// human approved the call; `chat/tui/tool_dispatch.rs` tests that an unapproved call changes nothing.
// MCP does not expose it.

use super::error::CapabilityError;
use super::file_mutation::{apply_file_write, propose_file_write, FileMutationDiff, FileMutationKind, FileMutationOutcome};
use serde::Deserialize;
use super::patch::{apply_edits, EditReport, FileEdit};
use super::repo::resolve_existing;
use std::fs;
use std::path::Path;

/// Shape of `patch_file`'s `arguments_json`, mirroring the `file.patch` input schema. Unknown
/// fields are refused so a misspelt `replace_all` is an error, not a silent single replace.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PatchEditArgs {
    old: String,
    new: String,
    #[serde(default)]
    replace_all: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PatchCallArgs {
    path: String,
    /// An array of edits. Some models send the array as a JSON *string*; that is accepted only
    /// when the string itself holds a valid array, and each edit is then checked exactly the same.
    edits: serde_json::Value,
}

fn invalid_patch(detail: String) -> CapabilityError {
    CapabilityError::InvalidInput { detail: format!("patch_file needs path and edits [{{old, new, replace_all?}}]: {detail}") }
}

/// Parse a `patch_file` call's arguments into the path and the edits. Matching limits (count, empty
/// `old`, `old == new`) are enforced by `apply_edits`, not here.
pub fn parse_patch_call(arguments_json: &str) -> Result<(String, Vec<FileEdit>), CapabilityError> {
    let args: PatchCallArgs = serde_json::from_str(arguments_json).map_err(|error| invalid_patch(error.to_string()))?;
    let list: Vec<PatchEditArgs> = match args.edits {
        serde_json::Value::String(text) => serde_json::from_str(&text).map_err(|error| invalid_patch(format!("edits was a string that is not a valid array of edits: {error}")))?,
        other => serde_json::from_value(other).map_err(|error| invalid_patch(error.to_string()))?,
    };
    let edits = list
        .into_iter()
        .map(|edit| FileEdit { old: edit.old, new: edit.new, replace_all: edit.replace_all })
        .collect();
    Ok((args.path, edits))
}

/// The file's new content after `edits`, and how each edit matched.
pub fn patched(root: &Path, requested: &str, edits: &[FileEdit]) -> Result<(String, Vec<EditReport>), CapabilityError> {
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
