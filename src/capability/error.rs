//! Typed errors for `crate::capability`. Every public capability function
//! returns `Result<_, CapabilityError>` internally; the `From<CapabilityError>
//! for String` impl below is the compatibility adapter that keeps every
//! existing `Result<_, String>` call site (MCP's 9 tools, chat's read_file/
//! run_command adapters) working with a single `.map_err(Into::into)`
//! instead of a signature rewrite at every caller.

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapabilityError {
    /// Requested path resolves outside the repository root (Gate L5).
    PathEscape {
        requested: String,
    },
    /// `canonicalize()`/`fs::metadata()` failed — path does not exist,
    /// or the requested repo root itself does not resolve.
    NotFound {
        requested: String,
    },
    NotAFile {
        requested: String,
    },
    NotADirectory {
        requested: String,
    },
    TooLarge {
        bytes: u64,
        limit: u64,
    },
    InvalidUtf8 {
        requested: String,
    },
    EmptyCommand,
    CommandParseError {
        detail: String,
    },
    /// Any other validation failure that isn't a path/command shape
    /// problem (empty search query, out-of-range pid, unknown sort key).
    InvalidInput {
        detail: String,
    },
    SpawnFailed {
        detail: String,
    },
    Io {
        detail: String,
    },
    Serialize {
        detail: String,
    },
    /// Capability not available on this platform/configuration (e.g.
    /// process listing on a non-Unix host).
    Unsupported {
        detail: String,
    },
}

impl fmt::Display for CapabilityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PathEscape { requested } => {
                write!(f, "path escapes repository root (Gate L5): {requested}")
            }
            Self::NotFound { requested } => write!(f, "resolve '{requested}': not found"),
            Self::NotAFile { requested } => write!(f, "not a file: {requested}"),
            Self::NotADirectory { requested } => write!(f, "not a directory: {requested}"),
            Self::TooLarge { bytes, limit } => {
                write!(f, "file too large: {bytes} bytes (limit {limit})")
            }
            Self::InvalidUtf8 { requested } => write!(f, "not valid UTF-8: {requested}"),
            Self::EmptyCommand => write!(f, "empty command"),
            Self::CommandParseError { detail } => write!(f, "cannot parse command: {detail}"),
            Self::InvalidInput { detail } => write!(f, "{detail}"),
            Self::SpawnFailed { detail } => write!(f, "failed to spawn: {detail}"),
            Self::Io { detail } => write!(f, "{detail}"),
            Self::Serialize { detail } => write!(f, "serialize observation: {detail}"),
            Self::Unsupported { detail } => write!(f, "{detail}"),
        }
    }
}

impl std::error::Error for CapabilityError {}

/// Compatibility adapter: every existing call site expecting
/// `Result<_, String>` keeps working via `.map_err(Into::into)`.
impl From<CapabilityError> for String {
    fn from(error: CapabilityError) -> Self {
        error.to_string()
    }
}
