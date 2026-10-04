//! Optional safety copy of the workspace just before a governed file write
//! (WS4, docs/contracts/ws4-state.md 14.6).
//!
//! Off unless `YANA_CHECKPOINTS=1`. It runs only from `apply_file_write`, which
//! is reached after the approval decision and after the path has been checked,
//! so a refused or invalid write never produces a checkpoint. A checkpoint that
//! fails, times out, or cannot run (no git) is a warning at most: the write
//! carries on exactly as it would have, and its result and evidence are untouched.

use crate::session_db::{CheckpointStore, ProfileName, StateRoot};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub(super) const ENV_FLAG: &str = "YANA_CHECKPOINTS";
/// The most a checkpoint may add to one file write. Past it the git process is
/// killed and the write goes ahead.
const TIME_LIMIT: Duration = Duration::from_secs(3);
/// One checkpoint per workspace per this long. An agent turn that writes many
/// files then costs one snapshot, taken before its first write; the writes
/// that follow inside the window are not covered individually.
const MIN_GAP: Duration = Duration::from_secs(10);
/// After a checkpoint failed or timed out, leave the workspace alone this long
/// (a huge tree would otherwise be retried, and time out, on every write).
const FAILURE_BACKOFF: Duration = Duration::from_secs(60);
/// Longest file name kept in a label.
const LABEL_PATH_CHARS: usize = 120;

/// What may be changed from outside; tests use it to inject a missing git or a tiny limit.
#[derive(Debug, Clone)]
pub(super) struct HookConfig {
    pub git: OsString,
    pub min_gap: Duration,
    pub time_limit: Duration,
}

impl Default for HookConfig {
    fn default() -> Self {
        Self { git: OsString::from("git"), min_gap: MIN_GAP, time_limit: TIME_LIMIT }
    }
}

/// Per workspace: when the next attempt is allowed, and whether a failure was already reported.
struct Slot {
    next_attempt: Instant,
    warned: bool,
}

static SLOTS: Mutex<BTreeMap<PathBuf, Slot>> = Mutex::new(BTreeMap::new());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum HookOutcome {
    Off,
    /// A checkpoint was taken recently, or a recent one failed.
    Throttled,
    Taken,
    Failed,
}

/// Only the exact value "1" turns checkpoints on.
pub(super) fn flag_on(value: Option<&str>) -> bool {
    value == Some("1")
}

/// The configuration to use, or `None` when checkpoints are off.
pub(super) fn from_env() -> Option<HookConfig> {
    flag_on(std::env::var(ENV_FLAG).ok().as_deref()).then(HookConfig::default)
}

/// The label holds the relative file name and the reason, never file content.
fn label(action: &str, requested: &str) -> String {
    let name: String = requested.chars().take(LABEL_PATH_CHARS).collect();
    format!("before {action}: {name}")
}

/// Take a checkpoint of `root` when `config` is given and this workspace is not
/// throttled. Never returns an error and never panics.
pub(super) fn before_write(config: Option<&HookConfig>, root: &Path, requested: &str, action: &str) -> HookOutcome {
    let Some(config) = config else { return HookOutcome::Off };
    // The same workspace reached by another spelling must share one entry.
    let key = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    {
        let mut slots = SLOTS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let slot = slots.entry(key.clone()).or_insert(Slot { next_attempt: Instant::now(), warned: false });
        if Instant::now() < slot.next_attempt {
            return HookOutcome::Throttled;
        }
        // Set before the attempt, so concurrent writes do not all snapshot.
        slot.next_attempt = Instant::now() + config.min_gap;
    }
    let outcome = take(config, root, &label(action, requested));
    let mut slots = SLOTS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(slot) = slots.get_mut(&key) {
        match &outcome {
            Ok(()) => slot.warned = false,
            Err(error) => {
                slot.next_attempt = Instant::now() + FAILURE_BACKOFF;
                // Once per failure streak per workspace, so a dead git does not spam every write.
                if !std::mem::replace(&mut slot.warned, true) {
                    eprintln!("warning: no checkpoint taken before the file write ({error}); the write continues");
                }
            }
        }
    }
    if outcome.is_ok() { HookOutcome::Taken } else { HookOutcome::Failed }
}

fn take(config: &HookConfig, root: &Path, label: &str) -> Result<(), crate::session_db::CheckpointError> {
    let state = StateRoot::for_profile(root, &ProfileName::default_profile());
    let store = CheckpointStore::open_with_git(&state, root, config.git.clone())?.with_time_limit(config.time_limit);
    store.snapshot(label).map(|_| ())
}

#[cfg(test)]
mod tests;
