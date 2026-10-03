//! Which process is writing a session.
//!
//! A writer holds an exclusive lock on `<state>/session-locks/<id>.lock` for
//! as long as it is working on the session. The operating system releases the
//! lock when the process exits, however it exits, so "nobody holds the lock"
//! reliably means "the writer is gone". Nothing here reads clocks.

use super::SessionDbError;
use std::fs::{File, OpenOptions, TryLockError};
use std::path::Path;

/// Longest session id accepted as a lock file name.
const MAX_ID_LEN: usize = 128;

/// Held while a process works on a session. Dropping it releases the lock.
#[derive(Debug)]
pub struct SessionLock {
    _file: File,
}

/// Ids become file names, so only letters, digits, `-` and `_` are allowed.
pub(super) fn valid_session_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
}

/// Take the session's lock without waiting. `Busy` when another holder has it.
pub(super) fn try_lock_session(locks_dir: &Path, id: &str) -> Result<SessionLock, SessionDbError> {
    if !valid_session_id(id) {
        return Err(SessionDbError::Invalid(format!("session id {id:?} cannot be used as a lock name")));
    }
    let io = |what: &str, error: std::io::Error| SessionDbError::Io(format!("{what}: {error}"));
    std::fs::create_dir_all(locks_dir).map_err(|e| io("creating the session lock directory", e))?;
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(locks_dir.join(format!("{id}.lock")))
        .map_err(|e| io("opening the session lock", e))?;
    match file.try_lock() {
        Ok(()) => Ok(SessionLock { _file: file }),
        Err(TryLockError::WouldBlock) => Err(SessionDbError::Busy(id.to_string())),
        Err(TryLockError::Error(error)) => Err(io("locking the session", error)),
    }
}
