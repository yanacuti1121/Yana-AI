//! Canonical ZIP creation for explicit, bounded file sets.
//!
//! This is intentionally not a recursive "zip this directory" helper.
//! Callers provide an allowlist of relative regular files, so Desktop backup
//! can exclude credentials and session tokens by construction.

use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Component, Path};
use zip::write::{SimpleFileOptions, ZipWriter};
use zip::CompressionMethod;

use super::CapabilityError;

const MAX_ARCHIVE_FILES: usize = 500;
const MAX_ARCHIVE_INPUT_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveCreationResult {
    pub file_count: usize,
    pub total_input_bytes: u64,
    pub output_path: String,
}

fn archive_name(requested: &str) -> Result<String, CapabilityError> {
    let path = Path::new(requested);
    if requested.is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(CapabilityError::PathEscape {
            requested: requested.to_owned(),
        });
    }
    Ok(path
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

pub fn create_zip(
    source_root: &Path,
    output_path: &Path,
    relative_paths: &[String],
) -> Result<String, CapabilityError> {
    let result = create_zip_observation(source_root, output_path, relative_paths)?;
    super::encode("archive.create", result, false)
}

fn create_zip_observation(
    source_root: &Path,
    output_path: &Path,
    relative_paths: &[String],
) -> Result<ArchiveCreationResult, CapabilityError> {
    if relative_paths.is_empty() || relative_paths.len() > MAX_ARCHIVE_FILES {
        return Err(CapabilityError::InvalidInput {
            detail: format!("archive requires 1-{MAX_ARCHIVE_FILES} explicitly listed files"),
        });
    }
    if output_path.exists() {
        return Err(CapabilityError::InvalidInput {
            detail: format!("archive output already exists: {}", output_path.display()),
        });
    }

    let source_root = source_root
        .canonicalize()
        .map_err(|error| CapabilityError::Io {
            detail: format!("resolve archive source root: {error}"),
        })?;
    let output_parent = output_path
        .parent()
        .ok_or_else(|| CapabilityError::InvalidInput {
            detail: "archive output must have a parent directory".into(),
        })?
        .canonicalize()
        .map_err(|error| CapabilityError::Io {
            detail: format!("resolve archive output directory: {error}"),
        })?;
    let output_name = output_path
        .file_name()
        .ok_or_else(|| CapabilityError::InvalidInput {
            detail: "archive output must have a filename".into(),
        })?;
    let canonical_output = output_parent.join(output_name);
    let temporary_path = output_parent.join(format!(
        ".{}.{}.tmp",
        output_name.to_string_lossy(),
        uuid::Uuid::new_v4()
    ));

    let result = (|| {
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
            .map_err(|error| CapabilityError::Io {
                detail: format!("create temporary archive: {error}"),
            })?;
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o600);
        let mut total_input_bytes = 0u64;

        for requested in relative_paths {
            let name = archive_name(requested)?;
            let unresolved = source_root.join(requested);
            let metadata =
                fs::symlink_metadata(&unresolved).map_err(|_| CapabilityError::NotFound {
                    requested: requested.clone(),
                })?;
            if metadata.file_type().is_symlink() {
                return Err(CapabilityError::InvalidInput {
                    detail: format!("symbolic links cannot be archived: {requested}"),
                });
            }
            if !metadata.is_file() {
                return Err(CapabilityError::NotAFile {
                    requested: requested.clone(),
                });
            }
            let source = unresolved
                .canonicalize()
                .map_err(|_| CapabilityError::NotFound {
                    requested: requested.clone(),
                })?;
            if !source.starts_with(&source_root) {
                return Err(CapabilityError::PathEscape {
                    requested: requested.clone(),
                });
            }

            total_input_bytes = total_input_bytes.saturating_add(metadata.len());
            if total_input_bytes > MAX_ARCHIVE_INPUT_BYTES {
                return Err(CapabilityError::TooLarge {
                    bytes: total_input_bytes,
                    limit: MAX_ARCHIVE_INPUT_BYTES,
                });
            }

            writer
                .start_file(name, options)
                .map_err(|error| CapabilityError::Io {
                    detail: format!("start archive entry {requested}: {error}"),
                })?;
            let mut input = File::open(&source).map_err(|error| CapabilityError::Io {
                detail: format!("open archive input {requested}: {error}"),
            })?;
            io::copy(&mut input, &mut writer).map_err(|error| CapabilityError::Io {
                detail: format!("write archive entry {requested}: {error}"),
            })?;
        }

        let output = writer.finish().map_err(|error| CapabilityError::Io {
            detail: format!("finish archive: {error}"),
        })?;
        output.sync_all().map_err(|error| CapabilityError::Io {
            detail: format!("sync archive: {error}"),
        })?;
        fs::rename(&temporary_path, &canonical_output).map_err(|error| CapabilityError::Io {
            detail: format!("publish archive: {error}"),
        })?;

        Ok(ArchiveCreationResult {
            file_count: relative_paths.len(),
            total_input_bytes,
            output_path: canonical_output.to_string_lossy().into_owned(),
        })
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "yana-archive-create-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn creates_an_inspectable_archive_from_explicit_files() {
        let root = temp_dir("ok");
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("manifest.json"), b"{\"schema\":1}").unwrap();
        fs::write(root.join("nested/memory.json"), b"[]").unwrap();
        let output = root
            .parent()
            .unwrap()
            .join(format!("{}.zip", uuid::Uuid::new_v4()));

        let json = create_zip(
            &root,
            &output,
            &["manifest.json".into(), "nested/memory.json".into()],
        )
        .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["capability"], "archive.create");
        assert_eq!(parsed["data"]["file_count"], 2);
        let inspection = super::super::archive::inspect_zip(&output).unwrap();
        assert!(inspection.contains("nested/memory.json"));

        fs::remove_dir_all(root).ok();
        fs::remove_file(output).ok();
    }

    #[test]
    fn rejects_escape_and_existing_output_without_overwriting() {
        let root = temp_dir("reject");
        fs::write(root.join("safe.json"), b"{}").unwrap();
        let output = root
            .parent()
            .unwrap()
            .join(format!("{}.zip", uuid::Uuid::new_v4()));
        let escape = create_zip(&root, &output, &["../secret".into()]).unwrap_err();
        assert!(matches!(escape, CapabilityError::PathEscape { .. }));

        fs::write(&output, b"keep").unwrap();
        let exists = create_zip(&root, &output, &["safe.json".into()]).unwrap_err();
        assert!(matches!(exists, CapabilityError::InvalidInput { .. }));
        assert_eq!(fs::read(&output).unwrap(), b"keep");

        fs::remove_dir_all(root).ok();
        fs::remove_file(output).ok();
    }
}
