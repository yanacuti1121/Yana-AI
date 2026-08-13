//! Git observation capabilities: status, diff. Moved as-is from the
//! original single-file `capability/mod.rs` — bodies unchanged, error type
//! changed from `String` to `CapabilityError`.

use super::error::CapabilityError;
use super::{encode, run, MAX_DIFF_BYTES};
use std::path::Path;

pub fn git_status(root: &Path) -> Result<String, CapabilityError> {
    let root = root.to_string_lossy();
    encode(
        "git.status",
        serde_json::json!({"output": run("git", &["-C", &root, "status", "--porcelain=v2", "--branch"])?}),
        false,
    )
}

pub fn git_diff(root: &Path, staged: bool) -> Result<String, CapabilityError> {
    let root = root.to_string_lossy();
    let mut text = if staged {
        run("git", &["-C", &root, "diff", "--no-ext-diff", "--cached"])?
    } else {
        run("git", &["-C", &root, "diff", "--no-ext-diff"])?
    };
    let truncated = text.len() > MAX_DIFF_BYTES;
    if truncated {
        let mut end = MAX_DIFF_BYTES;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
    }
    encode(
        "git.diff",
        serde_json::json!({"staged": staged, "output": text}),
        truncated,
    )
}
