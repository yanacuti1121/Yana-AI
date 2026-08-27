//! `git status --porcelain`/`--short`/`-s` compaction.
//!
//! Only the machine-stable porcelain/short format is handled (each line is
//! exactly two status-code characters, a space, then a path) — the
//! long human-readable `git status` format groups files under free-form
//! section headers and is not parsed here, same "decline rather than guess"
//! rule as `git_log`.
//!
//! Tracked changes (modified/added/deleted/renamed — anything whose status
//! code isn't `??`) always survive verbatim, one line each: those are
//! almost always few and are exactly what an agent needs to act on. Only a
//! large block of untracked (`??`) entries — the actual source of token
//! bloat after something like `npm install` into a non-gitignored tree —
//! gets summarized.

use super::{CompactedBody, ExactStats, RawCommandOutput};

const UNTRACKED_WORTH_COMPACTING: usize = 20;
const UNTRACKED_SHOWN: usize = 5;

/// Used by `--detect`. Includes the same v1-porcelain-format-flag
/// requirement `compact()` enforces, so detection doesn't report
/// "recognized" for a plain `git status` (long human format, never
/// compacted) or a `--porcelain=v2` invocation (rejected below — different
/// line shape, would silently miscategorize entries rather than compact
/// correctly) (code-auditor review, 2026-08-27).
pub fn recognizes(command_text: &str) -> bool {
    let mut tokens = command_text.split_whitespace();
    matches!(
        (tokens.next(), tokens.next()),
        (Some("git"), Some("status"))
    ) && is_porcelain_v1_or_short(command_text)
}

/// Only v1 porcelain (or its `--short`/`-s` alias) is handled: each line is
/// `XY path`. `--porcelain=v2` uses a different line shape (a single `?`
/// for untracked, not `??`) that this parser would silently miscategorize
/// as tracked rather than compact correctly — explicitly rejected rather
/// than accepted-but-wrong (code-auditor review, 2026-08-27).
fn is_porcelain_v1_or_short(command_text: &str) -> bool {
    command_text.split_whitespace().any(|token| {
        token == "--porcelain"
            || token == "--porcelain=v1"
            || token == "--porcelain=1"
            || token == "--short"
            || token == "-s"
    })
}

pub fn compact(raw: &RawCommandOutput) -> Option<CompactedBody> {
    if !recognizes(raw.command_text) {
        return None;
    }
    if raw.exit_code != Some(0) || !raw.stderr.is_empty() {
        return None;
    }

    let lines: Vec<&str> = raw.stdout.lines().filter(|line| !line.is_empty()).collect();
    let total = lines.len();
    if total == 0 {
        return None;
    }

    let mut tracked: Vec<&str> = Vec::new();
    let mut untracked_count = 0usize;
    for line in &lines {
        // Porcelain format guarantees at least "XY " (2 status chars + space)
        // before the path. Anything shorter, or where byte offset 2 doesn't
        // land on a UTF-8 character boundary (defense-in-depth: the two
        // status-code bytes are always ASCII in real porcelain output, so
        // this can't happen today, but slicing on a non-boundary would
        // panic and crash the whole process rather than gracefully decline
        // — code-auditor review, 2026-08-27), is a shape we don't
        // recognize — decline entirely rather than guess at a malformed line.
        if line.len() < 3 || !line.is_char_boundary(2) {
            return None;
        }
        if &line[..2] == "??" {
            untracked_count += 1;
        } else {
            tracked.push(line);
        }
    }

    if untracked_count < UNTRACKED_WORTH_COMPACTING {
        return None;
    }

    let mut text = String::new();
    text.push_str(&format!(
        "# git status: {total} entries total, {} tracked change(s), {untracked_count} untracked (exact counts from full output)\n",
        tracked.len()
    ));
    for line in &tracked {
        text.push_str(line);
        text.push('\n');
    }
    let mut shown = 0usize;
    for line in &lines {
        if &line[..2] == "??" {
            if shown >= UNTRACKED_SHOWN {
                break;
            }
            text.push_str(line);
            text.push('\n');
            shown += 1;
        }
    }
    if untracked_count > UNTRACKED_SHOWN {
        text.push_str(&format!(
            "?? ... {} more untracked entries omitted ...\n",
            untracked_count - UNTRACKED_SHOWN
        ));
    }

    Some(CompactedBody {
        text,
        pattern: "git.status.porcelain",
        stats: ExactStats {
            total_count: Some(total),
            ..Default::default()
        },
    })
}
