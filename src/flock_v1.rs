//! Production `flock-v1` locking primitive for Unix and Windows.
//!
//! The canonical lock is a stable regular file. It is never truncated,
//! renamed, reclaimed, or unlinked. Kernel ownership is tied to the acquired
//! file descriptor (Unix `flock(2)`) or exclusive share-mode handle (Windows
//! `share_mode(0)`) and is released on close or process death.
//!
//! `FlockGuard::clear_cloexec_for_exec` and the `guard lock-with` CLI
//! subcommand that uses it remain Unix-only: they hold the lock across
//! `Command::exec()`, a process-image-replacement primitive Windows has no
//! equivalent for.

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::fs::File;
#[cfg(any(unix, windows))]
use std::fs::OpenOptions;
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
#[cfg(unix)]
use std::os::unix::{fs::OpenOptionsExt, io::AsRawFd};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
#[cfg(any(unix, windows))]
use std::time::Instant;

pub const LOCK_ROOT: &str = ".claude/state/locks";
pub const PROTOCOL_FILE: &str = ".claude/state/locking-protocol-version";
pub const MAINTENANCE_FILE: &str = ".claude/state/locking-maintenance";
pub const PROTOCOL_VERSION: &str = "flock-v1";
pub const TEST_MODE_ENV: &str = "YANA_LOCKING_PROTOCOL_MODE";
#[cfg(any(unix, windows))]
const POLL_INTERVAL: Duration = Duration::from_millis(50);

pub fn protocol_is_active(project_root: &Path) -> Result<()> {
    let maintenance = project_root.join(MAINTENANCE_FILE);
    if maintenance.exists() {
        bail!(
            "flock-v1 maintenance gate is active: {}; do not launch hooks",
            maintenance.display()
        );
    }
    if std::env::var(TEST_MODE_ENV).ok().as_deref() == Some("test") {
        return Ok(());
    }
    let marker = project_root.join(PROTOCOL_FILE);
    let value = std::fs::read_to_string(&marker)
        .with_context(|| format!("flock-v1 protocol marker missing: {}", marker.display()))?;
    if value.trim() != PROTOCOL_VERSION {
        bail!(
            "flock-v1 protocol marker mismatch at {} (expected {PROTOCOL_VERSION})",
            marker.display()
        );
    }
    Ok(())
}

pub fn project_root_from_env() -> Result<PathBuf> {
    let value = std::env::var("CLAUDE_PROJECT_DIR")
        .or_else(|_| std::env::var("YANA_PROJECT_ROOT"))
        .map_err(|_| {
            anyhow::anyhow!("flock-v1 requires explicit CLAUDE_PROJECT_DIR or YANA_PROJECT_ROOT")
        })?;
    normalize_absolute(Path::new(&value))
}

pub fn canonical_identity(resource: &str, project_root: &Path) -> Result<String> {
    if let Some(key) = resource.strip_prefix("key:") {
        return canonical_key(key);
    }
    let root = normalize_absolute(project_root)?;
    let input = Path::new(resource);
    let candidate = if input.is_absolute() {
        input.to_path_buf()
    } else {
        root.join(input)
    };
    let normalized = normalize_absolute(&candidate)?;
    let relative = normalized
        .strip_prefix(&root)
        .map_err(|_| anyhow::anyhow!("flock-v1 resource escapes project root: {resource}"))?;
    if relative.as_os_str().is_empty() {
        bail!("flock-v1 resource must name a file");
    }
    let utf8 = relative
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("flock-v1 resource is not UTF-8"))?;
    Ok(format!("path/{}", utf8.replace('\\', "/")))
}

fn normalize_absolute(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() {
        bail!("flock-v1 path must be absolute");
    }
    let mut normalized = PathBuf::from("/");
    for component in path.components() {
        match component {
            Component::RootDir | Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(value) => normalized.push(value),
            Component::Prefix(_) => bail!("flock-v1 only supports POSIX paths"),
        }
    }
    Ok(normalized)
}

fn canonical_key(key: &str) -> Result<String> {
    if key.is_empty() || key.starts_with('/') || key.contains('\0') {
        bail!("flock-v1 key must be a non-empty relative UTF-8 key");
    }
    let mut parts = Vec::new();
    for component in key.split('/') {
        match component {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    bail!("flock-v1 key escapes logical root");
                }
            }
            value => parts.push(value),
        }
    }
    if parts.is_empty() {
        bail!("flock-v1 key must name a resource");
    }
    Ok(format!("key/{}", parts.join("/")))
}

pub fn lock_name(identity: &str) -> String {
    let digest = Sha256::digest(identity.as_bytes());
    let suffix: String = digest
        .iter()
        .take(4)
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let prefix: String = identity
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character
            } else {
                '_'
            }
        })
        .take(48)
        .collect();
    format!("{prefix}-{suffix}")
}

pub fn lock_path(project_root: &Path, identity: &str) -> PathBuf {
    project_root
        .join(LOCK_ROOT)
        .join(format!("{}.lock", lock_name(identity)))
}

#[cfg(any(unix, windows))]
fn ensure_lock_root(project_root: &Path) -> Result<PathBuf> {
    let mut current = project_root.to_path_buf();
    for component in [".claude", "state", "locks"] {
        current.push(component);
        match std::fs::create_dir(&current) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("creating flock-v1 directory {}", current.display()));
            }
        }
        let file_type = std::fs::symlink_metadata(&current)?.file_type();
        if file_type.is_symlink() || !file_type.is_dir() {
            bail!(
                "flock-v1 lock root component must be a real directory: {}",
                current.display()
            );
        }
    }
    Ok(current)
}

#[cfg(any(unix, windows))]
fn reject_non_regular_lock_path(path: &Path) -> Result<()> {
    if path.exists() && !path.symlink_metadata()?.file_type().is_file() {
        bail!(
            "flock-v1 lock path must be a regular file: {}",
            path.display()
        );
    }
    Ok(())
}

pub struct FlockGuard {
    file: File,
}

impl FlockGuard {
    #[cfg(unix)]
    pub fn clear_cloexec_for_exec(&self) -> Result<()> {
        let fd = self.file.as_raw_fd();
        let flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
        if flags == -1 {
            return Err(std::io::Error::last_os_error()).context("reading flock-v1 FD flags");
        }
        if unsafe { libc::fcntl(fd, libc::F_SETFD, flags & !libc::FD_CLOEXEC) } == -1 {
            return Err(std::io::Error::last_os_error()).context("clearing flock-v1 FD_CLOEXEC");
        }
        Ok(())
    }

    #[cfg(not(unix))]
    pub fn clear_cloexec_for_exec(&self) -> Result<()> {
        bail!("flock-v1's exec-replacement lock ('guard lock-with') is supported only on macOS and Linux")
    }
}

impl Drop for FlockGuard {
    fn drop(&mut self) {
        #[cfg(unix)]
        unsafe {
            libc::flock(self.file.as_raw_fd(), libc::LOCK_UN);
        }
    }
}

#[cfg(unix)]
pub fn acquire(identity: &str, project_root: &Path, timeout: Duration) -> Result<FlockGuard> {
    protocol_is_active(project_root)?;
    let path = ensure_lock_root(project_root)?.join(format!("{}.lock", lock_name(identity)));
    reject_non_regular_lock_path(&path)?;
    let file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&path)
        .with_context(|| format!("opening flock-v1 lock file {}", path.display()))?;
    let opened_metadata = file.metadata()?;
    let path_metadata = std::fs::symlink_metadata(&path)?;
    if !opened_metadata.file_type().is_file()
        || !path_metadata.file_type().is_file()
        || opened_metadata.dev() != path_metadata.dev()
        || opened_metadata.ino() != path_metadata.ino()
    {
        bail!(
            "flock-v1 lock path must remain the opened regular file: {}",
            path.display()
        );
    }
    let deadline = Instant::now()
        .checked_add(timeout)
        .ok_or_else(|| anyhow::anyhow!("flock-v1 timeout is too large"))?;
    loop {
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 {
            return Ok(FlockGuard { file });
        }
        let error = std::io::Error::last_os_error();
        let errno = error.raw_os_error();
        if errno != Some(libc::EWOULDBLOCK) && errno != Some(libc::EAGAIN) {
            return Err(error).context("acquiring flock-v1 lock");
        }
        if Instant::now() >= deadline {
            bail!("flock-v1 timed out acquiring '{identity}' after {timeout:?}");
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

// Same technique as `os::supervisor::acquire_receipts_lock` /
// `remote::lock::FileLock`'s Windows arm: `share_mode(0)` gives real
// kernel-exclusive mutual exclusion (not best-effort/advisory), the same
// safety property `flock(2)` gives on Unix -- which is what
// `capability::lease::LeaseStore` actually needs (its own doc comments:
// the lock exists to stop two concurrent budget-consuming callers from
// both reading the same remaining balance and both spending it).
//
// Deliberately does NOT port the Unix arm's dev()/ino() TOCTOU/symlink-swap
// check (`std::os::unix::fs::MetadataExt`-specific, no port here) --
// matches the already-shipped precedent in `ReceiptsLock`, which has no
// equivalent check either. The safety property that matters is preserved
// by `share_mode(0)` regardless.
#[cfg(windows)]
pub fn acquire(identity: &str, project_root: &Path, timeout: Duration) -> Result<FlockGuard> {
    use std::os::windows::fs::OpenOptionsExt;

    protocol_is_active(project_root)?;
    let path = ensure_lock_root(project_root)?.join(format!("{}.lock", lock_name(identity)));
    reject_non_regular_lock_path(&path)?;
    let deadline = Instant::now()
        .checked_add(timeout)
        .ok_or_else(|| anyhow::anyhow!("flock-v1 timeout is too large"))?;
    loop {
        let mut options = OpenOptions::new();
        options.create(true).read(true).write(true).share_mode(0);
        match options.open(&path) {
            Ok(file) => return Ok(FlockGuard { file }),
            Err(error) => {
                // ERROR_SHARING_VIOLATION == 32: another process holds the
                // exclusive handle; anything else is a real error.
                if error.raw_os_error() != Some(32) {
                    return Err(error)
                        .with_context(|| format!("opening flock-v1 lock file {}", path.display()));
                }
            }
        }
        if Instant::now() >= deadline {
            bail!("flock-v1 timed out acquiring '{identity}' after {timeout:?}");
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(not(any(unix, windows)))]
pub fn acquire(_identity: &str, _project_root: &Path, _timeout: Duration) -> Result<FlockGuard> {
    bail!("flock-v1 is supported only on macOS, Linux, and Windows")
}

pub fn with_lock<T>(
    identity: &str,
    project_root: &Path,
    timeout: Duration,
    action: impl FnOnce() -> T,
) -> Result<T> {
    let _guard = acquire(identity, project_root, timeout)?;
    Ok(action())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn active_root() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join(".claude/state")).unwrap();
        std::fs::write(root.path().join(PROTOCOL_FILE), PROTOCOL_VERSION).unwrap();
        root
    }

    #[test]
    fn canonical_keys_are_lexical_and_escape_safe() {
        assert_eq!(
            canonical_identity("key:state/a/../token-budget.json", Path::new("/unused")).unwrap(),
            "key/state/token-budget.json"
        );
        assert!(canonical_identity("key:../../escape", Path::new("/unused")).is_err());
    }

    #[test]
    fn relative_and_absolute_paths_share_identity() {
        let root = Path::new("/tmp/yana-flock-root");
        assert_eq!(
            canonical_identity("core/memory/L2_session/token-budget.json", root).unwrap(),
            canonical_identity(
                "/tmp/yana-flock-root/core/memory/L2_session/token-budget.json",
                root
            )
            .unwrap()
        );
        assert!(canonical_identity("../outside", root).is_err());
    }

    #[test]
    fn unicode_hashes_utf8_bytes_deterministically() {
        let identity = canonical_identity("key:state/nhật-ký.json", Path::new("/unused")).unwrap();
        assert_eq!(lock_name(&identity), lock_name(&identity));
        assert_ne!(lock_name(&identity), lock_name("key/state/nhat-ky.json"));
        assert_ne!(
            lock_name(&canonical_identity("key:a/b_c", Path::new("/unused")).unwrap()),
            lock_name(&canonical_identity("key:a_b/c", Path::new("/unused")).unwrap())
        );
    }

    #[test]
    fn lock_file_inode_is_stable() {
        let root = active_root();
        let identity = canonical_identity("key:state/stable.json", root.path()).unwrap();
        with_lock(&identity, root.path(), Duration::from_secs(1), || ()).unwrap();
        let inode_before = std::fs::metadata(lock_path(root.path(), &identity))
            .unwrap()
            .ino();
        with_lock(&identity, root.path(), Duration::from_secs(1), || ()).unwrap();
        let inode_after = std::fs::metadata(lock_path(root.path(), &identity))
            .unwrap()
            .ino();
        assert_eq!(inode_before, inode_after);
    }

    #[test]
    fn directory_lock_path_fails_loud() {
        let root = active_root();
        let identity = canonical_identity("key:state/directory.json", root.path()).unwrap();
        std::fs::create_dir_all(lock_path(root.path(), &identity)).unwrap();
        assert!(acquire(&identity, root.path(), Duration::ZERO).is_err());
    }

    #[test]
    fn symlinked_lock_root_fails_loud() {
        use std::os::unix::fs::symlink;

        let root = active_root();
        let outside = tempfile::tempdir().unwrap();
        symlink(outside.path(), root.path().join(".claude/state/locks")).unwrap();
        let identity = canonical_identity("key:state/symlink.json", root.path()).unwrap();
        assert!(acquire(&identity, root.path(), Duration::ZERO).is_err());
        assert!(std::fs::read_dir(outside.path()).unwrap().next().is_none());
    }
}

// Windows coverage is intentionally a narrower subset of the Unix module
// above, not a full port:
//   - `lock_file_inode_is_stable` relies on `std::os::unix::fs::MetadataExt`
//     (`.ino()`), which has no Windows equivalent exercised here (see the
//     `acquire()` Windows arm's doc comment: the dev()/ino() TOCTOU check
//     is deliberately not ported, matching the `ReceiptsLock` precedent).
//   - `symlinked_lock_root_fails_loud` relies on
//     `std::os::unix::fs::symlink`, which requires an account privilege most
//     CI runners don't grant by default on Windows, making the test
//     environment-fragile rather than reliably reproducible there.
// What IS covered: the same directory-residue rejection Unix gets, plus a
// concurrent-acquire test that proves the actual safety property
// `capability::lease::LeaseStore` depends on -- real mutual exclusion, not
// merely "the API returns Ok" -- matching the proof pattern
// `remote::lock::FileLock`'s own
// `concurrent_lockers_serialize_instead_of_both_succeeding_at_once` test uses.
#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;

    fn active_root() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join(".claude/state")).unwrap();
        std::fs::write(root.path().join(PROTOCOL_FILE), PROTOCOL_VERSION).unwrap();
        root
    }

    #[test]
    fn directory_lock_path_fails_loud() {
        let root = active_root();
        let identity = canonical_identity("key:state/directory.json", root.path()).unwrap();
        std::fs::create_dir_all(lock_path(root.path(), &identity)).unwrap();
        assert!(acquire(&identity, root.path(), Duration::ZERO).is_err());
    }

    #[test]
    fn concurrent_acquire_serializes() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let root = active_root();
        let identity = canonical_identity("key:state/concurrent.json", root.path()).unwrap();
        let overlap_count = Arc::new(AtomicUsize::new(0));
        let inside_critical_section = Arc::new(AtomicUsize::new(0));

        let handles: Vec<_> = (0..4)
            .map(|_| {
                let root = root.path().to_path_buf();
                let identity = identity.clone();
                let overlap_count = Arc::clone(&overlap_count);
                let inside_critical_section = Arc::clone(&inside_critical_section);
                std::thread::spawn(move || {
                    with_lock(&identity, &root, Duration::from_secs(5), || {
                        if inside_critical_section.fetch_add(1, Ordering::SeqCst) != 0 {
                            overlap_count.fetch_add(1, Ordering::SeqCst);
                        }
                        std::thread::sleep(Duration::from_millis(20));
                        inside_critical_section.fetch_sub(1, Ordering::SeqCst);
                    })
                    .unwrap();
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        assert_eq!(
            overlap_count.load(Ordering::SeqCst),
            0,
            "two threads observed the critical section held concurrently -- \
             flock-v1's Windows lock did not actually exclude"
        );
    }
}
