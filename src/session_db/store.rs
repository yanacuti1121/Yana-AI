//! Session database (WS4 step 1, docs/contracts/ws4-state.md sections 4, 5).
//!
//! Sessions and messages in one SQLite file per profile, with full-text
//! search that ignores case and accents. The trait keeps the storage engine
//! replaceable; `SqliteSessionStore` is the only implementation.

mod fold;
mod import;
#[cfg(test)]
mod import_tests;
mod lock;
mod migrations;
mod recover;
#[cfg(test)]
mod recovery_tests;
mod sqlite;
#[cfg(test)]
mod tests;

pub use import::{import_chat_history, ImportProblem, ImportReport};
pub use lock::SessionLock;
pub use recover::{CorruptionReport, RecoveryReport};
pub use sqlite::SqliteSessionStore;

use super::{StateKind, StateRoot};
use crate::model::provider::Role;
use migrations::{migrate, user_version};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionDbError {
    Sqlite(String),
    Io(String),
    /// The database was written by a newer program than this one.
    NewerSchema { found: u32, supported: u32 },
    NotFound(String),
    /// Another process holds this session.
    Busy(String),
    /// An id or value that must not be used (for example as a file name).
    Invalid(String),
    /// The database file is damaged (not an SQLite database, or malformed).
    Corrupt(String),
}

impl fmt::Display for SessionDbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(why) => write!(f, "session database error: {why}"),
            Self::Io(why) => write!(f, "session database storage error: {why}"),
            Self::NewerSchema { found, supported } => write!(
                f,
                "the session database has schema version {found}, this program understands up to {supported}; update yana-rt"
            ),
            Self::NotFound(what) => write!(f, "not found: {what}"),
            Self::Busy(id) => write!(f, "session {id} is in use by another process"),
            Self::Invalid(why) => write!(f, "invalid value: {why}"),
            Self::Corrupt(why) => write!(f, "the session database is damaged: {why}"),
        }
    }
}

impl std::error::Error for SessionDbError {}

impl From<rusqlite::Error> for SessionDbError {
    fn from(error: rusqlite::Error) -> Self {
        use rusqlite::ErrorCode::{DatabaseCorrupt, NotADatabase};
        match &error {
            rusqlite::Error::SqliteFailure(failure, _) if matches!(failure.code, DatabaseCorrupt | NotADatabase) => {
                Self::Corrupt(error.to_string())
            }
            _ => Self::Sqlite(error.to_string()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndReason {
    Completed,
    Cancelled,
    Crashed,
    Imported,
}

impl EndReason {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Crashed => "crashed",
            Self::Imported => "imported",
        }
    }

    pub(super) fn parse(text: &str) -> Option<Self> {
        match text {
            "completed" => Some(Self::Completed),
            "cancelled" => Some(Self::Cancelled),
            "crashed" => Some(Self::Crashed),
            "imported" => Some(Self::Imported),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionRow {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub model: String,
    pub cwd: Option<String>,
    /// RFC 3339, same format as the chat history files.
    pub created_at: String,
    pub updated_at: String,
    pub ended_at: Option<String>,
    pub end_reason: Option<EndReason>,
    /// Derived from the messages; ignored by `create_session`.
    pub message_count: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MessageRow {
    /// Same value as the chat history line id. Appending an id twice is a no-op.
    pub id: String,
    pub session_id: String,
    /// Position in the session, starting at 1.
    pub seq: u32,
    /// Only user and assistant exist, on purpose: no message can claim to be system.
    pub role: Role,
    pub content: String,
    /// JSON of the tool call record, as the chat history stores it.
    pub tool_call: Option<String>,
    /// JSON of the tool result record.
    pub tool_result: Option<String>,
    pub ts: String,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SearchHit {
    pub session_id: String,
    pub message_id: String,
    pub seq: u32,
    /// Start of the original message text, for display.
    pub snippet: String,
    /// Higher is a better match.
    pub score: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IntegrityReport {
    pub ok: bool,
    pub problems: Vec<String>,
}

pub trait SessionStore {
    fn schema_version(&self) -> Result<u32, SessionDbError>;
    /// Idempotent by session id.
    fn create_session(&self, row: &SessionRow) -> Result<(), SessionDbError>;
    /// Idempotent by message id; the session must exist. Returns whether the
    /// message was new (`false` when that id was already stored).
    fn append_message(&self, row: &MessageRow) -> Result<bool, SessionDbError>;
    fn finish_session(&self, id: &str, reason: EndReason) -> Result<(), SessionDbError>;
    fn load_messages(&self, session_id: &str) -> Result<Vec<MessageRow>, SessionDbError>;
    /// Most recently updated first.
    fn list_recent(&self, limit: usize) -> Result<Vec<SessionRow>, SessionDbError>;
    /// Every word of `query` must appear; case, accents and Unicode form are ignored.
    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, SessionDbError>;
    fn integrity_check(&self) -> Result<IntegrityReport, SessionDbError>;
}
