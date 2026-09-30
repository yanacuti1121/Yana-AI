//! Getting back to a consistent state after a process died, and after the
//! database file itself is damaged.
//!
//! Only sessions nobody holds (see `lock.rs`) are touched, so a live writer in
//! another process is never interfered with. Nothing here invents history:
//! a gap in message numbers is reported, never filled.

use super::import::{import_chat_history, ImportReport};
use super::lock::try_lock_session;
use super::sqlite::SqliteSessionStore;
use super::{EndReason, MessageRow, SessionDbError, SessionStore, StateKind, StateRoot};
use crate::model::provider::Role;
use rusqlite::{params, Connection, TransactionBehavior};
use std::path::{Path, PathBuf};

/// Text of the stand-in result for a tool call that never got one. Mirrors
/// the wording the JSONL history repair uses.
const INTERRUPTED: &str = "interrupted \u{2014} yana-rt exited (crash or force-quit) before this tool call was resolved; the actual outcome is unknown, do not assume it succeeded or failed";
/// Suffixes of the files SQLite keeps beside the database in WAL mode.
const SIDECARS: [&str; 2] = ["-wal", "-shm"];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RecoveryReport {
    /// Sessions that were open but whose writer is gone.
    pub crashed_sessions: Vec<String>,
    /// Sessions that got a stand-in result for an unresolved tool call.
    pub repaired_tool_calls: Vec<String>,
    /// Sessions whose stored counts were corrected from their messages.
    pub recounted_sessions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorruptionReport {
    /// Where the damaged files were moved to; they are kept unchanged.
    pub quarantined: Vec<PathBuf>,
    /// What was rebuilt from the chat history, when a history directory was given.
    pub imported: Option<ImportReport>,
}

/// Problems the stored counts and message numbers show, one text per problem.
pub(super) fn integrity_problems(conn: &Connection) -> Result<Vec<String>, SessionDbError> {
    let mut problems = Vec::new();
    let mut counts = conn.prepare(
        "SELECT s.id, s.message_count, COUNT(m.id), s.input_tokens, COALESCE(SUM(m.input_tokens), 0),
                s.output_tokens, COALESCE(SUM(m.output_tokens), 0)
         FROM sessions s LEFT JOIN messages m ON m.session_id = s.id GROUP BY s.id ORDER BY s.id",
    )?;
    let rows = counts.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?))
    })?;
    for row in rows {
        let (id, stored, real, in_stored, in_real, out_stored, out_real) = row?;
        for (name, kept, actual) in [("message_count", stored, real), ("input_tokens", in_stored, in_real), ("output_tokens", out_stored, out_real)] {
            if kept != actual {
                problems.push(format!("session {id}: {name} is {kept} but the messages add up to {actual}"));
            }
        }
    }
    let mut gaps = conn.prepare(
        "SELECT session_id, COUNT(*), MAX(seq) FROM messages GROUP BY session_id HAVING MAX(seq) != COUNT(*) ORDER BY session_id",
    )?;
    for row in gaps.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))? {
        let (id, count, max) = row?;
        problems.push(format!("session {id}: gap or repeat in message numbers ({count} messages, highest number {max})"));
    }
    Ok(problems)
}

/// The last message of a session, if it is a tool call nobody answered.
fn dangling_call(messages: &[MessageRow]) -> Option<(String, u32)> {
    let last = messages.last()?;
    let call: serde_json::Value = serde_json::from_str(last.tool_call.as_deref()?).ok()?;
    let call_id = call.get("id")?.as_str()?.to_string();
    Some((call_id, last.seq))
}

fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

impl SqliteSessionStore {
    /// Bring sessions nobody holds back to a consistent state. Safe to repeat.
    pub fn recover(&self) -> Result<RecoveryReport, SessionDbError> {
        let mut report = RecoveryReport::default();
        let sessions: Vec<(String, Option<String>)> = {
            let conn = self.lock();
            let mut statement = conn.prepare("SELECT id, end_reason FROM sessions ORDER BY id")?;
            let rows = statement.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<Result<_, _>>()?
        };
        for (id, end_reason) in sessions {
            // Busy: its writer is alive. Invalid: cannot be locked, so not ours to judge.
            let Ok(_held) = try_lock_session(self.locks_dir(), &id) else { continue };
            if end_reason.is_none() {
                self.finish_session(&id, EndReason::Crashed)?;
                report.crashed_sessions.push(id.clone());
            }
            if self.repair_tool_call(&id)? {
                report.repaired_tool_calls.push(id);
            }
        }
        report.recounted_sessions = self.recount()?;
        Ok(report)
    }

    fn repair_tool_call(&self, id: &str) -> Result<bool, SessionDbError> {
        let messages = self.load_messages(id)?;
        let Some((call_id, seq)) = dangling_call(&messages) else { return Ok(false) };
        let result = serde_json::json!({"call_id": call_id, "output": INTERRUPTED, "is_error": true, "denied": false});
        let row = MessageRow {
            // Fixed from the position, so repairing twice cannot add two.
            id: format!("{id}-interrupted-{}", seq + 1),
            session_id: id.to_string(),
            seq: seq + 1,
            role: Role::User,
            content: String::new(),
            tool_call: None,
            tool_result: Some(result.to_string()),
            ts: now(),
            input_tokens: None,
            output_tokens: None,
        };
        self.append_message(&row)
    }

    /// Correct message and token counts from the messages themselves.
    fn recount(&self) -> Result<Vec<String>, SessionDbError> {
        let mut conn = self.lock();
        let transaction = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let drifted: Vec<String> = {
            let mut statement = transaction.prepare(
                "SELECT s.id FROM sessions s WHERE s.message_count != (SELECT COUNT(*) FROM messages WHERE session_id = s.id)
                    OR s.input_tokens != (SELECT COALESCE(SUM(input_tokens), 0) FROM messages WHERE session_id = s.id)
                    OR s.output_tokens != (SELECT COALESCE(SUM(output_tokens), 0) FROM messages WHERE session_id = s.id)
                 ORDER BY s.id",
            )?;
            let rows = statement.query_map([], |r| r.get(0))?;
            rows.collect::<Result<_, _>>()?
        };
        for id in &drifted {
            transaction.execute(
                "UPDATE sessions SET
                    message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?1),
                    input_tokens = (SELECT COALESCE(SUM(input_tokens), 0) FROM messages WHERE session_id = ?1),
                    output_tokens = (SELECT COALESCE(SUM(output_tokens), 0) FROM messages WHERE session_id = ?1)
                 WHERE id = ?1",
                params![id],
            )?;
        }
        transaction.commit()?;
        Ok(drifted)
    }

    /// Open the database; if the file is damaged, move it aside (unchanged),
    /// start a fresh one, and rebuild it from the chat history when given.
    /// A database from a newer program is an error, never treated as damage.
    pub fn open_or_recover(
        root: &StateRoot,
        history_dir: Option<&Path>,
    ) -> Result<(Self, Option<CorruptionReport>), SessionDbError> {
        match Self::open(root) {
            Ok(store) => Ok((store, None)),
            Err(SessionDbError::Corrupt(_)) => {
                let quarantined = quarantine(&root.path(StateKind::SessionsDb))?;
                let store = Self::open(root)?;
                let imported = match history_dir {
                    Some(dir) => Some(import_chat_history(&store, dir)?),
                    None => None,
                };
                Ok((store, Some(CorruptionReport { quarantined, imported })))
            }
            Err(other) => Err(other),
        }
    }
}

/// Move the database and its WAL files to `<name>.corrupt-<time>`. Empty
/// side files carry nothing and are removed instead.
fn quarantine(db: &Path) -> Result<Vec<PathBuf>, SessionDbError> {
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let io = |what: &str, error: std::io::Error| SessionDbError::Io(format!("{what}: {error}"));
    let mut moved = Vec::new();
    let mut suffixes = vec![""];
    suffixes.extend(SIDECARS);
    for suffix in suffixes {
        let source = PathBuf::from(format!("{}{suffix}", db.display()));
        let Ok(meta) = std::fs::metadata(&source) else { continue };
        if meta.len() == 0 && !suffix.is_empty() {
            std::fs::remove_file(&source).map_err(|e| io("removing an empty side file", e))?;
            continue;
        }
        let mut target = PathBuf::from(format!("{}.corrupt-{stamp}{suffix}", db.display()));
        let mut n = 1;
        while target.exists() {
            target = PathBuf::from(format!("{}.corrupt-{stamp}-{n}{suffix}", db.display()));
            n += 1;
        }
        std::fs::rename(&source, &target).map_err(|e| io("moving the damaged database aside", e))?;
        moved.push(target);
    }
    Ok(moved)
}
