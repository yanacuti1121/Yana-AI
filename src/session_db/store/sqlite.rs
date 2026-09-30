//! The SQLite implementation of `SessionStore`.
//!
//! One file per profile. WAL mode and a busy timeout let several processes
//! (the chat TUI and the headless runner) use the same file; every write is
//! one immediate transaction, so writers queue instead of failing.

use super::fold::{fold, search_terms};
use super::lock::try_lock_session;
use super::migrations::{migrate, user_version, STEPS};
use super::recover::integrity_problems;
use super::{
    EndReason, IntegrityReport, MessageRow, SearchHit, SessionDbError, SessionLock, SessionRow,
    SessionStore, StateKind, StateRoot,
};
use crate::model::provider::Role;
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

/// How long a write waits for another writer before giving up.
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);
/// How much of a tool result's output is searchable, so one huge command
/// output does not swell the index.
const TOOL_INDEX_CHARS: usize = 2048;
/// Length of the text preview returned with a search hit.
const SNIPPET_CHARS: i64 = 200;

pub struct SqliteSessionStore {
    conn: Mutex<Connection>,
    locks_dir: PathBuf,
}

impl SqliteSessionStore {
    /// Opens (creating and migrating if needed) the profile's database.
    pub fn open(root: &StateRoot) -> Result<Self, SessionDbError> {
        root.ensure_dir().map_err(|error| SessionDbError::Io(error.to_string()))?;
        let mut conn = Connection::open(root.path(StateKind::SessionsDb))?;
        conn.busy_timeout(BUSY_TIMEOUT)?;
        conn.pragma_update(None, "foreign_keys", true)?;
        // Setting the journal mode answers with a row, so it is read, not executed.
        conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get::<_, String>(0))?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        migrate(&mut conn, &STEPS)?;
        Ok(Self { conn: Mutex::new(conn), locks_dir: root.path(StateKind::SessionLocks) })
    }

    /// Claim a session for writing. Held until the returned lock is dropped
    /// (or the process exits); `Busy` when another process holds it.
    pub fn lock_session(&self, id: &str) -> Result<SessionLock, SessionDbError> {
        try_lock_session(&self.locks_dir, id)
    }

    pub(super) fn locks_dir(&self) -> &Path {
        &self.locks_dir
    }

    pub(super) fn lock(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn to_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn to_u64(value: i64) -> u64 {
    u64::try_from(value).unwrap_or(0)
}

fn role_text(role: Role) -> &'static str {
    match role {
        Role::User => "user",
        Role::Assistant => "assistant",
    }
}

fn parse_role(text: &str) -> Result<Role, SessionDbError> {
    match text {
        "user" => Ok(Role::User),
        "assistant" => Ok(Role::Assistant),
        other => Err(SessionDbError::Sqlite(format!("unknown role {other:?} in the database"))),
    }
}

/// The text that goes into the search index: the message, plus the start of
/// a tool result's output. Folded so search ignores case and accents.
fn search_text(row: &MessageRow) -> String {
    let mut text = fold(&row.content);
    let output = row
        .tool_result
        .as_deref()
        .and_then(|json| serde_json::from_str::<serde_json::Value>(json).ok())
        .and_then(|value| value.get("output").and_then(|o| o.as_str().map(str::to_string)));
    if let Some(output) = output {
        let head: String = output.chars().take(TOOL_INDEX_CHARS).collect();
        text.push(' ');
        text.push_str(&fold(&head));
    }
    text
}

fn session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRow> {
    let reason: Option<String> = row.get("end_reason")?;
    Ok(SessionRow {
        id: row.get("id")?,
        title: row.get("title")?,
        provider: row.get("provider")?,
        model: row.get("model")?,
        cwd: row.get("cwd")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        ended_at: row.get("ended_at")?,
        end_reason: reason.as_deref().and_then(EndReason::parse),
        message_count: row.get("message_count")?,
        input_tokens: to_u64(row.get("input_tokens")?),
        output_tokens: to_u64(row.get("output_tokens")?),
        cache_read_tokens: to_u64(row.get("cache_read_tokens")?),
        cache_write_tokens: to_u64(row.get("cache_write_tokens")?),
    })
}

impl SessionStore for SqliteSessionStore {
    fn schema_version(&self) -> Result<u32, SessionDbError> {
        user_version(&self.lock())
    }

    fn create_session(&self, row: &SessionRow) -> Result<(), SessionDbError> {
        let mut conn = self.lock();
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute(
            "INSERT INTO sessions (id, title, provider, model, cwd, created_at, updated_at, ended_at, end_reason)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO NOTHING",
            params![
                row.id,
                row.title,
                row.provider,
                row.model,
                row.cwd,
                row.created_at,
                row.updated_at,
                row.ended_at,
                row.end_reason.map(EndReason::as_str)
            ],
        )?;
        Ok(transaction.commit()?)
    }

    fn append_message(&self, row: &MessageRow) -> Result<bool, SessionDbError> {
        let mut conn = self.lock();
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let inserted = transaction.execute(
            "INSERT INTO messages
                (id, session_id, seq, role, content, tool_call, tool_result, ts, input_tokens, output_tokens, search_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) ON CONFLICT(id) DO NOTHING",
            params![
                row.id,
                row.session_id,
                row.seq,
                role_text(row.role),
                row.content,
                row.tool_call,
                row.tool_result,
                row.ts,
                row.input_tokens.map(to_i64),
                row.output_tokens.map(to_i64),
                search_text(row)
            ],
        )?;
        if inserted > 0 {
            transaction.execute(
                "UPDATE sessions SET message_count = message_count + 1,
                    input_tokens = input_tokens + ?1, output_tokens = output_tokens + ?2,
                    updated_at = MAX(updated_at, ?3)
                 WHERE id = ?4",
                params![
                    to_i64(row.input_tokens.unwrap_or(0)),
                    to_i64(row.output_tokens.unwrap_or(0)),
                    row.ts,
                    row.session_id
                ],
            )?;
        }
        transaction.commit()?;
        Ok(inserted > 0)
    }

    fn finish_session(&self, id: &str, reason: EndReason) -> Result<(), SessionDbError> {
        let conn = self.lock();
        let changed = conn.execute(
            "UPDATE sessions SET ended_at = ?1, end_reason = ?2 WHERE id = ?3",
            params![now(), reason.as_str(), id],
        )?;
        if changed == 0 {
            return Err(SessionDbError::NotFound(format!("session {id}")));
        }
        Ok(())
    }

    fn load_messages(&self, session_id: &str) -> Result<Vec<MessageRow>, SessionDbError> {
        let conn = self.lock();
        let mut statement = conn.prepare(
            "SELECT id, session_id, seq, role, content, tool_call, tool_result, ts, input_tokens, output_tokens
             FROM messages WHERE session_id = ?1 ORDER BY seq",
        )?;
        let rows = statement.query_map([session_id], |row| {
            let role: String = row.get(3)?;
            Ok((
                MessageRow {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    seq: row.get(2)?,
                    role: Role::User,
                    content: row.get(4)?,
                    tool_call: row.get(5)?,
                    tool_result: row.get(6)?,
                    ts: row.get(7)?,
                    input_tokens: row.get::<_, Option<i64>>(8)?.map(to_u64),
                    output_tokens: row.get::<_, Option<i64>>(9)?.map(to_u64),
                },
                role,
            ))
        })?;
        let mut messages = Vec::new();
        for entry in rows {
            let (mut message, role) = entry?;
            message.role = parse_role(&role)?;
            messages.push(message);
        }
        Ok(messages)
    }

    fn list_recent(&self, limit: usize) -> Result<Vec<SessionRow>, SessionDbError> {
        let conn = self.lock();
        let mut statement =
            conn.prepare("SELECT * FROM sessions ORDER BY updated_at DESC, id LIMIT ?1")?;
        let rows = statement.query_map([to_i64(limit as u64)], session_from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, SessionDbError> {
        let terms = search_terms(query);
        if terms.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        // Terms are letters and digits only, so quoting each one makes it a
        // plain word to the search engine, never an operator.
        let expression = terms.iter().map(|term| format!("\"{term}\"")).collect::<Vec<_>>().join(" ");
        let conn = self.lock();
        let mut statement = conn.prepare(
            "SELECT m.session_id, m.id, m.seq, substr(m.content, 1, ?2), bm25(messages_fts)
             FROM messages_fts JOIN messages AS m ON m.rowid = messages_fts.rowid
             WHERE messages_fts MATCH ?1
             ORDER BY bm25(messages_fts), m.session_id, m.seq LIMIT ?3",
        )?;
        let rows = statement.query_map(params![expression, SNIPPET_CHARS, to_i64(limit as u64)], |row| {
            Ok(SearchHit {
                session_id: row.get(0)?,
                message_id: row.get(1)?,
                seq: row.get(2)?,
                snippet: row.get(3)?,
                score: -row.get::<_, f64>(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn integrity_check(&self) -> Result<IntegrityReport, SessionDbError> {
        let conn = self.lock();
        let mut problems = Vec::new();
        {
            let mut statement = conn.prepare("PRAGMA integrity_check")?;
            for line in statement.query_map([], |row| row.get::<_, String>(0))? {
                let line = line?;
                if line != "ok" {
                    problems.push(line);
                }
            }
        }
        if let Err(error) = conn.execute("INSERT INTO messages_fts(messages_fts) VALUES('integrity-check')", []) {
            problems.push(format!("full-text index: {error}"));
        }
        problems.extend(integrity_problems(&conn)?);
        Ok(IntegrityReport { ok: problems.is_empty(), problems })
    }
}
