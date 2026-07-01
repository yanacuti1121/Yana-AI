//! guard — native Rust ports of the highest-frequency PreToolUse hooks.
//!
//! Both hooks below run on (close to) every single tool call an agent makes.
//! The original `core/hooks/*.sh` implementations are correct but pay a real
//! performance + robustness tax on that hot path:
//!
//!   - `guard-destructive.sh` shells out to `jq` for JSON parsing and FAILS
//!     CLOSED (blocks every Bash command) if `jq` isn't installed — a real
//!     issue, not hypothetical (hit during the 2026-06-21 audit sandbox,
//!     which had no `jq`).
//!   - `token-budget-guard.sh` spawns a fresh Node.js process up to 5 times
//!     *per tool call* just to read/write two small JSON state files. Node
//!     startup alone is commonly 30-80ms; five of those per call adds up
//!     fast over a long agent session.
//!
//! These two subcommands do the same work in-process: no subprocess spawn,
//! no `jq`/Node dependency, same JSON state file formats (so a session can
//! freely mix bash-hook and Rust-hook invocations across different tool
//! calls without the state files diverging).
//!
//! `core/hooks/guard-destructive.sh` and `core/hooks/token-budget-guard.sh`
//! were updated to call `yana-rt guard ...` first when the binary is on
//! PATH, falling back to their original jq/Node logic unchanged otherwise —
//! so nothing breaks for anyone who hasn't built/installed yana-rt yet.

mod blast_paths;
mod blast_radius;
mod self_mod;
mod token_budget;

use clap::Subcommand;
use serde::Deserialize;
use std::io::Read;

#[derive(Subcommand)]
pub enum GuardAction {
    /// PreToolUse(Bash) — block destructive shell commands (rm -rf, force-push,
    /// DROP TABLE, npm publish...). Rust port of core/hooks/guard-destructive.sh
    /// — identical rules and deny messages, no `jq` dependency.
    Destructive,
    /// PreToolUse(.*) — token budget tracking + loop circuit breaker. Rust port
    /// of core/hooks/token-budget-guard.sh — same state files
    /// (token-budget.json / circuit-state.json), no Node.js spawn per check.
    TokenBudget {
        /// Tool name for this call (defaults to $CLAUDE_TOOL_NAME)
        #[arg(long)]
        tool: Option<String>,
    },
    /// PreToolUse(Bash) — block by CONSEQUENCE, not command name. Measures how
    /// many real files a write/delete-class command would hit (rm, find
    /// -delete, truncate, redirections, git clean...) and denies if it exceeds
    /// the blast-radius ceiling or targets a protected path. Catches the
    /// `find . -delete` / `git push origin +main` bypasses the regex-based
    /// `destructive` guard structurally cannot. Tunables: YANA_BLAST_MAX_FILES,
    /// YANA_BLAST_WALK_CAP, YANA_BLAST_PROTECTED.
    BlastRadius,
    /// PreToolUse(Write|Edit|str_replace) — quarantine writes to Yana AI's own
    /// safety surface (rules, hooks, gates, guard source, hook registry).
    /// Closes the gap blast_radius can't: a single str_replace on
    /// gates/truth_gate.md bypasses blast_radius (1 file < 50 limit) but is
    /// the most dangerous self-modification possible. Every denied attempt is
    /// appended to ledger/selfmod-tamper.log for audit.
    SelfMod,
}

pub fn dispatch(action: GuardAction) {
    let code = match action {
        GuardAction::Destructive => cmd_destructive(),
        GuardAction::TokenBudget { tool } => token_budget::cmd_token_budget(tool),
        GuardAction::BlastRadius => blast_radius::cmd_blast_radius(),
        GuardAction::SelfMod => self_mod::cmd_self_mod(),
    };
    std::process::exit(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// guard destructive
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct ToolInput {
    command: Option<String>,
}

#[derive(Deserialize, Default)]
struct HookEvent {
    #[serde(default)]
    tool_input: ToolInput,
}

/// (pattern, case_insensitive, deny reason) — ported 1:1 from the grep -E /
/// grep -qiE checks in core/hooks/guard-destructive.sh, same wording.
/// NOTE (2026-07-08 audit fix): the `rm -rf`, `git push --force`, and
/// `git clean -f` checks moved OUT of this table and into dedicated
/// tokenizing functions below — Rust's `regex` crate is intentionally
/// linear-time and doesn't support the lookahead a single regex would need
/// to express "contains recursive AND force, in any flag spelling/order".
/// The remaining checks here (git reset --hard, destructive SQL, npm
/// publish) have no known short-flag-combination bypass, so plain regex
/// is still fine for them.
fn destructive_patterns() -> [(&'static str, &'static str); 4] {
    [
        (
            r"git\s+reset\s+--hard",
            "Blocked: 'git reset --hard' discards uncommitted work irreversibly. Use 'git stash' or commit before resetting.",
        ),
        (
            r"git\s+push\s+(origin\s+)?(main|master)\b",
            "Blocked: direct push to main/master. Create a feature branch and open a PR instead.",
        ),
        (
            // (?i) = case-insensitive, matches the original's `grep -qiE`
            r"(?i)\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b",
            "Blocked: destructive SQL (DROP TABLE / TRUNCATE) detected. Database migrations must be reversible. Use ALTER/soft-delete patterns and ask the human to confirm schema drops.",
        ),
        (
            r"npm\s+publish|yarn\s+publish|pnpm\s+publish",
            "Blocked: publishing to npm requires explicit human approval. Ask the human to run this command manually.",
        ),
    ]
}

/// Split a command line on shell chain/pipe operators (; && || |) so flags
/// from one command in a chain can't leak into the check for a different
/// command (e.g. "ls -r x && curl -f y" must not look like "rm -rf").
fn split_segments(cmd: &str) -> Vec<&str> {
    let mut segs = Vec::new();
    let mut start = 0;
    let bytes = cmd.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let rest = &cmd[i..];
        if rest.starts_with("&&") || rest.starts_with("||") {
            segs.push(&cmd[start..i]);
            i += 2;
            start = i;
        } else if rest.starts_with(';') || rest.starts_with('|') {
            segs.push(&cmd[start..i]);
            i += 1;
            start = i;
        } else {
            i += 1;
        }
    }
    segs.push(&cmd[start..]);
    segs
}

/// True if a single-dash short-flag cluster token (e.g. "-rf", "-vrf") — NOT
/// a long "--flag" — contains `ch`, case-insensitively (rm accepts -r or -R).
fn short_flag_present(tok: &str, ch: char) -> bool {
    match tok.strip_prefix('-') {
        Some(rest) if !rest.is_empty() && !rest.starts_with('-') && rest.chars().all(|c| c.is_ascii_alphabetic()) => {
            rest.chars().any(|c| c.eq_ignore_ascii_case(&ch))
        }
        _ => false,
    }
}

/// rm invocation with BOTH recursive and force semantics present, in any
/// spelling: combined short (-rf/-fr), separated short (-r -f), long form
/// (--recursive --force), or mixed with other short flags (-vrf).
/// Verified bypasses of the old single-regex check this replaces:
/// `rm --recursive --force .`, `rm -r -f .`, and flag-order variants.
fn is_rm_rf(cmd: &str) -> bool {
    for seg in split_segments(cmd) {
        let mut in_rm = false;
        let (mut has_r, mut has_f) = (false, false);
        for tok in seg.split_whitespace() {
            if !in_rm {
                if tok == "rm" || tok.ends_with("/rm") {
                    in_rm = true;
                }
                continue;
            }
            if tok == "--recursive" || tok.starts_with("--recursive=") {
                has_r = true;
            }
            if tok == "--force" || tok.starts_with("--force") {
                has_f = true;
            }
            if short_flag_present(tok, 'r') {
                has_r = true;
            }
            if short_flag_present(tok, 'f') {
                has_f = true;
            }
        }
        if has_r && has_f {
            return true;
        }
    }
    false
}

/// git push/clean with force semantics present, in any spelling. `subcmd`
/// is "push" or "clean". For push this intentionally also matches
/// `--force-with-lease*`, mirroring the original rule's conservative intent.
fn is_git_force(cmd: &str, subcmd: &str) -> bool {
    for seg in split_segments(cmd) {
        let has_git = seg.split_whitespace().any(|t| t == "git");
        let sub_idx = seg.find(subcmd);
        let git_idx = seg.find("git");
        let ordered = matches!((git_idx, sub_idx), (Some(g), Some(s)) if s > g);
        if !(has_git && ordered) {
            continue;
        }
        for tok in seg.split_whitespace() {
            if tok.starts_with("--force") {
                return true;
            }
            if short_flag_present(tok, 'f') {
                return true;
            }
        }
    }
    false
}

fn deny_json(reason: &str) -> i32 {
    let out = serde_json::json!({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    });
    println!("{out}");
    2
}

fn cmd_destructive() -> i32 {
    let mut buf = String::new();
    if std::io::stdin().read_to_string(&mut buf).is_err() {
        // Mirrors the bash version's fail-closed philosophy: a guard that
        // cannot read its own input cannot prove a command is safe, so it
        // must not pass it through silently. The bash script's analogue is
        // the missing-`jq` case (also a deny); this is the Rust equivalent
        // for the rarer "stdin itself is unreadable" failure.
        return deny_json(
            "Blocked: the destructive-command guard could not read the tool-call payload from stdin. \
             Failing closed rather than allowing an unverified command through.",
        );
    }

    // Empty/EOF stdin is not an error (read_to_string still succeeds with an
    // empty buf) — that just means no tool_input.command to inspect, so the
    // event parses to an empty command below and nothing matches. This is
    // the same behaviour as the bash version's `jq -r '.tool_input.command // ""'`.
    let event: HookEvent = serde_json::from_str(&buf).unwrap_or_default();
    let command = event.tool_input.command.unwrap_or_default();
    if command.is_empty() {
        return 0;
    }

    if is_rm_rf(&command) {
        return deny_json(
            "Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible. Use targeted 'rm' with explicit paths, or ask the human to confirm first.",
        );
    }
    if is_git_force(&command, "push") {
        return deny_json(
            "Blocked: 'git push --force' (any flag spelling) is not allowed. The orchestrator pushes branches; force-pushing risks overwriting shared history.",
        );
    }
    if is_git_force(&command, "clean") {
        return deny_json(
            "Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked files. Ask the human to confirm before running this.",
        );
    }

    for (pattern, reason) in destructive_patterns() {
        // Each pattern string embeds its own (?i) where the original bash
        // check used `grep -qiE` (pattern 6 only) — Regex::new respects that
        // inline flag, so no case-insensitive builder option is needed here.
        let re = match regex::Regex::new(pattern) {
            Ok(re) => re,
            Err(_) => continue, // unreachable for our fixed pattern set, but never panic on a guard
        };
        if re.is_match(&command) {
            return deny_json(reason);
        }
    }

    0
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Regression tests for the 2026-07-08 bypass fix ──────────────────────
    // Each of these commands is functionally identical to a form the old
    // single-regex check caught, differing only in flag spelling. Verified
    // as real bypasses against the pre-fix code (empirically, via bash
    // equivalents) before this fix — not hypothetical.

    #[test]
    fn rm_rf_combined_still_blocked() {
        assert!(is_rm_rf("rm -rf /tmp/x"));
        assert!(is_rm_rf("rm -fr /tmp/x"));
        assert!(is_rm_rf("rm -Rf /tmp/x"));
    }

    #[test]
    fn rm_rf_long_form_bypass_fixed() {
        assert!(is_rm_rf("rm --recursive --force /tmp/x"));
        assert!(is_rm_rf("rm --force --recursive /tmp/x"));
    }

    #[test]
    fn rm_rf_separated_short_flags_bypass_fixed() {
        assert!(is_rm_rf("rm -r -f /tmp/x"));
        assert!(is_rm_rf("rm -f -r /tmp/x"));
    }

    #[test]
    fn rm_rf_mixed_form_bypass_fixed() {
        assert!(is_rm_rf("rm --recursive -f /tmp/x"));
        assert!(is_rm_rf("rm -r --force /tmp/x"));
    }

    #[test]
    fn rm_recursive_alone_not_blocked() {
        // -r without -f is not silent/irreversible in the same way — matches
        // the original rule's intent of requiring BOTH, not just recursion.
        assert!(!is_rm_rf("rm -r /tmp/x"));
        assert!(!is_rm_rf("rm -f /tmp/x"));
        assert!(!is_rm_rf("rm /tmp/x"));
    }

    #[test]
    fn rm_rf_in_chain_still_caught_unrelated_not_flagged() {
        assert!(is_rm_rf("cd /tmp && rm -rf x"));
        assert!(is_rm_rf("echo hi; rm -rf /tmp/x"));
        // A short "-r" on one command and unrelated "-f" on another, joined
        // by a chain operator, must NOT be treated as one rm -rf.
        assert!(!is_rm_rf("ls -r foo && curl -f url"));
    }

    #[test]
    fn git_push_force_combined_short_flags_bypass_fixed() {
        assert!(is_git_force("git push -uf origin main", "push"));
        assert!(is_git_force("git push -fu origin main", "push"));
    }

    #[test]
    fn git_push_force_original_forms_still_blocked() {
        assert!(is_git_force("git push --force origin main", "push"));
        assert!(is_git_force("git push -f origin main", "push"));
        assert!(is_git_force("git push --force-with-lease", "push"));
    }

    #[test]
    fn git_push_without_force_allowed() {
        assert!(!is_git_force("git push origin main", "push"));
    }

    #[test]
    fn git_clean_force_flag_order_bypass_fixed() {
        assert!(is_git_force("git clean -df", "clean"));
        assert!(is_git_force("git clean -xdf", "clean"));
    }

    #[test]
    fn git_clean_force_original_forms_still_blocked() {
        assert!(is_git_force("git clean -f", "clean"));
        assert!(is_git_force("git clean -fd", "clean"));
    }

    #[test]
    fn git_clean_dry_run_allowed() {
        assert!(!is_git_force("git clean -n", "clean"));
    }
}
