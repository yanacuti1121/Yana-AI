//! JSONL append/load for `.yana-ai/chat-history/<session-id>.jsonl` —
//! follows the exact convention `cost.rs`'s existing `ledger.jsonl` already
//! established for "structured JSONL state yana-rt owns," rather than
//! inventing a new state location.

use super::provider::{ChatMessage, Role};
use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use uuid::Uuid;

pub const SCHEMA_VERSION: &str = "1.0";

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryLine {
    pub schema_version: String,
    pub session_id: String,
    pub id: String,
    pub ts: String,
    pub role: Role,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn history_dir() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join(".yana-ai").join("chat-history")
}

pub fn history_path(session_id: &str) -> PathBuf {
    history_dir().join(format!("{session_id}.jsonl"))
}

fn append_line(session_id: &str, line: &HistoryLine) -> Result<()> {
    let dir = history_dir();
    fs::create_dir_all(&dir)?;
    let json = serde_json::to_string(line)?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(history_path(session_id))?;
    writeln!(file, "{json}")?;
    Ok(())
}

pub fn append_user(session_id: &str, content: &str) -> Result<()> {
    append_line(
        session_id,
        &HistoryLine {
            schema_version: SCHEMA_VERSION.to_string(),
            session_id: session_id.to_string(),
            id: Uuid::new_v4().to_string(),
            ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            role: Role::User,
            content: content.to_string(),
            provider: None,
            model: None,
            input_tokens: None,
            output_tokens: None,
            duration_ms: None,
            truncated: false,
            error: None,
        },
    )
}

#[allow(clippy::too_many_arguments)]
pub fn append_assistant(
    session_id: &str,
    provider: &str,
    model: &str,
    content: &str,
    input_tokens: u64,
    output_tokens: u64,
    duration_ms: u64,
    truncated: bool,
    error: Option<&str>,
) -> Result<()> {
    append_line(
        session_id,
        &HistoryLine {
            schema_version: SCHEMA_VERSION.to_string(),
            session_id: session_id.to_string(),
            id: Uuid::new_v4().to_string(),
            ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            role: Role::Assistant,
            content: content.to_string(),
            provider: Some(provider.to_string()),
            model: Some(model.to_string()),
            input_tokens: Some(input_tokens),
            output_tokens: Some(output_tokens),
            duration_ms: Some(duration_ms),
            truncated,
            error: error.map(|e| e.to_string()),
        },
    )
}

pub struct SessionSummary {
    pub session_id: String,
    pub last_ts: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub turn_count: usize,
    /// First user message, truncated — shown in the recent-sessions list
    /// so `--resume <id>` has something more useful to pick from than a
    /// bare UUID.
    pub preview: String,
}

const PREVIEW_CHARS: usize = 60;

fn summarize_session(path: &std::path::Path) -> Option<SessionSummary> {
    let text = fs::read_to_string(path).ok()?;
    let mut session_id = None;
    let mut last_ts = String::new();
    let mut provider = None;
    let mut model = None;
    let mut turn_count = 0usize;
    let mut preview = String::new();

    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(entry) = serde_json::from_str::<HistoryLine>(line) else { continue };
        session_id.get_or_insert_with(|| entry.session_id.clone());
        last_ts = entry.ts.clone();
        if entry.content.is_empty() {
            continue; // error-marker line — not a real turn
        }
        turn_count += 1;
        if preview.is_empty() && entry.role == Role::User {
            preview = entry.content.chars().take(PREVIEW_CHARS).collect();
        }
        if entry.role == Role::Assistant {
            provider = entry.provider.clone();
            model = entry.model.clone();
        }
    }

    Some(SessionSummary { session_id: session_id?, last_ts, provider, model, turn_count, preview })
}

/// Most recently modified sessions, newest first, for display when opening
/// `yana chat` without `--resume`. Session files are small (a handful of
/// KB for a normal conversation), so a full read per file is cheap — no
/// need for partial/streaming reads at this scale. Sorting key is
/// filesystem mtime (cheap, no parsing needed just to order candidates);
/// per-session *content* (provider/model/preview/turn count) is only
/// parsed for the files that actually make the cut.
pub fn list_recent_sessions(limit: usize) -> Vec<SessionSummary> {
    let Ok(entries) = fs::read_dir(history_dir()) else { return Vec::new() };

    let mut files: Vec<(PathBuf, std::time::SystemTime)> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "jsonl"))
        .filter_map(|e| Some((e.path(), e.metadata().ok()?.modified().ok()?)))
        .collect();
    files.sort_by(|a, b| b.1.cmp(&a.1));
    files.truncate(limit);

    files.iter().filter_map(|(path, _)| summarize_session(path)).collect()
}

/// Load a prior session's turns as conversation context for `--resume`.
/// Lines that fail to parse (corrupted, hand-edited, or — the specific
/// case this guards against — a `"role"` value outside `user`/`assistant`,
/// which `Role`'s enum simply cannot deserialize) are skipped with a
/// warning rather than trusted, per decision 4's no-imported-system-role
/// rule. Error-marker lines (empty content, `truncated: true` with no
/// reply) are skipped since they carry no conversational content to replay.
pub fn load(session_id: &str) -> Result<Vec<ChatMessage>> {
    let path = history_path(session_id);
    if !path.exists() {
        anyhow::bail!("no chat history found for session '{session_id}' at {}", path.display());
    }
    let text = fs::read_to_string(&path)?;
    let mut messages = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<HistoryLine>(line) {
            Ok(entry) if !entry.content.is_empty() => {
                messages.push(ChatMessage { role: entry.role, content: entry.content });
            }
            Ok(_) => {} // empty-content marker line (e.g. a recorded error) — skip
            Err(e) => {
                eprintln!("[chat] warning: skipping unparseable history line {} in {}: {e}", i + 1, path.display());
            }
        }
    }
    Ok(messages)
}
