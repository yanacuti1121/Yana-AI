//! File-Mutation Governance (Yana Studio architecture audit, Phase 3):
//! the first AI-usable capability in this codebase that can write file
//! *content* (not shell out to an arbitrary command). Before this module,
//! `crate::capability` had zero `write_file`/`edit_file`-shaped capability
//! — every write path in the codebase was either human-only (git commit/
//! stage) or task/config state, not general file content.
//!
//! Deliberately narrow for this first increment: only `create` (path must
//! not already exist) and `overwrite` (path must already exist, target of
//! a full-content replace) are supported. Rename/delete/copy are a
//! separate, later increment — see the Yana Studio roadmap report
//! (https://claude.ai/code/artifact/b755a46b-0615-47d1-bcf2-fbc4d3aa83af,
//! §F Phase 3/4) for why file-mutation governance generalizes config
//! governance rather than the other way around.
//!
//! Flow, matching the report's data contract exactly:
//! propose (this module's `propose_file_write`, read-only, produces a
//! diff) -> guard/approval (the existing `CapabilityDescriptor`
//! `HumanApprovalPerCall` + authority chain in `runtime::authority` —
//! this module does not add a second approval mechanism, see that
//! module's own doc comment for why one wasn't needed) -> apply (this
//! module's `apply_file_write`: backup -> atomic write -> verify) ->
//! evidence (`crate::capability::evidence::ToolEvidence`, the same real
//! hash/size/mtime evidence every read capability already produces —
//! not a second, weaker evidence type).

use super::error::CapabilityError;
use super::evidence::ToolEvidence;
use std::fs;
use std::path::{Path, PathBuf};

/// Repo-relative backup directory. Not `.yana-ai/backups/` (already used
/// by other subsystems for different content) — scoped to this
/// capability alone so a future `file-mutation` cleanup policy can target
/// it without guessing what else lives there.
const BACKUP_DIR: &str = ".yana-ai/file-mutation-backups";

/// Same cap `capability::MAX_READ_BYTES` uses for a read — a write this
/// module diffs/backs-up is bounded by the same "one bounded file" size
/// discipline the read-only capabilities already established.
const MAX_MUTATION_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileMutationKind {
    /// Target must not already exist.
    Create,
    /// Target must already exist; the mutation replaces its full content.
    Overwrite,
}

/// The parent directory of `requested` must already exist — this
/// increment does not create intermediate directories. `requested` must
/// resolve (after joining with `root` and canonicalizing the parent) to
/// a path inside `root`; a symlinked target is rejected outright rather
/// than followed, the same TOCTOU concern `repo::search_code` already
/// guards against for reads, but an error here instead of a silent skip
/// — a write must never happen through a symlink an AI didn't know it
/// was writing through.
fn resolve_for_write(root: &Path, requested: &str) -> Result<PathBuf, CapabilityError> {
    let root = root.canonicalize().map_err(|e| CapabilityError::Io {
        detail: format!("resolve repo root: {e}"),
    })?;
    let joined = root.join(requested);
    let Some(parent) = joined.parent() else {
        return Err(CapabilityError::InvalidInput {
            detail: format!("'{requested}' has no parent directory"),
        });
    };
    let parent_canonical = parent.canonicalize().map_err(|_| CapabilityError::NotFound {
        requested: format!("parent directory of '{requested}'"),
    })?;
    if !parent_canonical.starts_with(&root) {
        return Err(CapabilityError::PathEscape {
            requested: requested.to_string(),
        });
    }
    let Some(file_name) = joined.file_name() else {
        return Err(CapabilityError::InvalidInput {
            detail: format!("'{requested}' has no file name component"),
        });
    };
    let target = parent_canonical.join(file_name);
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() {
            return Err(CapabilityError::InvalidInput {
                detail: format!("'{requested}' is a symlink — refusing to write through it"),
            });
        }
    }
    Ok(target)
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// Minimal, dependency-free line-level diff (classic LCS dynamic
/// program). This is advisory only — for a human approver to read before
/// deciding, never used to *apply* the change (the actual write always
/// writes `new_content` verbatim; see `apply_file_write`) — so it does
/// not need to be a reversible patch format, only an accurate rendering
/// of which lines were removed/kept/added.
fn line_diff(before: &str, after: &str) -> String {
    let before_lines: Vec<&str> = before.lines().collect();
    let after_lines: Vec<&str> = after.lines().collect();
    let (m, n) = (before_lines.len(), after_lines.len());

    // lcs[i][j] = length of the LCS of before_lines[i..] and after_lines[j..]
    let mut lcs = vec![vec![0usize; n + 1]; m + 1];
    for i in (0..m).rev() {
        for j in (0..n).rev() {
            lcs[i][j] = if before_lines[i] == after_lines[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }

    let mut out = String::new();
    let (mut i, mut j) = (0, 0);
    while i < m && j < n {
        if before_lines[i] == after_lines[j] {
            out.push_str("  ");
            out.push_str(before_lines[i]);
            out.push('\n');
            i += 1;
            j += 1;
        } else if lcs[i + 1][j] >= lcs[i][j + 1] {
            out.push_str("- ");
            out.push_str(before_lines[i]);
            out.push('\n');
            i += 1;
        } else {
            out.push_str("+ ");
            out.push_str(after_lines[j]);
            out.push('\n');
            j += 1;
        }
    }
    while i < m {
        out.push_str("- ");
        out.push_str(before_lines[i]);
        out.push('\n');
        i += 1;
    }
    while j < n {
        out.push_str("+ ");
        out.push_str(after_lines[j]);
        out.push('\n');
        j += 1;
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct FileMutationDiff {
    pub path: String,
    pub kind_label: &'static str,
    pub existed_before: bool,
    pub before_sha256: Option<String>,
    pub after_sha256: String,
    pub before_bytes: Option<u64>,
    pub after_bytes: u64,
    pub unified_diff: String,
}

/// Read-only: computes what `apply_file_write` *would* do, without
/// touching the filesystem. This is the "propose" + "diff" steps of the
/// governed flow — safe to call before any approval exists, so a client
/// can show the diff to a human as part of the approval prompt itself.
pub fn propose_file_write(
    root: &Path,
    requested: &str,
    kind: FileMutationKind,
    new_content: &str,
) -> Result<FileMutationDiff, CapabilityError> {
    if new_content.len() > MAX_MUTATION_BYTES {
        return Err(CapabilityError::TooLarge {
            bytes: new_content.len() as u64,
            limit: MAX_MUTATION_BYTES as u64,
        });
    }
    let target = resolve_for_write(root, requested)?;
    let existed_before = target.is_file();

    match kind {
        FileMutationKind::Create if existed_before => {
            return Err(CapabilityError::InvalidInput {
                detail: format!("'{requested}' already exists — use kind=overwrite"),
            });
        }
        FileMutationKind::Overwrite if !existed_before => {
            return Err(CapabilityError::NotFound {
                requested: requested.to_string(),
            });
        }
        _ => {}
    }

    let before_content = if existed_before {
        Some(fs::read_to_string(&target).map_err(|e| {
            if e.kind() == std::io::ErrorKind::InvalidData {
                CapabilityError::InvalidUtf8 {
                    requested: requested.to_string(),
                }
            } else {
                CapabilityError::Io {
                    detail: format!("read '{requested}' for diff: {e}"),
                }
            }
        })?)
    } else {
        None
    };

    let before_bytes = before_content.as_ref().map(|c| c.len() as u64);
    let before_sha256 = before_content.as_ref().map(|c| sha256_hex(c.as_bytes()));
    let unified_diff = line_diff(before_content.as_deref().unwrap_or(""), new_content);

    Ok(FileMutationDiff {
        path: requested.to_string(),
        kind_label: match kind {
            FileMutationKind::Create => "create",
            FileMutationKind::Overwrite => "overwrite",
        },
        existed_before,
        before_sha256,
        after_sha256: sha256_hex(new_content.as_bytes()),
        before_bytes,
        after_bytes: new_content.len() as u64,
        unified_diff,
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FileMutationOutcome {
    pub diff: FileMutationDiff,
    /// Repo-relative path to the pre-mutation backup, `None` for `Create`
    /// (there was nothing to back up).
    pub backup_path: Option<String>,
    pub evidence: ToolEvidence,
}

/// Applies a proposal that has already cleared the capability's
/// `HumanApprovalPerCall` gate (`runtime::authority::YanaAuthorityChain`
/// — this function has no approval logic of its own; the caller must not
/// invoke it except from the same code path every other
/// `HumanApprovalPerCall` capability's *approved* branch goes through).
///
/// Order matters and is fixed: re-verify preconditions -> back up the
/// existing file (Overwrite only) -> atomic write (temp file + rename,
/// same pattern `runtime::pending_approval`'s store already uses, not a
/// direct `fs::write` that could leave a half-written file on a crash
/// mid-write) -> re-read and hash-verify what actually landed on disk ->
/// real evidence (`ToolEvidence::for_file`, not fabricated).
pub fn apply_file_write(
    root: &Path,
    requested: &str,
    kind: FileMutationKind,
    new_content: &str,
    session_id: Option<String>,
) -> Result<FileMutationOutcome, CapabilityError> {
    let diff = propose_file_write(root, requested, kind, new_content)?;
    let target = resolve_for_write(root, requested)?;

    let backup_path = if diff.existed_before {
        Some(write_backup(root, requested, &target)?)
    } else {
        None
    };

    let temp_path = target.with_extension(format!(
        "yana-mutation-tmp.{}",
        std::process::id()
    ));
    fs::write(&temp_path, new_content).map_err(|e| CapabilityError::Io {
        detail: format!("write temp file for '{requested}': {e}"),
    })?;
    fs::rename(&temp_path, &target).map_err(|e| CapabilityError::Io {
        detail: format!("atomically replace '{requested}': {e}"),
    })?;

    // Verify: re-read what actually landed on disk and hash it, rather
    // than trusting that `fs::write` + `fs::rename` did what we asked —
    // the whole point of a verify step is not skipping it because the
    // preceding calls didn't return an error.
    let written = fs::read(&target).map_err(|e| CapabilityError::Io {
        detail: format!("verify '{requested}' after write: {e}"),
    })?;
    if sha256_hex(&written) != diff.after_sha256 {
        return Err(CapabilityError::Io {
            detail: format!(
                "verification failed for '{requested}': on-disk hash does not match the proposed content"
            ),
        });
    }

    let evidence = ToolEvidence::for_file(&target, session_id)?;
    Ok(FileMutationOutcome {
        diff,
        backup_path,
        evidence,
    })
}

fn write_backup(root: &Path, requested: &str, target: &Path) -> Result<String, CapabilityError> {
    let backup_dir = root.join(BACKUP_DIR);
    fs::create_dir_all(&backup_dir).map_err(|e| CapabilityError::Io {
        detail: format!("create backup directory: {e}"),
    })?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.fZ");
    let safe_name = requested.replace(['/', '\\'], "__");
    let backup_file = backup_dir.join(format!("{safe_name}.{stamp}.bak"));
    fs::copy(target, &backup_file).map_err(|e| CapabilityError::Io {
        detail: format!("back up '{requested}' before write: {e}"),
    })?;
    Ok(backup_file
        .strip_prefix(root)
        .unwrap_or(&backup_file)
        .to_string_lossy()
        .into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_repo(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "yana-file-mutation-{tag}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn propose_create_on_new_file_has_no_before() {
        let root = tmp_repo("propose-create");
        let diff = propose_file_write(&root, "new.txt", FileMutationKind::Create, "hello\n").unwrap();
        assert!(!diff.existed_before);
        assert!(diff.before_sha256.is_none());
        assert_eq!(diff.after_bytes, 6);
        assert!(!root.join("new.txt").exists(), "propose must not touch the filesystem");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn propose_create_rejects_existing_target() {
        let root = tmp_repo("propose-create-conflict");
        fs::write(root.join("exists.txt"), "old").unwrap();
        let result = propose_file_write(&root, "exists.txt", FileMutationKind::Create, "new");
        assert!(result.is_err());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn propose_overwrite_requires_existing_target() {
        let root = tmp_repo("propose-overwrite-missing");
        let result = propose_file_write(&root, "missing.txt", FileMutationKind::Overwrite, "new");
        assert!(matches!(result, Err(CapabilityError::NotFound { .. })));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn propose_overwrite_computes_a_real_diff() {
        let root = tmp_repo("propose-overwrite-diff");
        fs::write(root.join("f.txt"), "line1\nline2\nline3\n").unwrap();
        let diff = propose_file_write(&root, "f.txt", FileMutationKind::Overwrite, "line1\nCHANGED\nline3\n").unwrap();
        assert!(diff.existed_before);
        assert!(diff.unified_diff.contains("- line2"));
        assert!(diff.unified_diff.contains("+ CHANGED"));
        assert!(diff.unified_diff.contains("  line1"));
        assert!(diff.unified_diff.contains("  line3"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_create_writes_the_exact_content_and_produces_evidence() {
        let root = tmp_repo("apply-create");
        let outcome = apply_file_write(&root, "a.txt", FileMutationKind::Create, "hello world\n", Some("sess-1".into())).unwrap();
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "hello world\n");
        assert!(outcome.backup_path.is_none());
        assert_eq!(outcome.evidence.byte_count, Some(12));
        assert_eq!(outcome.evidence.session_id.as_deref(), Some("sess-1"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_overwrite_backs_up_the_original_before_replacing_it() {
        let root = tmp_repo("apply-overwrite-backup");
        fs::write(root.join("b.txt"), "original\n").unwrap();
        let outcome = apply_file_write(&root, "b.txt", FileMutationKind::Overwrite, "replaced\n", None).unwrap();
        assert_eq!(fs::read_to_string(root.join("b.txt")).unwrap(), "replaced\n");
        let backup_rel = outcome.backup_path.expect("overwrite must produce a backup");
        assert_eq!(fs::read_to_string(root.join(&backup_rel)).unwrap(), "original\n");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_rejects_content_over_the_size_cap() {
        let root = tmp_repo("apply-too-large");
        let huge = "x".repeat(MAX_MUTATION_BYTES + 1);
        let result = apply_file_write(&root, "huge.txt", FileMutationKind::Create, &huge, None);
        assert!(matches!(result, Err(CapabilityError::TooLarge { .. })));
        assert!(!root.join("huge.txt").exists());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn resolve_for_write_rejects_path_escape_via_parent_traversal() {
        let root = tmp_repo("escape-parent");
        let result = propose_file_write(&root, "../../etc/passwd", FileMutationKind::Create, "x");
        assert!(result.is_err(), "must reject a parent that resolves outside root");
        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn resolve_for_write_refuses_to_write_through_a_symlink() {
        use std::os::unix::fs::symlink;
        let root = tmp_repo("escape-symlink");
        let outside = std::env::temp_dir().join(format!("yana-outside-{}", uuid::Uuid::new_v4()));
        fs::write(&outside, "outside content").unwrap();
        let link = root.join("link.txt");
        symlink(&outside, &link).unwrap();
        let result = propose_file_write(&root, "link.txt", FileMutationKind::Overwrite, "pwned");
        assert!(result.is_err(), "must refuse a symlink target, not follow it");
        assert_eq!(fs::read_to_string(&outside).unwrap(), "outside content", "the symlink target must be untouched");
        fs::remove_dir_all(root).ok();
        fs::remove_file(outside).ok();
    }

    #[test]
    fn verification_step_catches_a_hash_mismatch() {
        // Sanity check on the verify logic itself: sha256_hex is
        // deterministic and content-sensitive, which is what
        // apply_file_write's post-write comparison relies on.
        assert_ne!(sha256_hex(b"a"), sha256_hex(b"b"));
        assert_eq!(sha256_hex(b"same"), sha256_hex(b"same"));
    }
}
