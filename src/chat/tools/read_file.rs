//! Chat adapter for the canonical read-only repository capability.

use std::path::Path;

/// Returns raw content for the chat tool protocol while capability owns
/// path validation, size bounds, UTF-8 handling, and evidence metadata.
pub fn execute(repo_root: &Path, requested_path: &str) -> Result<String, String> {
    crate::capability::read_file_observation(repo_root, requested_path)
        .map(|observation| observation.content)
        .map_err(Into::into)
}
