//! Versioned schema. `PRAGMA user_version` holds how many steps have been
//! applied; step N (1 based) is `STEPS[N - 1]`. To change the schema, append
//! a step; never edit one that has shipped.

use super::SessionDbError;
use rusqlite::Connection;

const SCHEMA_V1: &str = "
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    cwd TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ended_at TEXT,
    end_reason TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    tool_call TEXT,
    tool_result TEXT,
    ts TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    search_text TEXT NOT NULL,
    UNIQUE (session_id, seq)
);
CREATE INDEX idx_messages_session ON messages(session_id, seq);
CREATE VIRTUAL TABLE messages_fts USING fts5(
    search_text, content='messages', content_rowid='rowid', tokenize='unicode61'
);
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, search_text)
    VALUES ('delete', old.rowid, old.search_text);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, search_text)
    VALUES ('delete', old.rowid, old.search_text);
    INSERT INTO messages_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
END;
";

/// Every schema step, oldest first.
pub(super) const STEPS: [&str; 1] = [SCHEMA_V1];

pub(super) fn user_version(conn: &Connection) -> Result<u32, SessionDbError> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))?)
}

/// Apply the steps the database has not seen yet, each in its own
/// transaction, so a failing step changes nothing. A database that is
/// already ahead of `steps` is refused, never downgraded.
pub(super) fn migrate(conn: &mut Connection, steps: &[&str]) -> Result<(), SessionDbError> {
    let current = user_version(conn)?;
    if current as usize > steps.len() {
        return Err(SessionDbError::NewerSchema { found: current, supported: steps.len() as u32 });
    }
    for (index, sql) in steps.iter().enumerate().skip(current as usize) {
        let transaction = conn.transaction()?;
        transaction.execute_batch(sql)?;
        transaction.pragma_update(None, "user_version", index as u32 + 1)?;
        transaction.commit()?;
    }
    Ok(())
}
