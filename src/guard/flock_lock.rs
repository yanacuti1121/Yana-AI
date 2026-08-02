//! Kernel-flock locking primitive — PROTOTYPE, not wired into any
//! production call site or CLI subcommand.
//!
//! Exists to prove the protocol described in the ABA-safety audit that
//! replaced the mkdir + generation/rename design in [`super::lock`]: that
//! design's canonical-pointer reclaim step has no portable POSIX primitive
//! for atomic compare-and-unlink/compare-and-rename, so it remains
//! genuinely vulnerable to a live lock being stolen out from under its
//! holder. A kernel-held `flock()` sidesteps the entire problem class —
//! there is no reclaim step, no staleness heuristic, no generation token:
//! the kernel releases the lock automatically when the holder's file
//! descriptor table is torn down (normal close, or process death).
//!
//! Absolute invariants (must never be violated by this file or any
//! caller):
//!   - the lock file is created idempotently (`O_CREAT`, never truncated)
//!     and is NEVER unlinked, renamed, or recreated by any code path;
//!   - the lock is held via BSD-style `flock()` (fd-scoped), not POSIX
//!     `fcntl(F_SETLK)` (process-scoped — closing an unrelated fd on the
//!     same inode elsewhere in the process would silently release a
//!     `fcntl`-style lock; `flock()` has no such trap);
//!   - same canonical path and lock-name derivation as [`super::lock`]'s
//!     existing [`super::lock::lock_name_for`] — cross-language parity
//!     with `core/lib/py/flock_run.py` depends on this staying identical.

// Prototype only — no production call site references acquire()/with_lock()
// yet (that's the next PR, after architectural review). cargo build would
// otherwise warn every public item here as dead code; cargo test does not,
// since the #[cfg(test)] module below exercises them.
#![allow(dead_code)]

use anyhow::{bail, Context, Result};
use std::fs::{File, OpenOptions};
use std::os::unix::io::AsRawFd;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const LOCK_ROOT: &str = ".claude/state/locks";
const POLL_INTERVAL_MS: u64 = 50;

/// Same lock-root convention as [`super::lock`], but the leaf is always a
/// plain file — never a directory — so an old-format (mkdir'd directory)
/// lock at the same derived name fails loudly on `open()` (`EISDIR`)
/// instead of being silently misinterpreted as this format. See the audit
/// report's "Legacy Migration Safety" section for why that failure mode is
/// the intended, safe detection point for the eventual cutover.
fn lock_file_path(project_dir: &Path, lock_name: &str) -> PathBuf {
    project_dir.join(LOCK_ROOT).join(format!("{lock_name}.lock"))
}

fn project_dir() -> PathBuf {
    std::env::var("CLAUDE_PROJECT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
}

/// A held kernel lock. Releasing is `close()` — implicit on `File`'s own
/// `Drop`, plus an explicit `flock(LOCK_UN)` first purely to document the
/// release point (redundant with `close()` releasing the lock anyway,
/// since flock is tied to the open file description).
pub struct FlockGuard {
    file: File,
}

impl Drop for FlockGuard {
    fn drop(&mut self) {
        unsafe {
            libc::flock(self.file.as_raw_fd(), libc::LOCK_UN);
        }
        // File's own Drop closes the fd right after this — no explicit
        // close() call needed, and no unlink() anywhere in this type,
        // ever: the lock file must outlive every acquisition.
    }
}

/// Acquire the named lock, blocking (short poll) up to `wait_timeout`.
/// `flock()` has no OS-level timeout parameter, so the bound is a poll
/// loop around `LOCK_EX | LOCK_NB` — same shape as [`super::lock`]'s
/// existing retry loop and `flock_run.py`'s, just polling a kernel
/// primitive instead of a directory's existence.
pub fn acquire(lock_name: &str, wait_timeout: Duration) -> Result<FlockGuard> {
    let root = project_dir();
    let path = lock_file_path(&root, lock_name);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("creating lock root directory")?;
    }

    let file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&path)
        .with_context(|| format!("opening lock file {}", path.display()))?;
    let fd = file.as_raw_fd();

    let deadline = Instant::now() + wait_timeout;
    loop {
        let rc = unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) };
        if rc == 0 {
            return Ok(FlockGuard { file });
        }
        let err = std::io::Error::last_os_error();
        match err.raw_os_error() {
            Some(libc::EWOULDBLOCK) => {
                if Instant::now() >= deadline {
                    bail!("timed out acquiring lock '{lock_name}' after {wait_timeout:?}");
                }
                std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
            }
            _ => return Err(err).context(format!("flock() on {}", path.display())),
        }
    }
}

/// Run `f` with the named lock held for `f`'s entire execution. Same shape
/// as [`super::lock::with_lock`] deliberately — a future swap of the
/// production implementation is a call-site rename, not a redesign.
pub fn with_lock<T>(lock_name: &str, timeout: Duration, f: impl FnOnce() -> T) -> Result<T> {
    let _guard = acquire(lock_name, timeout)?;
    Ok(f())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn unique_lock_name(test_id: &str) -> String {
        format!(
            "flock-proto-{test_id}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )
    }

    #[test]
    fn with_lock_runs_closure_and_releases() {
        let name = unique_lock_name("basic");
        let result = with_lock(&name, Duration::from_secs(5), || 42).unwrap();
        assert_eq!(result, 42);
        let guard = acquire(&name, Duration::from_millis(200)).unwrap();
        drop(guard);
    }

    #[test]
    fn timeout_fails_closed_when_lock_held() {
        let name = unique_lock_name("timeout");
        let _holder = acquire(&name, Duration::from_secs(5)).unwrap();
        let contender = acquire(&name, Duration::from_millis(150));
        assert!(contender.is_err(), "acquire should time out while genuinely held");
    }

    #[test]
    fn concurrent_writers_do_not_lose_updates() {
        let name = Arc::new(unique_lock_name("concurrent"));
        let counter = Arc::new(AtomicUsize::new(0));
        let mut handles = vec![];
        for _ in 0..20 {
            let name = Arc::clone(&name);
            let counter = Arc::clone(&counter);
            handles.push(std::thread::spawn(move || {
                with_lock(&name, Duration::from_secs(5), || {
                    let current = counter.load(Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(2));
                    counter.store(current + 1, Ordering::SeqCst);
                })
                .unwrap();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(counter.load(Ordering::SeqCst), 20, "lost update — flock is not exclusive");
    }

    #[test]
    fn no_stale_timeout_needed_after_release() {
        // Unlike the mkdir+reclaim design, a released lock is immediately
        // acquirable with no staleness window to wait out at all.
        let name = unique_lock_name("no-stale-wait");
        let guard = acquire(&name, Duration::from_secs(5)).unwrap();
        drop(guard);
        let started = Instant::now();
        let second = acquire(&name, Duration::from_millis(200)).unwrap();
        assert!(started.elapsed() < Duration::from_millis(100), "release must be immediate, not heuristic");
        drop(second);
    }

    #[test]
    fn lock_file_is_never_unlinked_across_many_acquisitions() {
        use std::os::unix::fs::MetadataExt;
        let name = unique_lock_name("stable-inode");
        let path = lock_file_path(&project_dir(), &name);

        let g1 = acquire(&name, Duration::from_secs(5)).unwrap();
        let inode_before = std::fs::metadata(&path).unwrap().ino();
        drop(g1);

        for _ in 0..10 {
            let g = acquire(&name, Duration::from_secs(5)).unwrap();
            drop(g);
        }

        let inode_after = std::fs::metadata(&path).unwrap().ino();
        assert_eq!(inode_before, inode_after, "lock file inode changed — something unlinked/recreated it");
    }
}
