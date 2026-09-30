//! A hard time limit for `snapshot`, so a checkpoint can never hold up the
//! caller (for example a file write) for longer than the caller allows.

use super::git::run_until;
use super::{CheckpointError, CheckpointId, CheckpointStore};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime};

impl CheckpointStore {
    /// Every `snapshot` from now on stops, and returns `TimedOut`, once it has
    /// run this long. The running git process is killed, not left behind.
    pub fn with_time_limit(mut self, limit: Duration) -> Self {
        self.time_limit = Some(limit);
        self
    }

    /// Record the project's current files; see `with_time_limit` for the bound.
    pub fn snapshot(&self, label: &str) -> Result<CheckpointId, CheckpointError> {
        let started = SystemTime::now();
        self.deadline.set(self.time_limit.map(|limit| Instant::now() + limit));
        let result = self.snapshot_inner(label);
        self.deadline.set(None);
        if matches!(result, Err(CheckpointError::TimedOut)) {
            self.clear_own_stale_lock(started);
        }
        result
    }

    /// A killed `git add` can leave its index lock behind, which would make
    /// every later snapshot fail. Only a lock created after this snapshot
    /// started can be ours; an older one belongs to another process and stays.
    fn clear_own_stale_lock(&self, started: SystemTime) {
        let lock = self.shadow.join("index.lock");
        let ours = std::fs::metadata(&lock).and_then(|meta| meta.modified()).is_ok_and(|modified| modified >= started);
        if ours {
            let _ = std::fs::remove_file(lock);
        }
    }

    pub(super) fn run(&self, command: &mut Command) -> Result<Vec<u8>, CheckpointError> {
        run_until(command, self.deadline.get())
    }

    pub(super) fn run_text(&self, command: &mut Command) -> Result<String, CheckpointError> {
        Ok(String::from_utf8_lossy(&self.run(command)?).trim().to_string())
    }
}
