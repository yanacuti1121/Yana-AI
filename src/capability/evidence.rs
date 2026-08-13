//! Evidence metadata attached to tool results (AD-14/AD-15).
//!
//! Named `ToolEvidence`, not `Evidence` — `crate::evidence` already owns
//! that name for a different, stronger guarantee (HMAC-signed command
//! receipts for the Truth Gate, keyed by `YANA_EVIDENCE_KEY`). This type is
//! weaker and deliberately so: it's descriptive metadata about what a
//! capability call actually touched (path, size, hash, mtime), not a
//! forgery-proof signature. Every field is either the real, freshly-observed
//! value or `None` — never a placeholder standing in for data we didn't
//! actually collect.

use super::error::CapabilityError;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ToolEvidence {
    pub canonical_path: Option<String>,
    pub byte_count: Option<u64>,
    pub sha256: Option<String>,
    /// RFC3339 UTC timestamp, when the filesystem provides one.
    pub modified_at: Option<String>,
    pub session_id: Option<String>,
    /// Always present — generated fresh for this call, never reused.
    pub request_id: String,
}

impl ToolEvidence {
    /// For capabilities with no single backing file (git status, host
    /// summary, process listing): only identity fields are real, the rest
    /// stay `None` rather than being filled with a fabricated value.
    pub fn without_file(session_id: Option<String>) -> Self {
        Self {
            canonical_path: None,
            byte_count: None,
            sha256: None,
            modified_at: None,
            session_id,
            request_id: new_request_id(),
        }
    }

    /// Computes real evidence for a file that was actually read: real
    /// canonical path, real byte count, real SHA-256 of the bytes on disk,
    /// real mtime. Errors (not fabricates) if any of those can't be
    /// observed.
    pub fn for_file(path: &Path, session_id: Option<String>) -> Result<Self, CapabilityError> {
        let canonical = path.canonicalize().map_err(|error| CapabilityError::Io {
            detail: format!("evidence: canonicalize {}: {error}", path.display()),
        })?;
        let bytes = fs::read(&canonical).map_err(|error| CapabilityError::Io {
            detail: format!("evidence: read {}: {error}", canonical.display()),
        })?;
        let meta = fs::metadata(&canonical).map_err(|error| CapabilityError::Io {
            detail: format!("evidence: metadata {}: {error}", canonical.display()),
        })?;
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let sha256 = format!("{:x}", hasher.finalize());
        let modified_at = meta.modified().ok().and_then(|t| {
            t.duration_since(UNIX_EPOCH)
                .ok()
                .and_then(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
                .map(|dt| dt.to_rfc3339())
        });
        Ok(Self {
            canonical_path: Some(canonical.to_string_lossy().into_owned()),
            byte_count: Some(bytes.len() as u64),
            sha256: Some(sha256),
            modified_at,
            session_id,
            request_id: new_request_id(),
        })
    }
}

fn new_request_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(tag: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("yana-evidence-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn for_file_computes_real_hash_and_size() {
        let dir = tmp_dir("hash");
        let file = dir.join("a.txt");
        fs::write(&file, "hello").unwrap();

        let evidence = ToolEvidence::for_file(&file, Some("sess-1".into())).unwrap();
        assert_eq!(evidence.byte_count, Some(5));
        assert_eq!(
            evidence.sha256.as_deref(),
            Some("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
        );
        assert_eq!(evidence.session_id.as_deref(), Some("sess-1"));
        assert!(evidence.canonical_path.unwrap().ends_with("a.txt"));
        assert!(!evidence.request_id.is_empty());

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn without_file_leaves_file_fields_none() {
        let evidence = ToolEvidence::without_file(None);
        assert!(evidence.canonical_path.is_none());
        assert!(evidence.byte_count.is_none());
        assert!(evidence.sha256.is_none());
        assert!(evidence.modified_at.is_none());
        assert!(!evidence.request_id.is_empty());
    }

    #[test]
    fn for_file_errors_on_missing_file() {
        let dir = tmp_dir("missing");
        let missing = dir.join("nope.txt");
        assert!(ToolEvidence::for_file(&missing, None).is_err());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn two_calls_get_distinct_request_ids() {
        let a = ToolEvidence::without_file(None);
        let b = ToolEvidence::without_file(None);
        assert_ne!(a.request_id, b.request_id);
    }
}
