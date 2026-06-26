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

mod blast_radius;
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
}

pub fn dispatch(action: GuardAction) {
    let code = match action {
        GuardAction::Destructive => cmd_destructive(),
        GuardAction::TokenBudget { tool } => token_budget::cmd_token_budget(tool),
        GuardAction::BlastRadius => blast_radius::cmd_blast_radius(),
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
fn destructive_patterns() -> [(&'static str, &'static str); 7] {
    [
        (
            r"(^|[;&|])\s*rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+-[a-zA-Z]*f[a-zA-Z]*r",
            "Blocked: 'rm -rf' is irreversible. Use targeted 'rm' with explicit paths, or ask the human to confirm first.",
        ),
        (
            r"git\s+push\s+.*--force|git\s+push\s+.*-f\b",
            "Blocked: 'git push --force' is not allowed. The orchestrator pushes branches; force-pushing risks overwriting shared history.",
        ),
        (
            r"git\s+reset\s+--hard",
            "Blocked: 'git reset --hard' discards uncommitted work irreversibly. Use 'git stash' or commit before resetting.",
        ),
        (
            r"git\s+clean\s+.*-f",
            "Blocked: 'git clean -f' permanently deletes untracked files. Ask the human to confirm before running this.",
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
