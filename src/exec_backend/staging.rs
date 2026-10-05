//! A private copy of the working directory for one command (WS6 E1b, contract section 14).
//!
//! The container never sees the real working directory. Before a run the tree is copied
//! into a directory only Yana can reach, leaving out what a command must not see or reach:
//! `.git` and `.yana-ai`, files and folders with secret-looking names, symbolic links, and
//! anything that is not a plain file. The container works on that copy. Afterwards
//! `staging_sync` copies changes back, checked, and the copy is removed. With nothing real
//! mounted there is nothing for a command to rename, no secret inside the container, and no
//! window between checking a path and using it.

use crate::capability::CapabilityError;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// Folders that are neither copied in nor copied back: other people's files, large, and
/// rebuilt by tools. The disclosure says so.
pub(super) const VENDORED: [&str; 8] = ["node_modules", "target", ".venv", "venv", "__pycache__", "dist", "build", ".next"];
/// Folders whose contents decide what runs on this machine later, or hold Yana's own records.
pub(super) const PROTECTED: [&str; 2] = [".git", ".yana-ai"];

/// How much of the working directory may be copied in, and how much may come back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StagingLimits {
    pub max_files: usize,
    pub max_bytes: u64,
    pub max_depth: usize,
}

impl Default for StagingLimits {
    fn default() -> Self {
        Self { max_files: 20_000, max_bytes: 256 * 1024 * 1024, max_depth: 16 }
    }
}

pub(super) type Digest32 = [u8; 32];

/// The copy: where it is, and the fingerprint of every file as it was copied in.
pub(super) struct Staging {
    pub dir: PathBuf,
    pub baseline: BTreeMap<String, Digest32>,
    /// Short notes on what was left out of the copy (never the contents).
    pub left_out: Vec<String>,
}

impl Drop for Staging {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

/// Why a path (relative, `/` separated) is not part of the copy, if it is not.
pub(super) fn excluded(relative: &str) -> Option<&'static str> {
    let lower = relative.to_ascii_lowercase();
    for part in lower.split('/') {
        if PROTECTED.contains(&part) {
            return Some("protected folder");
        }
        if VENDORED.contains(&part) {
            return Some("vendored or build folder");
        }
    }
    crate::lsp_client::operation::sensitive_path(relative).then_some("secret-looking name")
}

pub(super) fn hash_file(path: &Path) -> std::io::Result<Digest32> {
    let mut file = open_plain(path)?;
    let mut hasher = Sha256::new();
    let mut chunk = [0u8; 65536];
    loop {
        let n = file.read(&mut chunk)?;
        if n == 0 {
            return Ok(hasher.finalize().into());
        }
        hasher.update(&chunk[..n]);
    }
}

/// Open for reading without following a symbolic link at the last component.
pub(super) fn open_plain(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::custom_flags(&mut options, libc::O_NOFOLLOW);
    options.open(path)
}

/// A mode a copied file may keep: its permission bits, never setuid, setgid or sticky.
#[cfg(unix)]
pub(super) fn plain_mode(mode: u32) -> u32 {
    mode & 0o777
}

fn make_private_dir(path: &Path) -> std::io::Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(path)
}

impl Staging {
    /// Copy `root` into a new private directory under `base`.
    pub(super) fn copy_in(root: &Path, base: &Path, limits: StagingLimits) -> Result<Staging, CapabilityError> {
        let dir = base.join(format!("yana-exec-{}", uuid::Uuid::new_v4().simple()));
        make_private_dir(&dir).map_err(|error| CapabilityError::Io { detail: format!("cannot create the private copy: {error}") })?;
        let mut staging = Staging { dir, baseline: BTreeMap::new(), left_out: Vec::new() };
        staging.fill(root, limits)?;
        Ok(staging)
    }

    fn note(&mut self, relative: &str, reason: &str) {
        const MAX_NOTES: usize = 20;
        if self.left_out.len() < MAX_NOTES {
            self.left_out.push(format!("{relative} ({reason})"));
        }
    }

    fn fill(&mut self, root: &Path, limits: StagingLimits) -> Result<(), CapabilityError> {
        let (mut files, mut bytes) = (0usize, 0u64);
        let mut stack = vec![(String::new(), 0usize)];
        while let Some((relative_dir, depth)) = stack.pop() {
            let source_dir = if relative_dir.is_empty() { root.to_path_buf() } else { root.join(&relative_dir) };
            let entries = std::fs::read_dir(&source_dir).map_err(|error| CapabilityError::Io { detail: format!("cannot read {}: {error}", source_dir.display()) })?;
            for entry in entries {
                let Ok(entry) = entry else { continue };
                let Ok(kind) = entry.file_type() else { continue };
                let Ok(name) = entry.file_name().into_string() else {
                    self.note("(a name that is not valid UTF-8)", "left out");
                    continue;
                };
                let relative = if relative_dir.is_empty() { name } else { format!("{relative_dir}/{name}") };
                if relative.contains(|c: char| c.is_control()) {
                    self.note("(a name with a control character)", "left out");
                } else if let Some(reason) = excluded(&relative) {
                    self.note(&relative, reason);
                } else if kind.is_symlink() {
                    self.note(&relative, "symbolic link");
                } else if kind.is_dir() {
                    if depth + 1 > limits.max_depth {
                        return Err(invalid(format!("the working directory is nested deeper than {} levels: it is not copied for a container", limits.max_depth)));
                    }
                    std::fs::create_dir(self.dir.join(&relative)).map_err(|error| CapabilityError::Io { detail: format!("cannot create {relative} in the copy: {error}") })?;
                    stack.push((relative, depth + 1));
                } else if kind.is_file() {
                    files += 1;
                    if files > limits.max_files {
                        return Err(invalid(format!("more than {} files to copy for a container", limits.max_files)));
                    }
                    let (digest, size) = self.copy_file(&entry.path(), &relative, limits.max_bytes.saturating_sub(bytes))?;
                    bytes += size;
                    self.baseline.insert(relative, digest);
                } else {
                    self.note(&relative, "not a plain file");
                }
            }
        }
        Ok(())
    }

    /// Copy one file, hashing as it goes; refuses to pass `room` bytes.
    fn copy_file(&self, source: &Path, relative: &str, room: u64) -> Result<(Digest32, u64), CapabilityError> {
        let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot copy {relative}: {error}") };
        let mut input = open_plain(source).map_err(io)?;
        let mut output = std::fs::OpenOptions::new().write(true).create_new(true).open(self.dir.join(relative)).map_err(io)?;
        let (mut hasher, mut total, mut chunk) = (Sha256::new(), 0u64, [0u8; 65536]);
        loop {
            let n = input.read(&mut chunk).map_err(io)?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > room {
                return Err(invalid("more bytes to copy for a container than the limit allows"));
            }
            hasher.update(&chunk[..n]);
            output.write_all(&chunk[..n]).map_err(io)?;
        }
        #[cfg(unix)]
        if let Ok(meta) = input.metadata() {
            let mode = plain_mode(std::os::unix::fs::PermissionsExt::mode(&meta.permissions()));
            let _ = std::fs::set_permissions(self.dir.join(relative), std::os::unix::fs::PermissionsExt::from_mode(mode));
        }
        Ok((hasher.finalize().into(), total))
    }
}
