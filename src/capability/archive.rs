//! Roadmap Phase 6 — Archive / ZIP (items 21 ZIP Inspector, 22 Safe
//! Extraction). Deliberately does NOT call `zip::ZipArchive::extract()`
//! (the crate's own high-level convenience method) even though the
//! pinned version (8.6.0, see Cargo.lock) is well past the fix for
//! CVE-2025-29787/RUSTSEC-2025-0168 (a Zip Slip variant via symlink
//! entries in `extract()`, fixed in 2.3.0). This module implements its
//! own per-entry loop with explicit checks instead, for two reasons:
//! (1) defense in depth — a single crate's fix for one advisory
//! shouldn't be the only thing standing between an untrusted archive and
//! the filesystem; (2) the roadmap's own security requirements (entry
//! count cap, total-size cap, compression-ratio bomb detection) need
//! per-entry control that a one-shot `extract()` call doesn't offer —
//! they must be checked and able to abort BEFORE fully extracting a
//! hostile archive, not after.
//!
//! Security properties enforced here, matching the roadmap's own list:
//! - Zip Slip / path traversal: every entry's target is resolved via
//!   `ZipFile::enclosed_name()` (rejects `..` and absolute paths per its
//!   own contract) AND independently re-verified to stay under the
//!   destination root before any write.
//! - Symlink escape: any entry that is a symlink (`ZipFile::is_symlink()`)
//!   is rejected outright — this archive extractor never creates a
//!   symlink, and never writes "through" one, closing the exact class of
//!   attack the CVE above describes.
//! - Archive bomb: total uncompressed size is capped
//!   (MAX_TOTAL_UNCOMPRESSED_BYTES) and checked incrementally per entry,
//!   not after the fact; any single entry whose compression ratio exceeds
//!   MAX_COMPRESSION_RATIO is rejected before its data is read.
//! - Entry count cap (MAX_ENTRIES) — checked before iterating entries.
//! - Nested archive risk: entries whose name itself looks like an
//!   archive (.zip/.tar/.gz/.tgz/.7z/.rar) are flagged as a warning, not
//!   auto-extracted — nested extraction is explicitly out of scope.
//! - Never executes anything: this module only ever reads bytes and
//!   writes files/directories. No entry is ever spawned, sourced, or
//!   given executable permission bits from the archive's own metadata.

use serde::Serialize;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use super::CapabilityError;

const MAX_ENTRIES: usize = 5000;
const MAX_LISTED_ENTRIES: usize = 500;
const MAX_TOTAL_UNCOMPRESSED_BYTES: u64 = 500 * 1024 * 1024; // 500 MiB
const MAX_COMPRESSION_RATIO: u64 = 100;
const NESTED_ARCHIVE_EXTENSIONS: &[&str] = &["zip", "tar", "gz", "tgz", "7z", "rar"];

#[derive(Debug, Clone, Serialize)]
pub struct ZipEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ZipInspection {
    pub entry_count: usize,
    pub total_uncompressed_size: u64,
    pub total_compressed_size: u64,
    pub entries: Vec<ZipEntryInfo>,
    pub entries_truncated: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExtractionResult {
    pub extracted_files: usize,
    pub extracted_dirs: usize,
    pub total_bytes: u64,
}

fn open_archive(path: &Path) -> Result<zip::ZipArchive<File>, CapabilityError> {
    let file = File::open(path).map_err(|e| CapabilityError::Io {
        detail: format!("open archive: {e}"),
    })?;
    zip::ZipArchive::new(file).map_err(|e| CapabilityError::InvalidInput {
        detail: format!("not a valid zip archive: {e}"),
    })
}

fn is_nested_archive_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    NESTED_ARCHIVE_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

pub fn inspect_zip(zip_path: &Path) -> Result<String, CapabilityError> {
    let inspection = inspect_zip_observation(zip_path)?;
    let truncated = inspection.entries_truncated;
    super::encode("archive.inspect", inspection, truncated)
}

fn inspect_zip_observation(zip_path: &Path) -> Result<ZipInspection, CapabilityError> {
    let mut archive = open_archive(zip_path)?;
    let entry_count = archive.len();
    if entry_count > MAX_ENTRIES {
        return Err(CapabilityError::InvalidInput {
            detail: format!("archive has {entry_count} entries, exceeding the {MAX_ENTRIES} limit"),
        });
    }

    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    let mut total_uncompressed: u64 = 0;
    let mut total_compressed: u64 = 0;

    for i in 0..entry_count {
        let entry = archive.by_index(i).map_err(|e| CapabilityError::InvalidInput {
            detail: format!("reading archive entry {i}: {e}"),
        })?;
        let name = entry.name().to_string();
        let uncompressed = entry.size();
        let compressed = entry.compressed_size();

        total_uncompressed = total_uncompressed.saturating_add(uncompressed);
        total_compressed = total_compressed.saturating_add(compressed);
        if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES {
            return Err(CapabilityError::TooLarge {
                bytes: total_uncompressed,
                limit: MAX_TOTAL_UNCOMPRESSED_BYTES,
            });
        }
        if compressed > 0 && uncompressed / compressed.max(1) > MAX_COMPRESSION_RATIO {
            warnings.push(format!(
                "{name}: compression ratio exceeds {MAX_COMPRESSION_RATIO}x — possible archive bomb, not extracted"
            ));
        }
        if entry.is_symlink() {
            warnings.push(format!("{name}: symbolic link entries are never extracted"));
        }
        if is_nested_archive_name(&name) {
            warnings.push(format!("{name}: nested archive — not automatically extracted"));
        }

        if entries.len() < MAX_LISTED_ENTRIES {
            entries.push(ZipEntryInfo {
                name,
                is_dir: entry.is_dir(),
                compressed_size: compressed,
                uncompressed_size: uncompressed,
            });
        }
    }

    Ok(ZipInspection {
        entry_count,
        total_uncompressed_size: total_uncompressed,
        total_compressed_size: total_compressed,
        entries_truncated: entry_count > MAX_LISTED_ENTRIES,
        entries,
        warnings,
    })
}

/// `dest_root` must already exist and be a real, sandboxed destination
/// (the caller resolves and creates it — this function only refuses to
/// write outside it). Every entry is independently validated; a single
/// bad entry aborts the WHOLE extraction (no partial-then-fail silently
/// leaving a half-extracted, possibly-confusing tree) — the caller may
/// clean up `dest_root` on error.
pub fn extract_zip(zip_path: &Path, dest_root: &Path) -> Result<String, CapabilityError> {
    let result = extract_zip_observation(zip_path, dest_root)?;
    super::encode("archive.extract", result, false)
}

fn extract_zip_observation(zip_path: &Path, dest_root: &Path) -> Result<ExtractionResult, CapabilityError> {
    let dest_root = dest_root.canonicalize().map_err(|e| CapabilityError::Io {
        detail: format!("resolve extraction destination: {e}"),
    })?;

    let mut archive = open_archive(zip_path)?;
    let entry_count = archive.len();
    if entry_count > MAX_ENTRIES {
        return Err(CapabilityError::InvalidInput {
            detail: format!("archive has {entry_count} entries, exceeding the {MAX_ENTRIES} limit"),
        });
    }

    let mut extracted_files = 0usize;
    let mut extracted_dirs = 0usize;
    let mut total_bytes: u64 = 0;

    for i in 0..entry_count {
        let mut entry = archive.by_index(i).map_err(|e| CapabilityError::InvalidInput {
            detail: format!("reading archive entry {i}: {e}"),
        })?;
        let name = entry.name().to_string();

        if entry.is_symlink() {
            return Err(CapabilityError::InvalidInput {
                detail: format!("{name}: symbolic link entries are not permitted in an extracted archive"),
            });
        }

        // `enclosed_name()` already refuses NUL bytes, absolute paths,
        // and any path that resolves outside the current directory (see
        // this module's own doc comment) — `None` means the entry name
        // failed that check, treated as hostile, not silently skipped.
        let relative = entry.enclosed_name().ok_or_else(|| CapabilityError::PathEscape {
            requested: name.clone(),
        })?;

        // Independent re-check (defense in depth, not trusting a single
        // guarantee): reject anything with a parent-dir component after
        // our own normalization too.
        if relative.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(CapabilityError::PathEscape { requested: name });
        }

        let target = dest_root.join(&relative);
        if !target.starts_with(&dest_root) {
            return Err(CapabilityError::PathEscape { requested: name });
        }

        let uncompressed = entry.size();
        total_bytes = total_bytes.saturating_add(uncompressed);
        if total_bytes > MAX_TOTAL_UNCOMPRESSED_BYTES {
            return Err(CapabilityError::TooLarge {
                bytes: total_bytes,
                limit: MAX_TOTAL_UNCOMPRESSED_BYTES,
            });
        }
        let compressed = entry.compressed_size();
        if compressed > 0 && uncompressed / compressed.max(1) > MAX_COMPRESSION_RATIO {
            return Err(CapabilityError::InvalidInput {
                detail: format!("{name}: compression ratio exceeds {MAX_COMPRESSION_RATIO}x — refusing to extract a likely archive bomb"),
            });
        }

        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| CapabilityError::Io {
                detail: format!("create directory {}: {e}", target.display()),
            })?;
            extracted_dirs += 1;
            continue;
        }

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| CapabilityError::Io {
                detail: format!("create directory {}: {e}", parent.display()),
            })?;
        }
        let mut buf = Vec::with_capacity(uncompressed.min(MAX_TOTAL_UNCOMPRESSED_BYTES) as usize);
        entry.read_to_end(&mut buf).map_err(|e| CapabilityError::Io {
            detail: format!("read entry {name}: {e}"),
        })?;
        fs::write(&target, &buf).map_err(|e| CapabilityError::Io {
            detail: format!("write {}: {e}", target.display()),
        })?;
        // Never propagate the archive's own executable bit or any other
        // permission metadata — extracted files get the OS default,
        // matching "never auto-run extracted content" (nothing in this
        // path is ever marked executable because Yana extracted it).
        extracted_files += 1;
    }

    Ok(ExtractionResult {
        extracted_files,
        extracted_dirs,
        total_bytes,
    })
}

pub const __TEST_ONLY_MAX_ENTRIES: usize = MAX_ENTRIES;
pub const __TEST_ONLY_MAX_TOTAL_UNCOMPRESSED_BYTES: u64 = MAX_TOTAL_UNCOMPRESSED_BYTES;
pub const __TEST_ONLY_MAX_COMPRESSION_RATIO: u64 = MAX_COMPRESSION_RATIO;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::{SimpleFileOptions, ZipWriter};
    use zip::CompressionMethod;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yana-archive-{label}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8], Option<u32>)]) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        for (name, content, unix_mode) in entries {
            let mut options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            if let Some(mode) = unix_mode {
                options = options.unix_permissions(*mode);
            }
            if name.ends_with('/') {
                writer.add_directory(*name, options).unwrap();
            } else {
                writer.start_file(*name, options).unwrap();
                writer.write_all(content).unwrap();
            }
        }
        writer.finish().unwrap();
    }

    #[test]
    fn inspect_reports_real_entries_and_sizes() {
        let dir = temp_dir("inspect");
        let zip_path = dir.join("sample.zip");
        write_zip(&zip_path, &[("hello.txt", b"hello world", None), ("dir/", b"", None)]);

        let json = inspect_zip(&zip_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["capability"], "archive.inspect");
        assert_eq!(parsed["data"]["entry_count"], 2);
        assert!(json.contains("hello.txt"));

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn inspect_flags_a_zip_bomb_style_compression_ratio_as_a_warning_not_an_error() {
        let dir = temp_dir("bomb-inspect");
        let zip_path = dir.join("bomb.zip");
        // Highly repetitive content compresses far past the ratio
        // threshold under Deflate even though Stored was used above for
        // other tests — use Deflate here specifically to get real
        // compression.
        let file = File::create(&zip_path).unwrap();
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        writer.start_file("bomb.txt", options).unwrap();
        writer.write_all(&vec![0u8; 2_000_000]).unwrap();
        writer.finish().unwrap();

        let json = inspect_zip(&zip_path).unwrap();
        assert!(json.contains("possible archive bomb"), "expected a bomb warning, got: {json}");

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn inspect_rejects_archive_over_the_entry_limit() {
        let dir = temp_dir("too-many");
        let zip_path = dir.join("many.zip");
        let file = File::create(&zip_path).unwrap();
        let mut writer = ZipWriter::new(file);
        for i in 0..(__TEST_ONLY_MAX_ENTRIES + 1) {
            writer.start_file(format!("f{i}.txt"), SimpleFileOptions::default()).unwrap();
        }
        writer.finish().unwrap();

        let err = inspect_zip(&zip_path).unwrap_err();
        assert!(matches!(err, CapabilityError::InvalidInput { .. }));

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn inspect_rejects_a_non_zip_file() {
        let dir = temp_dir("not-a-zip");
        let path = dir.join("not-a-zip.zip");
        fs::write(&path, b"this is not a zip file").unwrap();

        let err = inspect_zip(&path).unwrap_err();
        assert!(matches!(err, CapabilityError::InvalidInput { .. }));

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn extract_writes_real_files_and_directories_within_dest() {
        let src_dir = temp_dir("extract-src");
        let zip_path = src_dir.join("payload.zip");
        write_zip(&zip_path, &[("a.txt", b"one", None), ("nested/b.txt", b"two", None)]);
        let dest = temp_dir("extract-dest");

        let json = extract_zip(&zip_path, &dest).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["capability"], "archive.extract");
        assert_eq!(parsed["data"]["extracted_files"], 2);

        assert_eq!(fs::read_to_string(dest.join("a.txt")).unwrap(), "one");
        assert_eq!(fs::read_to_string(dest.join("nested/b.txt")).unwrap(), "two");

        fs::remove_dir_all(src_dir).ok();
        fs::remove_dir_all(dest).ok();
    }

    #[test]
    fn extract_rejects_symlink_entries() {
        let src_dir = temp_dir("extract-symlink-src");
        let zip_path = src_dir.join("evil.zip");
        // A real symlink entry (via the crate's own add_symlink — plain
        // unix_permissions() deliberately discards the S_IFLNK type bits,
        // per its own doc comment) pointing outside the extraction root —
        // the exact CVE-2025-29787 shape.
        let file = File::create(&zip_path).unwrap();
        let mut writer = ZipWriter::new(file);
        writer.add_symlink("link", "../../../../etc", SimpleFileOptions::default()).unwrap();
        writer.finish().unwrap();
        let dest = temp_dir("extract-symlink-dest");

        let err = extract_zip(&zip_path, &dest).unwrap_err();
        assert!(matches!(err, CapabilityError::InvalidInput { .. }));
        assert!(!dest.join("link").exists());

        fs::remove_dir_all(src_dir).ok();
        fs::remove_dir_all(dest).ok();
    }

    #[test]
    fn extract_rejects_an_oversized_archive() {
        let src_dir = temp_dir("extract-huge-src");
        let zip_path = src_dir.join("huge.zip");
        write_zip(&zip_path, &[("huge.bin", &vec![0u8; (__TEST_ONLY_MAX_TOTAL_UNCOMPRESSED_BYTES + 1) as usize], None)]);
        let dest = temp_dir("extract-huge-dest");

        let err = extract_zip(&zip_path, &dest).unwrap_err();
        assert!(matches!(err, CapabilityError::TooLarge { .. }));

        fs::remove_dir_all(src_dir).ok();
        fs::remove_dir_all(dest).ok();
    }

    #[test]
    fn extract_rejects_missing_destination() {
        let src_dir = temp_dir("extract-missing-dest-src");
        let zip_path = src_dir.join("payload.zip");
        write_zip(&zip_path, &[("a.txt", b"one", None)]);
        let missing_dest = std::env::temp_dir().join(format!("yana-archive-missing-{}", uuid::Uuid::new_v4()));

        let err = extract_zip(&zip_path, &missing_dest).unwrap_err();
        assert!(matches!(err, CapabilityError::Io { .. }));

        fs::remove_dir_all(src_dir).ok();
    }
}
