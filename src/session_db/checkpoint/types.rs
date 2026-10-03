//! Plain data types of the checkpoint store.

use std::fmt;
use std::path::PathBuf;

const DEFAULT_MAX_POINTS: usize = 50;
const DEFAULT_MAX_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckpointError {
    /// The `git` program could not be started. Checkpoints are off.
    GitMissing,
    Git(String),
    Io(String),
    InvalidProject(String),
    InvalidPath(String),
    NotFound(String),
    /// The destination would leave the project or pass through a link.
    OutsideProject(String),
    /// A time-limited snapshot ran out of time and was stopped.
    TimedOut,
}

impl fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::GitMissing => write!(f, "checkpoints are off: git was not found on PATH"),
            Self::Git(why) => write!(f, "git failed: {why}"),
            Self::Io(why) => write!(f, "checkpoint storage error: {why}"),
            Self::InvalidProject(why) => write!(f, "cannot checkpoint this project: {why}"),
            Self::InvalidPath(why) => write!(f, "invalid path: {why}"),
            Self::NotFound(what) => write!(f, "not found: {what}"),
            Self::OutsideProject(why) => write!(f, "refusing to write outside the project: {why}"),
            Self::TimedOut => write!(f, "the checkpoint took too long and was stopped"),
        }
    }
}

impl std::error::Error for CheckpointError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct CheckpointId(pub u32);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckpointInfo {
    pub id: CheckpointId,
    pub commit: String,
    pub label: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RestoreScope {
    Whole,
    /// A path relative to the project root.
    OneFile(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreReport {
    pub restored: Vec<String>,
    /// Files not written, with the reason.
    pub skipped: Vec<(String, String)>,
    /// The checkpoint taken just before restoring, so a restore can be undone.
    pub safety_checkpoint: Option<CheckpointId>,
}

#[derive(Debug, Clone, Copy)]
pub struct PrunePolicy {
    pub max_points: usize,
    pub max_bytes: u64,
}

impl Default for PrunePolicy {
    fn default() -> Self {
        Self { max_points: DEFAULT_MAX_POINTS, max_bytes: DEFAULT_MAX_BYTES }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PruneReport {
    pub removed: usize,
    pub kept: usize,
}
