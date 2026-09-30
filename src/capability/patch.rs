//! The edit engine behind `file.patch` (WS3 T3, docs/contracts/ws3-tools.md 7).
//!
//! Pure text in, text out: no filesystem, no path handling (`file_patch.rs`
//! does that). Each edit replaces `old` with `new`. Matching is tried from
//! strict to loose and stops at the first level that finds anything:
//!
//! 1. exact text;
//! 2. whole lines, ignoring trailing whitespace (and CR);
//! 3. whole lines, ignoring leading and trailing whitespace; the replacement
//!    is re-indented to the file's indentation.
//!
//! There is no similarity threshold to tune and no guessing beyond those three
//! rules. More than one match is an error unless `replace_all` is set, and the
//! loose levels never run when the exact level found something.

use super::error::CapabilityError;

/// Most edits accepted in one call.
pub const MAX_EDITS: usize = 50;
/// Longest `old` or `new` text accepted, in bytes.
pub const MAX_EDIT_TEXT: usize = 64 * 1024;
/// How many match positions an ambiguity error lists.
const MAX_LISTED_MATCHES: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEdit {
    pub old: String,
    pub new: String,
    pub replace_all: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchLevel {
    Exact,
    TrailingSpace,
    Trimmed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EditReport {
    pub level: MatchLevel,
    pub replacements: usize,
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn validate(index: usize, edit: &FileEdit) -> Result<(), CapabilityError> {
    let n = index + 1;
    if edit.old.trim().is_empty() {
        return Err(invalid(format!("edit {n}: 'old' must not be empty or only whitespace")));
    }
    if edit.old == edit.new {
        return Err(invalid(format!("edit {n}: 'old' and 'new' are identical, nothing to change")));
    }
    if edit.old.len() > MAX_EDIT_TEXT || edit.new.len() > MAX_EDIT_TEXT {
        return Err(invalid(format!("edit {n}: text longer than {MAX_EDIT_TEXT} bytes")));
    }
    Ok(())
}

/// Apply `edits` in order; each sees the result of the one before.
pub fn apply_edits(content: &str, edits: &[FileEdit]) -> Result<(String, Vec<EditReport>), CapabilityError> {
    if edits.is_empty() {
        return Err(invalid("no edits given"));
    }
    if edits.len() > MAX_EDITS {
        return Err(invalid(format!("{} edits given, the limit is {MAX_EDITS}", edits.len())));
    }
    let mut text = content.to_string();
    let mut reports = Vec::with_capacity(edits.len());
    for (index, edit) in edits.iter().enumerate() {
        validate(index, edit)?;
        let (next, report) = apply_one(&text, edit).map_err(|e| prefix(index, e))?;
        text = next;
        reports.push(report);
    }
    Ok((text, reports))
}

fn prefix(index: usize, error: CapabilityError) -> CapabilityError {
    match error {
        CapabilityError::InvalidInput { detail } => invalid(format!("edit {}: {detail}", index + 1)),
        other => other,
    }
}

fn apply_one(content: &str, edit: &FileEdit) -> Result<(String, EditReport), CapabilityError> {
    let exact = content.matches(edit.old.as_str()).count();
    if exact > 0 {
        check_unique(exact, edit, || {
            content.match_indices(edit.old.as_str()).map(|(at, _)| line_of(content, at)).collect()
        })?;
        let text = if edit.replace_all { content.replace(&edit.old, &edit.new) } else { content.replacen(&edit.old, &edit.new, 1) };
        let replacements = if edit.replace_all { exact } else { 1 };
        return Ok((text, EditReport { level: MatchLevel::Exact, replacements }));
    }
    for level in [MatchLevel::TrailingSpace, MatchLevel::Trimmed] {
        if let Some(done) = apply_lines(content, edit, level)? {
            return Ok(done);
        }
    }
    Err(invalid("'old' was not found (tried exact text, then whole lines ignoring trailing whitespace, then whole lines ignoring indentation)"))
}

fn check_unique(count: usize, edit: &FileEdit, lines: impl FnOnce() -> Vec<usize>) -> Result<(), CapabilityError> {
    if count > 1 && !edit.replace_all {
        let listed: Vec<String> = lines().iter().take(MAX_LISTED_MATCHES).map(usize::to_string).collect();
        return Err(invalid(format!(
            "'old' matches {count} places (lines {}); add more surrounding text to make it unique, or set replace_all",
            listed.join(", ")
        )));
    }
    Ok(())
}

fn line_of(content: &str, byte_at: usize) -> usize {
    content[..byte_at].matches('\n').count() + 1
}

fn key(line: &str, level: MatchLevel) -> &str {
    match level {
        MatchLevel::Trimmed => line.trim(),
        _ => line.trim_end(),
    }
}

fn leading_ws(line: &str) -> &str {
    &line[..line.len() - line.trim_start().len()]
}

/// Whole-line matching for the two loose levels. `None` means "nothing found here".
fn apply_lines(content: &str, edit: &FileEdit, level: MatchLevel) -> Result<Option<(String, EditReport)>, CapabilityError> {
    let file: Vec<&str> = content.split_inclusive('\n').collect();
    let wanted: Vec<&str> = edit.old.lines().collect();
    let found = find_windows(&file, &wanted, level);
    if found.is_empty() {
        return Ok(None);
    }
    check_unique(found.len(), edit, || found.iter().map(|at| at + 1).collect())?;
    let chosen: &[usize] = if edit.replace_all { &found } else { &found[..1] };
    let mut out = String::with_capacity(content.len());
    let mut cursor = 0;
    for &at in chosen {
        file[cursor..at].iter().for_each(|line| out.push_str(line));
        out.push_str(&replacement(&file[at..at + wanted.len()], &wanted, edit, level));
        cursor = at + wanted.len();
    }
    file[cursor..].iter().for_each(|line| out.push_str(line));
    Ok(Some((out, EditReport { level, replacements: chosen.len() })))
}

/// Start lines of every non-overlapping window of `file` equal to `wanted` under `level`.
fn find_windows(file: &[&str], wanted: &[&str], level: MatchLevel) -> Vec<usize> {
    let mut found = Vec::new();
    let mut at = 0;
    while at + wanted.len() <= file.len() {
        let same = wanted.iter().enumerate().all(|(i, w)| key(file[at + i], level) == key(w, level));
        if same {
            found.push(at);
            at += wanted.len();
        } else {
            at += 1;
        }
    }
    found
}

/// The text that replaces one matched window: `new`'s lines, with the file's
/// line ending, the window's trailing-newline state, and (loose level) its indentation.
fn replacement(window: &[&str], wanted: &[&str], edit: &FileEdit, level: MatchLevel) -> String {
    let last = window.last().copied().unwrap_or("");
    let ending = if window[0].ends_with("\r\n") { "\r\n" } else { "\n" };
    let (from, to) = match level {
        MatchLevel::Trimmed => (leading_ws(wanted[0]), leading_ws(window[0].trim_end_matches(['\r', '\n']))),
        _ => ("", ""),
    };
    let lines: Vec<String> = edit
        .new
        .lines()
        .map(|line| match line.strip_prefix(from) {
            Some(rest) if !from.is_empty() || !to.is_empty() => format!("{to}{rest}"),
            _ => line.to_string(),
        })
        .collect();
    let mut text = lines.join(ending);
    if last.ends_with('\n') && !lines.is_empty() {
        text.push_str(ending);
    }
    text
}
