//! Generic inter-process file lock for `remote::`'s shared, file-backed
//! state (`remote-sessions.json` today; `remote-requests.jsonl` and any
//! future adapter's shared state tomorrow — anh's own review of this
//! program's Discord Phase slice explicitly asked for a reusable
//! transaction lock rather than a Discord-specific one, since a second
//! adapter (Telegram, per the master specification's own interface list)
//! would need the exact same guarantee over the exact same file).
//!
//! Same technique as `os::supervisor::ReceiptsLock` (`flock(2)` on unix,
//! exclusive share-mode open on Windows) — NOT the same code, deliberately
//! not reused directly: that type is private to `os::supervisor`, narrowly
//! named/scoped to the receipts file, and was fresh-reviewed as part of
//! PR #204's safety-critical hotfix. Re-scoping it for an unrelated
//! module would touch already-reviewed, safety-critical code for this
//! PR's convenience. This is a parallel, generic implementation instead —
//! same proven mechanism, its own small surface.

use anyhow::{bail, Context, Result};
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::Duration;

const POLL_INTERVAL: Duration = Duration::from_millis(25);

pub struct FileLock {
    #[allow(dead_code)]
    file: File,
}

impl Drop for FileLock {
    fn drop(&mut self) {
        #[cfg(unix)]
        unsafe {
            libc::flock(
                std::os::unix::io::AsRawFd::as_raw_fd(&self.file),
                libc::LOCK_UN,
            );
        }
    }
}

fn lock_path_for(target: &Path) -> PathBuf {
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("remote-state");
    target.with_file_name(format!("{file_name}.lock"))
}

#[cfg(unix)]
pub fn acquire(target: &Path, timeout: Duration) -> Result<FileLock> {
    use std::os::unix::fs::OpenOptionsExt;
    use std::os::unix::io::AsRawFd;

    let lock_path = lock_path_for(target);
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }
    let file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&lock_path)
        .with_context(|| format!("opening lock {}", lock_path.display()))?;
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        if result == 0 {
            return Ok(FileLock { file });
        }
        let error = std::io::Error::last_os_error();
        let errno = error.raw_os_error();
        if errno != Some(libc::EWOULDBLOCK) && errno != Some(libc::EAGAIN) {
            return Err(error).context("acquiring remote state lock");
        }
        if std::time::Instant::now() >= deadline {
            bail!(
                "timed out acquiring lock at {} after {:?}",
                lock_path.display(),
                timeout
            );
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(windows)]
pub fn acquire(target: &Path, timeout: Duration) -> Result<FileLock> {
    use std::os::windows::fs::OpenOptionsExt;

    let lock_path = lock_path_for(target);
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let mut options = OpenOptions::new();
        options.create(true).read(true).write(true).share_mode(0);
        match options.open(&lock_path) {
            Ok(file) => return Ok(FileLock { file }),
            Err(error) => {
                if error.raw_os_error() != Some(32) {
                    return Err(error)
                        .with_context(|| format!("opening lock {}", lock_path.display()));
                }
            }
        }
        if std::time::Instant::now() >= deadline {
            bail!(
                "timed out acquiring lock at {} after {:?}",
                lock_path.display(),
                timeout
            );
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(not(any(unix, windows)))]
pub fn acquire(_target: &Path, _timeout: Duration) -> Result<FileLock> {
    bail!("remote state locking is only implemented for unix and windows")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_lockers_serialize_instead_of_both_succeeding_at_once() {
        let dir = std::env::temp_dir().join(format!("yana-remote-lock-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("state.json");
        let target2 = target.clone();

        let order = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let (order_a, order_b) = (order.clone(), order.clone());
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let (barrier_a, barrier_b) = (barrier.clone(), barrier.clone());

        let a = std::thread::spawn(move || {
            barrier_a.wait();
            let _lock = acquire(&target, Duration::from_secs(5)).unwrap();
            order_a.lock().unwrap().push('a');
            std::thread::sleep(Duration::from_millis(50));
            order_a.lock().unwrap().push('A');
        });
        let b = std::thread::spawn(move || {
            barrier_b.wait();
            let _lock = acquire(&target2, Duration::from_secs(5)).unwrap();
            order_b.lock().unwrap().push('b');
            std::thread::sleep(Duration::from_millis(50));
            order_b.lock().unwrap().push('B');
        });
        a.join().unwrap();
        b.join().unwrap();

        let sequence: String = order.lock().unwrap().iter().collect();
        assert!(
            sequence == "aAbB" || sequence == "bBaA",
            "one locker must fully finish before the other starts, got: {sequence}"
        );
        std::fs::remove_dir_all(dir).ok();
    }
}
