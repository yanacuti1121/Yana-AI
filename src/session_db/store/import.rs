//! Importing the JSONL chat history (`.yana-ai/chat-history/`) into the database.
//!
//! Read-only on the source: the files are never changed, moved or deleted.
//! Running it again is safe: messages are matched by id, so only lines added
//! since the last run are inserted. Lines that cannot be read (a torn last
//! line after a crash, hand edits) are skipped and reported, not fatal.

use super::lock::valid_session_id;
use super::{EndReason, MessageRow, SessionDbError, SessionRow, SessionStore};
use crate::chat::history::{derive_title, HistoryLine, SessionMetadata};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportProblem {
    pub file: String,
    /// 1 based line number; 0 when the problem concerns the whole file.
    pub line: usize,
    pub why: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportReport {
    pub sessions_seen: usize,
    pub messages_added: usize,
    pub messages_existing: usize,
    /// Lines or metadata that could not be read.
    pub problems: Vec<ImportProblem>,
    /// Files not imported at all, with the reason.
    pub skipped_files: Vec<(String, String)>,
    /// Messages the database refused (id, reason).
    pub failed: Vec<(String, String)>,
}

pub fn import_chat_history(store: &dyn SessionStore, dir: &Path) -> Result<ImportReport, SessionDbError> {
    let mut report = ImportReport::default();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(report),
        Err(error) => return Err(SessionDbError::Io(format!("reading {}: {error}", dir.display()))),
    };
    let mut files: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect();
    files.sort();
    for path in files {
        import_file(store, dir, &path, &mut report)?;
    }
    Ok(report)
}

fn import_file(
    store: &dyn SessionStore,
    dir: &Path,
    path: &Path,
    report: &mut ImportReport,
) -> Result<(), SessionDbError> {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_string();
    if !valid_session_id(&stem) {
        report.skipped_files.push((name, "the file name is not a usable session id".to_string()));
        return Ok(());
    }
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) => {
            report.skipped_files.push((name, format!("cannot read: {error}")));
            return Ok(());
        }
    };
    let lines = parse_lines(&text, &name, report);
    if lines.is_empty() {
        return Ok(());
    }
    let meta = read_meta(&dir.join(format!("{stem}.meta.json")), &name, report);
    store.create_session(&session_row(&stem, meta, &lines))?;
    report.sessions_seen += 1;
    for (index, line) in lines.iter().enumerate() {
        let row = message_row(&stem, index as u32 + 1, line);
        match store.append_message(&row) {
            Ok(true) => report.messages_added += 1,
            Ok(false) => report.messages_existing += 1,
            Err(error) => report.failed.push((row.id, error.to_string())),
        }
    }
    Ok(())
}

/// Readable lines, in order. Unreadable ones go to the report.
fn parse_lines(text: &str, file: &str, report: &mut ImportReport) -> Vec<HistoryLine> {
    let mut lines = Vec::new();
    for (index, raw) in text.lines().enumerate().filter(|(_, raw)| !raw.trim().is_empty()) {
        match serde_json::from_str::<HistoryLine>(raw) {
            Ok(line) => lines.push(line),
            Err(error) => report.problems.push(ImportProblem {
                file: file.to_string(),
                line: index + 1,
                why: error.to_string(),
            }),
        }
    }
    lines
}

fn read_meta(path: &Path, file: &str, report: &mut ImportReport) -> Option<SessionMetadata> {
    let text = fs::read_to_string(path).ok()?;
    match serde_json::from_str(&text) {
        Ok(meta) => Some(meta),
        Err(error) => {
            report.problems.push(ImportProblem {
                file: file.to_string(),
                line: 0,
                why: format!("metadata file unreadable: {error}"),
            });
            None
        }
    }
}

fn session_row(id: &str, meta: Option<SessionMetadata>, lines: &[HistoryLine]) -> SessionRow {
    let first_ts = lines.first().map(|l| l.ts.clone()).unwrap_or_default();
    let last_ts = lines.last().map(|l| l.ts.clone()).unwrap_or_default();
    let first_user = lines.iter().find(|l| l.role == crate::model::provider::Role::User && !l.content.is_empty());
    let first_with = |pick: fn(&HistoryLine) -> Option<&String>| lines.iter().find_map(|l| pick(l).cloned());
    SessionRow {
        id: id.to_string(),
        title: meta.as_ref().map_or_else(|| derive_title(first_user.map_or("", |l| &l.content)), |m| m.title.clone()),
        provider: meta.as_ref().map_or_else(|| first_with(|l| l.provider.as_ref()).unwrap_or_default(), |m| m.provider.clone()),
        model: meta.as_ref().map_or_else(|| first_with(|l| l.model.as_ref()).unwrap_or_default(), |m| m.model.clone()),
        cwd: None,
        created_at: meta.as_ref().map_or(first_ts, |m| m.created_at.clone()),
        updated_at: meta.as_ref().map_or_else(|| last_ts.clone(), |m| m.updated_at.clone()),
        ended_at: Some(last_ts),
        end_reason: Some(EndReason::Imported),
        message_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
    }
}

pub fn message_row(session_id: &str, seq: u32, line: &HistoryLine) -> MessageRow {
    MessageRow {
        id: line.id.clone(),
        session_id: session_id.to_string(),
        seq,
        role: line.role,
        content: line.content.clone(),
        tool_call: line.tool_call.as_ref().and_then(|call| serde_json::to_string(call).ok()),
        tool_result: line.tool_result.as_ref().and_then(|result| serde_json::to_string(result).ok()),
        ts: line.ts.clone(),
        input_tokens: line.input_tokens,
        output_tokens: line.output_tokens,
    }
}
