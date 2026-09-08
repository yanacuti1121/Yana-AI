//! `git log --oneline` compaction.
//!
//! Scope deliberately narrow for MVP: only `--oneline` output is handled,
//! because each non-empty stdout line is exactly one commit — a count with
//! no ambiguity. Plain `git log` (multi-line commit messages) is declined:
//! reliably finding commit boundaries in free-form commit message text is a
//! harder parsing problem than this module takes on, and guessing wrong
//! there is exactly the class of bug this module exists to prevent.

use super::{CompactedBody, ExactStats, RawCommandOutput};

const HEAD_LINES: usize = 15;
const TAIL_LINES: usize = 10;
const MIN_WORTH_COMPACTING: usize = HEAD_LINES + TAIL_LINES + 1;

/// Used by `--detect`. Checks the same format-flag requirement `compact()`
/// itself enforces (tokenized `--oneline` presence) so detection doesn't
/// report "recognized" for a `git log` invocation that will always decline
/// once actually run (code-auditor review, 2026-08-27).
pub fn recognizes(command_text: &str) -> bool {
    let mut tokens = command_text.split_whitespace();
    matches!((tokens.next(), tokens.next()), (Some("git"), Some("log")))
        && command_text.split_whitespace().any(|t| t == "--oneline")
}

pub fn compact(raw: &RawCommandOutput) -> Option<CompactedBody> {
    if !recognizes(raw.command_text) {
        return None;
    }
    // Only compact a clean, successful run — an error or warning on stderr
    // must reach the agent untouched. (The `--oneline` format-flag check
    // itself already happened inside `recognizes()` above, tokenized rather
    // than substring-matched — see its doc comment for why that matters.)
    if raw.exit_code != Some(0) || !raw.stderr.is_empty() {
        return None;
    }

    let lines: Vec<&str> = raw.stdout.lines().filter(|line| !line.is_empty()).collect();
    let total = lines.len();
    if total < MIN_WORTH_COMPACTING {
        return None;
    }

    let mut text = String::new();
    text.push_str(&format!(
        "# {total} commits total (git log --oneline, exact count from full output)\n"
    ));
    for line in lines.iter().take(HEAD_LINES) {
        text.push_str(line);
        text.push('\n');
    }
    let omitted = total.saturating_sub(HEAD_LINES + TAIL_LINES);
    if omitted > 0 {
        text.push_str(&format!("... {omitted} more commits omitted ...\n"));
    }
    for line in lines.iter().skip(total.saturating_sub(TAIL_LINES)) {
        text.push_str(line);
        text.push('\n');
    }

    Some(CompactedBody {
        text,
        pattern: "git.log.oneline",
        stats: ExactStats {
            total_count: Some(total),
            ..Default::default()
        },
    })
}
