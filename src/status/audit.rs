//! The last few entries of the hash-chained audit log, reduced to time, tool and decision.
//! The logged input is never copied out: it can hold a command line.

use serde::Serialize;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Enough for the last entries without reading a log that may be megabytes long.
const WINDOW_BYTES: u64 = 64 * 1024;
const MAX_FIELD_CHARS: usize = 24;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AuditEntry {
    pub ts: String,
    pub tool: String,
    pub decision: String,
}

impl AuditEntry {
    pub fn is_deny(&self) -> bool {
        let decision = self.decision.to_lowercase();
        decision.contains("deny") || decision.contains("block")
    }
}

fn clean(text: &str) -> String {
    let flat: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    flat.trim().chars().take(MAX_FIELD_CHARS).collect()
}

/// Newest entry first. A line cut in half by the window, or not JSON, is skipped, not an error.
pub fn parse_tail(text: &str, count: usize, window_started_mid_file: bool) -> Vec<AuditEntry> {
    let mut lines: Vec<&str> = text.lines().filter(|line| !line.trim().is_empty()).collect();
    if window_started_mid_file && !lines.is_empty() {
        lines.remove(0);
    }
    lines
        .iter()
        .rev()
        .filter_map(|line| {
            let value: serde_json::Value = serde_json::from_str(line).ok()?;
            let field = |name: &str| value.get(name).and_then(serde_json::Value::as_str).map(clean);
            Some(AuditEntry { ts: field("ts")?, tool: field("tool")?, decision: field("decision")? })
        })
        .take(count)
        .collect()
}

/// `Ok(None)` when the log does not exist yet; an error only when it exists and cannot be read.
pub fn tail(path: &Path, count: usize) -> std::io::Result<Option<Vec<AuditEntry>>> {
    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let size = file.metadata()?.len();
    let start = size.saturating_sub(WINDOW_BYTES);
    file.seek(SeekFrom::Start(start))?;
    let mut bytes = Vec::new();
    file.take(WINDOW_BYTES).read_to_end(&mut bytes)?;
    Ok(Some(parse_tail(&String::from_utf8_lossy(&bytes), count, start > 0)))
}
