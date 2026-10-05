//! A private copy of the working directory for one command (WS6 E1b, contract section 15).
//!
//! The container never sees the real working directory. Before a run the tree is copied
//! into a directory only Yana can reach, leaving out what a command must not see or reach:
//! `.git` and `.yana-ai`, files and folders with secret-looking names, symbolic links, hard
//! links and anything that is not a plain file. The container works on that copy. Afterwards
//! `staging_sync` copies changes back, checked, and the copy is removed. With nothing real
//! mounted there is nothing for a command to rename, no secret inside the container, and no
//! window between checking a path and using it.

use crate::capability::CapabilityError;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
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
/// Device and inode: what a file or folder is, whatever it is called.
pub(super) type FileId = (u64, u64);

/// The copy: where it is, and what was known about the original when it was made.
pub(super) struct Staging {
    parent: PathBuf,
    /// The copy itself (what the container sees as `/work`), inside a private parent.
    pub dir: PathBuf,
    /// Fingerprint of every file as it was copied in.
    pub baseline: BTreeMap<String, Digest32>,
    /// Short notes on what was left out of the copy (never the contents).
    pub left_out: Vec<String>,
    /// Identity of every item left out for its name (`.git`, a secret folder, a vendored
    /// folder...). A name on this machine that turns out to be one of them, however it is
    /// spelled (a case-insensitive disk folds some letters), is never written to.
    pub protected: HashSet<FileId>,
}

impl Drop for Staging {
    fn drop(&mut self) {
        force_remove(&self.parent);
    }
}

/// Remove a tree even when a command made folders in it unreadable. Does not follow links.
pub(super) fn force_remove(path: &Path) {
    #[cfg(unix)]
    {
        fn open_up(dir: &Path, depth: usize) {
            use std::os::unix::fs::PermissionsExt;
            if depth > 64 {
                return;
            }
            let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
            let Ok(entries) = std::fs::read_dir(dir) else { return };
            for entry in entries.flatten() {
                if entry.file_type().is_ok_and(|t| t.is_dir()) {
                    open_up(&entry.path(), depth + 1);
                }
            }
        }
        open_up(path, 0);
    }
    let _ = std::fs::remove_dir_all(path);
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
    std::os::unix::fs::OpenOptionsExt::custom_flags(&mut options, libc::O_NOFOLLOW | libc::O_NONBLOCK);
    options.open(path)
}

/// The identity of an item without following a link.
#[cfg(unix)]
pub(super) fn id_of(meta: &std::fs::Metadata) -> FileId {
    (std::os::unix::fs::MetadataExt::dev(meta), std::os::unix::fs::MetadataExt::ino(meta))
}

#[cfg(unix)]
fn link_count(meta: &std::fs::Metadata) -> u64 {
    std::os::unix::fs::MetadataExt::nlink(meta)
}

/// A mode a copied file may keep: owner and group bits as they are, nothing for others to
/// write, and never setuid, setgid or sticky.
#[cfg(unix)]
pub(super) fn plain_mode(mode: u32) -> u32 {
    mode & 0o755
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
        #[cfg(not(unix))]
        {
            let _ = (root, base, limits);
            Err(invalid("running in a container is only supported on Unix systems"))
        }
        #[cfg(unix)]
        {
            let parent = base.join(format!("yana-exec-{}", uuid::Uuid::new_v4().simple()));
            let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot create the private copy: {error}") };
            make_private_dir(&parent).map_err(io)?;
            let dir = parent.join("work");
            let made = make_private_dir(&dir);
            let mut staging = Staging { parent, dir, baseline: BTreeMap::new(), left_out: Vec::new(), protected: HashSet::new() };
            made.map_err(io)?;
            staging.fill(root, limits)?;
            Ok(staging)
        }
    }

    /// The files that were copied in (relative paths, sorted).
    pub(super) fn files(&self) -> Vec<String> {
        self.baseline.keys().cloned().collect()
    }

    /// A new, empty private copy that shares what is known of this one (the fingerprints and
    /// the protected items): where a remote machine's result is received before it is checked
    /// and copied back.
    pub(super) fn receiving(&self, base: &Path) -> Result<Staging, CapabilityError> {
        let parent = base.join(format!("yana-exec-{}", uuid::Uuid::new_v4().simple()));
        let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot create the private copy: {error}") };
        make_private_dir(&parent).map_err(io)?;
        let dir = parent.join("work");
        let made = make_private_dir(&dir);
        let staging = Staging { parent, dir, baseline: self.baseline.clone(), left_out: Vec::new(), protected: self.protected.clone() };
        made.map_err(io)?;
        Ok(staging)
    }

    fn note(&mut self, relative: &str, reason: &str) {
        const MAX_NOTES: usize = 20;
        if self.left_out.len() < MAX_NOTES {
            self.left_out.push(format!("{relative} ({reason})"));
        }
    }

    #[cfg(unix)]
    fn fill(&mut self, root: &Path, limits: StagingLimits) -> Result<(), CapabilityError> {
        let (mut files, mut bytes) = (0usize, 0u64);
        let mut stack = vec![(String::new(), 0usize)];
        while let Some((relative_dir, depth)) = stack.pop() {
            let source_dir = if relative_dir.is_empty() { root.to_path_buf() } else { root.join(&relative_dir) };
            let entries = std::fs::read_dir(&source_dir).map_err(|error| CapabilityError::Io { detail: format!("cannot read {}: {error}", source_dir.display()) })?;
            for entry in entries {
                let Ok(entry) = entry else { continue };
                let Ok(meta) = entry.metadata() else { continue };
                let kind = meta.file_type();
                let Ok(name) = entry.file_name().into_string() else {
                    self.note("(a name that is not valid UTF-8)", "left out");
                    continue;
                };
                let relative = if relative_dir.is_empty() { name } else { format!("{relative_dir}/{name}") };
                if relative.contains(|c: char| c.is_control()) {
                    self.note("(a name with a control character)", "left out");
                } else if let Some(reason) = excluded(&relative) {
                    self.protected.insert(id_of(&meta));
                    self.note(&relative, reason);
                } else if kind.is_symlink() {
                    self.note(&relative, "symbolic link");
                } else if kind.is_dir() {
                    if depth + 1 > limits.max_depth {
                        return Err(invalid(format!("the working directory is nested deeper than {} levels: it is not copied for a container", limits.max_depth)));
                    }
                    std::fs::create_dir(self.dir.join(&relative)).map_err(|error| CapabilityError::Io { detail: format!("cannot create {relative} in the copy: {error}") })?;
                    stack.push((relative, depth + 1));
                } else if kind.is_file() && link_count(&meta) > 1 {
                    // It may be a second name for a secret kept under a name that looks harmless.
                    self.note(&relative, "hard link");
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

    #[cfg(not(unix))]
    fn fill(&mut self, _root: &Path, _limits: StagingLimits) -> Result<(), CapabilityError> {
        Err(invalid("running in a container is only supported on Unix systems"))
    }

    /// Copy one file, hashing as it goes; refuses to pass `room` bytes.
    #[cfg(unix)]
    fn copy_file(&self, source: &Path, relative: &str, room: u64) -> Result<(Digest32, u64), CapabilityError> {
        let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot copy {relative}: {error}") };
        let mut input = open_plain(source).map_err(io)?;
        if !input.metadata().map_err(io)?.is_file() {
            return Err(invalid(format!("{relative} stopped being a plain file while it was copied")));
        }
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
        if let Ok(meta) = input.metadata() {
            let mode = plain_mode(std::os::unix::fs::PermissionsExt::mode(&meta.permissions()));
            let _ = std::fs::set_permissions(self.dir.join(relative), std::os::unix::fs::PermissionsExt::from_mode(mode));
        }
        Ok((hasher.finalize().into(), total))
    }
}
