//! Read-only repository observation capabilities: tree, read, search.
//! Moved as-is from the original single-file `capability/mod.rs` — bodies
//! unchanged, error type changed from `String` to `CapabilityError`.

use super::error::CapabilityError;
use super::{encode, MAX_READ_BYTES, MAX_SEARCH_FILE_BYTES, MAX_SEARCH_RESULTS, MAX_TREE_ENTRIES};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn resolve_existing(root: &Path, requested: &str) -> Result<PathBuf, CapabilityError> {
    let root = root.canonicalize().map_err(|e| CapabilityError::Io {
        detail: format!("resolve repo root: {e}"),
    })?;
    let path = root
        .join(requested)
        .canonicalize()
        .map_err(|_| CapabilityError::NotFound {
            requested: requested.to_string(),
        })?;
    if !path.starts_with(&root) {
        return Err(CapabilityError::PathEscape {
            requested: requested.to_string(),
        });
    }
    Ok(path)
}

#[derive(Serialize)]
struct TreeEntry {
    path: String,
    kind: &'static str,
    size_bytes: Option<u64>,
}

pub fn repo_tree(root: &Path, requested: &str, depth: usize) -> Result<String, CapabilityError> {
    let base = resolve_existing(root, requested)?;
    if !base.is_dir() {
        return Err(CapabilityError::NotADirectory {
            requested: requested.to_string(),
        });
    }
    let mut entries = Vec::new();
    let truncated = walk(root, &base, 0, depth.min(5), &mut entries)?;
    encode(
        "repo.tree",
        serde_json::json!({"path": requested, "depth": depth.min(5), "entries": entries}),
        truncated,
    )
}

fn walk(
    root: &Path,
    current: &Path,
    level: usize,
    max_depth: usize,
    out: &mut Vec<TreeEntry>,
) -> Result<bool, CapabilityError> {
    let mut children = fs::read_dir(current)
        .map_err(|e| CapabilityError::Io {
            detail: e.to_string(),
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CapabilityError::Io {
            detail: e.to_string(),
        })?;
    children.sort_by_key(|e| e.file_name());
    for child in children {
        if out.len() >= MAX_TREE_ENTRIES {
            return Ok(true);
        }
        let name = child.file_name();
        if matches!(
            name.to_str(),
            Some(".git" | "target" | "node_modules" | ".venv" | "__pycache__")
        ) {
            continue;
        }
        let path = child.path();
        let meta = child.metadata().map_err(|e| CapabilityError::Io {
            detail: e.to_string(),
        })?;
        out.push(TreeEntry {
            path: path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned(),
            kind: if meta.is_dir() { "directory" } else { "file" },
            size_bytes: meta.is_file().then_some(meta.len()),
        });
        if meta.is_dir() && level < max_depth && walk(root, &path, level + 1, max_depth, out)? {
            return Ok(true);
        }
    }
    Ok(false)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileReadObservation {
    pub path: String,
    pub size_bytes: u64,
    pub content: String,
}

pub fn read_file_observation(
    root: &Path,
    requested: &str,
) -> Result<FileReadObservation, CapabilityError> {
    let path = resolve_existing(root, requested)?;
    let meta = fs::metadata(&path).map_err(|e| CapabilityError::Io {
        detail: e.to_string(),
    })?;
    if !meta.is_file() {
        return Err(CapabilityError::NotAFile {
            requested: requested.to_string(),
        });
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(CapabilityError::TooLarge {
            bytes: meta.len(),
            limit: MAX_READ_BYTES,
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::InvalidData {
            CapabilityError::InvalidUtf8 {
                requested: requested.to_string(),
            }
        } else {
            CapabilityError::Io {
                detail: format!("read UTF-8 file: {e}"),
            }
        }
    })?;
    Ok(FileReadObservation {
        path: requested.to_string(),
        size_bytes: meta.len(),
        content,
    })
}

pub fn read_file(root: &Path, requested: &str) -> Result<String, CapabilityError> {
    let observation = read_file_observation(root, requested)?;
    encode("repo.read", observation, false)
}

pub fn search_code(root: &Path, requested: &str, query: &str) -> Result<String, CapabilityError> {
    if query.trim().is_empty() {
        return Err(CapabilityError::InvalidInput {
            detail: "query must not be empty".into(),
        });
    }
    let base = resolve_existing(root, requested)?;
    let mut stack = vec![base];
    let mut matches = Vec::new();
    let needle = query.to_lowercase();
    let mut truncated = false;
    while let Some(path) = stack.pop() {
        if matches.len() >= MAX_SEARCH_RESULTS {
            truncated = true;
            break;
        }
        let meta = match fs::symlink_metadata(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            if matches!(
                path.file_name().and_then(|s| s.to_str()),
                Some(".git" | "target" | "node_modules" | ".venv" | "__pycache__")
            ) {
                continue;
            }
            if let Ok(rd) = fs::read_dir(&path) {
                stack.extend(rd.filter_map(Result::ok).map(|e| e.path()));
            }
            continue;
        }
        if !meta.is_file() || meta.len() > MAX_SEARCH_FILE_BYTES {
            continue;
        }
        let text = match fs::read_to_string(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        for (idx, line) in text.lines().enumerate() {
            if line.to_lowercase().contains(&needle) {
                matches.push(serde_json::json!({"path": path.strip_prefix(root).unwrap_or(&path), "line": idx + 1, "text": line.chars().take(500).collect::<String>()}));
                if matches.len() >= MAX_SEARCH_RESULTS {
                    truncated = true;
                    break;
                }
            }
        }
    }
    encode(
        "repo.search",
        serde_json::json!({"path": requested, "query": query, "matches": matches}),
        truncated,
    )
}

#[cfg(test)]
#[path = "repo_tests.rs"]
mod tests;
