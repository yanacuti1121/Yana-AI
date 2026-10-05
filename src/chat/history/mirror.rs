//! Optional copy of each chat history line into the session database
//! (WS4, docs/contracts/ws4-state.md 14.5).
//!
//! The JSONL file stays the source of truth. This runs after the line is
//! already on disk, is off unless `YANA_SESSION_DB=1`, and never returns an
//! error: a broken or locked database costs a one-time warning, not a chat turn.

use super::HistoryLine;

/// Turns the mirror on. Anything other than `1` leaves it off.
pub(super) const ENV_FLAG: &str = "YANA_SESSION_DB";

pub(super) fn mirror_line(line: &HistoryLine) {
    let enabled = flag_on(std::env::var(ENV_FLAG).ok().as_deref());
    if let Ok(base) = std::env::current_dir() {
        mirror_gated(enabled, &base, line);
    }
}

/// Only the exact value "1" turns the mirror on.
fn flag_on(value: Option<&str>) -> bool {
    value == Some("1")
}

/// `enabled` false does nothing at all: no directory, no file.
#[cfg(feature = "session-db")]
pub(super) fn mirror_gated(enabled: bool, base: &std::path::Path, line: &HistoryLine) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static WARNED: AtomicBool = AtomicBool::new(false);
    if !enabled {
        return;
    }
    if let Err(error) = mirror_at(base, line) {
        // Once per process, so a dead database does not spam every turn.
        if !WARNED.swap(true, Ordering::Relaxed) {
            eprintln!("warning: the session database copy failed ({error}); chat history is still saved");
        }
    }
}

#[cfg(not(feature = "session-db"))]
pub(super) fn mirror_gated(_enabled: bool, _base: &std::path::Path, _line: &HistoryLine) {}

#[cfg(feature = "session-db")]
fn mirror_at(base: &std::path::Path, line: &HistoryLine) -> Result<(), crate::session_db::SessionDbError> {
    use crate::session_db::{message_row, ProfileName, SessionStore, SqliteSessionStore, StateRoot};
    let root = StateRoot::for_profile(base, &ProfileName::default_profile());
    let store = SqliteSessionStore::open(&root)?;
    store.create_session(&session_row(line))?;
    let seq = store.next_seq(&line.session_id)?;
    store.append_message(&message_row(&line.session_id, seq, line))?;
    Ok(())
}

/// A session that is being written now: open, no end time.
#[cfg(feature = "session-db")]
fn session_row(line: &HistoryLine) -> crate::session_db::SessionRow {
    crate::session_db::SessionRow {
        id: line.session_id.clone(),
        title: super::derive_title(&line.content),
        provider: line.provider.clone().unwrap_or_default(),
        model: line.model.clone().unwrap_or_default(),
        cwd: None,
        created_at: line.ts.clone(),
        updated_at: line.ts.clone(),
        ended_at: None,
        end_reason: None,
        message_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
    }
}

#[cfg(all(test, feature = "session-db"))]
mod tests;
