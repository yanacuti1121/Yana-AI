//! Config Governance (Yana Studio architecture audit, Phase 4): the
//! `core/config/*.json` specialization of Phase 3's general
//! File-Mutation Governance. Reuses `file_mutation::propose_file_write` /
//! `apply_file_write` for the actual diff/backup/atomic-write/verify/
//! evidence mechanics unchanged — this module only adds the
//! config-specific guardrails a generic file write must not assume:
//!
//! - scope restriction to `core/config/`, one level deep (no subpaths —
//!   there are none in that directory today, and allowing one would need
//!   its own escape analysis this module doesn't build)
//! - a JSON-validity check *before* proposing, so a human approver is
//!   never shown, let alone asked to approve, a syntactically broken
//!   config file
//! - a hard exclusion of `core-lock.json`: that file's only legitimate
//!   writer is `core/scripts/update-core-lock.sh`, run by a human after
//!   reviewing the underlying change (`67-core-integrity-lock-law.md`).
//!   This capability must never become a second, AI-reachable way to
//!   rewrite it.
//!
//! `core/scripts/config_manager.py` (plain CRUD, no diff/approval/backup)
//! stays as the human/CLI fallback — this module does not replace it.

use super::error::CapabilityError;
use super::file_mutation::{self, FileMutationDiff, FileMutationKind, FileMutationOutcome};
use std::path::Path;

const CONFIG_DIR: &str = "core/config";
const LOCK_FILE_NAME: &str = "core-lock.json";

/// Accepts `requested` either as a bare file name (`"budget.json"`) or
/// already prefixed (`"core/config/budget.json"`) — a caller that already
/// knows this capability is config-scoped shouldn't have to repeat the
/// directory. Anything that would land outside a flat `core/config/`
/// (a subpath, `..`, or a prefix that merely starts with `core/config`
/// like `core/config-legacy/`) is rejected rather than guessed at.
fn config_relative_path(requested: &str) -> Result<String, CapabilityError> {
    let stripped = requested
        .strip_prefix("core/config/")
        .unwrap_or(requested);
    if stripped.contains('/') || stripped.contains('\\') || stripped.contains("..") {
        return Err(CapabilityError::InvalidInput {
            detail: format!(
                "'{requested}' must be a direct file under {CONFIG_DIR}/, not a subpath"
            ),
        });
    }
    if stripped == LOCK_FILE_NAME {
        return Err(CapabilityError::InvalidInput {
            detail: format!(
                "{LOCK_FILE_NAME} cannot be written through config.write — it is regenerated only by core/scripts/update-core-lock.sh after a human reviews the underlying change (67-core-integrity-lock-law)"
            ),
        });
    }
    if !stripped.ends_with(".json") {
        return Err(CapabilityError::InvalidInput {
            detail: format!("'{requested}' must be a .json file"),
        });
    }
    Ok(format!("{CONFIG_DIR}/{stripped}"))
}

fn validate_json(content: &str) -> Result<(), CapabilityError> {
    serde_json::from_str::<serde_json::Value>(content)
        .map(|_| ())
        .map_err(|error| CapabilityError::InvalidInput {
            detail: format!("proposed content is not valid JSON: {error}"),
        })
}

/// Read-only: same "propose" role as `file_mutation::propose_file_write`,
/// with the config-specific checks run first so an invalid proposal
/// (wrong scope, `core-lock.json`, malformed JSON) never reaches a diff
/// computation at all.
pub fn propose_config_write(
    root: &Path,
    requested: &str,
    kind: FileMutationKind,
    new_content: &str,
) -> Result<FileMutationDiff, CapabilityError> {
    let scoped_path = config_relative_path(requested)?;
    validate_json(new_content)?;
    file_mutation::propose_file_write(root, &scoped_path, kind, new_content)
}

/// Applies an already-approved config write. No approval logic of its
/// own — same contract as `apply_file_write`, which this delegates to
/// after re-running the same scope/JSON checks `propose_config_write`
/// already ran (defense in depth: a caller must not be able to skip the
/// checks by calling apply directly with a path that never went through
/// propose).
pub fn apply_config_write(
    root: &Path,
    requested: &str,
    kind: FileMutationKind,
    new_content: &str,
    session_id: Option<String>,
) -> Result<FileMutationOutcome, CapabilityError> {
    let scoped_path = config_relative_path(requested)?;
    validate_json(new_content)?;
    file_mutation::apply_file_write(root, &scoped_path, kind, new_content, session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_repo(tag: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("yana-config-write-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join(CONFIG_DIR)).unwrap();
        root
    }

    #[test]
    fn accepts_bare_filename_and_scopes_it_under_core_config() {
        let root = tmp_repo("bare-name");
        let diff = propose_config_write(&root, "new-setting.json", FileMutationKind::Create, "{}").unwrap();
        assert_eq!(diff.path, "core/config/new-setting.json");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn accepts_already_prefixed_path() {
        let root = tmp_repo("prefixed");
        let diff = propose_config_write(&root, "core/config/new-setting.json", FileMutationKind::Create, "{}").unwrap();
        assert_eq!(diff.path, "core/config/new-setting.json");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_a_subpath_under_config() {
        let root = tmp_repo("subpath");
        let result = propose_config_write(&root, "core/config/nested/x.json", FileMutationKind::Create, "{}");
        assert!(result.is_err());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_writing_core_lock_json() {
        let root = tmp_repo("lockfile");
        fs::write(root.join(CONFIG_DIR).join(LOCK_FILE_NAME), "{}").unwrap();
        let result = propose_config_write(&root, "core-lock.json", FileMutationKind::Overwrite, "{\"tampered\":true}");
        assert!(result.is_err(), "core-lock.json must never be writable through this capability");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_a_prefix_that_only_looks_like_core_config() {
        let root = tmp_repo("lookalike");
        // "core/config-legacy/x.json" must NOT be treated as
        // "core/config/" + "-legacy/x.json" — strip_prefix only matches
        // the exact "core/config/" string, so this falls through to the
        // bare-filename branch and the whole string (containing '/') is
        // correctly rejected as a subpath.
        let result = propose_config_write(&root, "core/config-legacy/x.json", FileMutationKind::Create, "{}");
        assert!(result.is_err());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_non_json_extension() {
        let root = tmp_repo("non-json-ext");
        let result = propose_config_write(&root, "notes.txt", FileMutationKind::Create, "hello");
        assert!(result.is_err());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_malformed_json_content_before_computing_a_diff() {
        let root = tmp_repo("malformed-json");
        let result = propose_config_write(&root, "budget.json", FileMutationKind::Create, "{ not valid json");
        assert!(matches!(result, Err(CapabilityError::InvalidInput { .. })));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_writes_valid_json_and_produces_evidence() {
        let root = tmp_repo("apply-ok");
        let outcome = apply_config_write(
            &root,
            "budget.json",
            FileMutationKind::Create,
            "{\"daily_limit\": 100}",
            Some("sess-1".into()),
        )
        .unwrap();
        let written = fs::read_to_string(root.join(CONFIG_DIR).join("budget.json")).unwrap();
        assert_eq!(written, "{\"daily_limit\": 100}");
        assert!(outcome.backup_path.is_none());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_rejects_and_does_not_write_when_json_is_malformed() {
        let root = tmp_repo("apply-malformed");
        let result = apply_config_write(&root, "budget.json", FileMutationKind::Create, "{ nope", None);
        assert!(result.is_err());
        assert!(!root.join(CONFIG_DIR).join("budget.json").exists());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_backs_up_an_existing_config_file_before_overwriting() {
        let root = tmp_repo("apply-overwrite-backup");
        fs::write(root.join(CONFIG_DIR).join("rate-limits.json"), "{\"rpm\": 10}").unwrap();
        let outcome = apply_config_write(
            &root,
            "rate-limits.json",
            FileMutationKind::Overwrite,
            "{\"rpm\": 20}",
            None,
        )
        .unwrap();
        let backup_rel = outcome.backup_path.expect("overwrite must back up the original");
        assert_eq!(fs::read_to_string(root.join(backup_rel)).unwrap(), "{\"rpm\": 10}");
        fs::remove_dir_all(root).ok();
    }
}
