//! Profile names and the directory each profile keeps its state in.
//!
//! Isolation is by directory, not by a filter column: two profiles never open
//! the same file. The default profile keeps the layout Yana has always used
//! (`<repo>/.yana-ai/...`) so configuring nothing changes nothing; a named
//! profile lives under `<repo>/.yana-ai/profiles/<name>/`.

use std::fmt;
use std::path::{Path, PathBuf};

/// Name of the profile that uses the pre-profile layout.
pub const DEFAULT_PROFILE: &str = "default";
const STATE_DIR: &str = ".yana-ai";
const PROFILES_DIR: &str = "profiles";
const MAX_NAME_LEN: usize = 32;
/// Names Windows refuses as file or directory names. Yana Desktop ships for
/// Windows, so they are rejected on every platform.
const WINDOWS_RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProfileError {
    InvalidName(String),
    Io(String),
    /// The resolved directory is not inside the base directory.
    EscapesBase(PathBuf),
}

impl fmt::Display for ProfileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidName(why) => write!(f, "invalid profile name: {why}"),
            Self::Io(why) => write!(f, "profile directory error: {why}"),
            Self::EscapesBase(path) => {
                write!(f, "profile directory {} is outside the state base", path.display())
            }
        }
    }
}

impl std::error::Error for ProfileError {}

/// A validated profile name: 1 to 32 characters of `a-z`, `0-9`, `-`, `_`,
/// starting with a letter or digit, and not a Windows reserved name.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProfileName(String);

impl ProfileName {
    pub fn new(name: &str) -> Result<Self, ProfileError> {
        let invalid = |why: &str| ProfileError::InvalidName(format!("{name:?}: {why}"));
        let Some(first) = name.chars().next() else {
            return Err(invalid("empty"));
        };
        if name.len() > MAX_NAME_LEN {
            return Err(invalid("longer than 32 characters"));
        }
        if !(first.is_ascii_lowercase() || first.is_ascii_digit()) {
            return Err(invalid("must start with a lowercase letter or digit"));
        }
        let allowed = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_');
        if !name.chars().all(allowed) {
            return Err(invalid("only a-z, 0-9, '-' and '_' are allowed"));
        }
        if WINDOWS_RESERVED.contains(&name) {
            return Err(invalid("reserved name"));
        }
        Ok(Self(name.to_string()))
    }

    pub fn default_profile() -> Self {
        Self(DEFAULT_PROFILE.to_string())
    }

    pub fn is_default(&self) -> bool {
        self.0 == DEFAULT_PROFILE
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Which piece of state a path is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StateKind {
    SessionsDb,
    ChatHistory,
    MemoryL3,
    Checkpoints,
    WorkspaceEvents,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StateRoot {
    base: PathBuf,
    dir: PathBuf,
    profile: ProfileName,
}

impl StateRoot {
    /// Pure: computes paths only, creates nothing. `base` is the repo root.
    pub fn for_profile(base: &Path, profile: &ProfileName) -> StateRoot {
        let state = base.join(STATE_DIR);
        let dir = if profile.is_default() {
            state
        } else {
            state.join(PROFILES_DIR).join(profile.as_str())
        };
        StateRoot { base: base.to_path_buf(), dir, profile: profile.clone() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn profile(&self) -> &ProfileName {
        &self.profile
    }

    pub fn path(&self, kind: StateKind) -> PathBuf {
        match kind {
            StateKind::SessionsDb => self.dir.join("sessions.db"),
            StateKind::ChatHistory => self.dir.join("chat-history"),
            StateKind::MemoryL3 => self.dir.join("l3.jsonl"),
            StateKind::Checkpoints => self.dir.join("checkpoints"),
            StateKind::WorkspaceEvents => self.dir.join("workspace").join("events"),
        }
    }

    /// Create the profile directory and check it really lies inside `base`
    /// after symlinks are resolved. The check runs BEFORE anything is
    /// created, so a symlink cannot make this write outside `base`. Safe to
    /// call repeatedly.
    pub fn ensure_dir(&self) -> Result<(), ProfileError> {
        let io = |what: &str, error: std::io::Error| ProfileError::Io(format!("{what}: {error}"));
        let base = self.base.canonicalize().map_err(|e| io("resolving the state base", e))?;
        let mut existing = self.dir.as_path();
        while !existing.exists() {
            existing = existing
                .parent()
                .ok_or_else(|| ProfileError::Io("no existing parent directory".to_string()))?;
        }
        let real = existing.canonicalize().map_err(|e| io("resolving an existing parent", e))?;
        if !real.starts_with(&base) {
            return Err(ProfileError::EscapesBase(self.dir.clone()));
        }
        std::fs::create_dir_all(&self.dir).map_err(|e| io("creating the profile directory", e))?;
        let created = self.dir.canonicalize().map_err(|e| io("resolving the profile directory", e))?;
        if created.starts_with(&base) {
            Ok(())
        } else {
            Err(ProfileError::EscapesBase(self.dir.clone()))
        }
    }
}

#[cfg(test)]
mod tests;
