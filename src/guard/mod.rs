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
mod entry_point_check;
pub mod lock;
mod portable;
mod self_mod;
mod token_budget;

use clap::Subcommand;
pub use portable::check_command;
#[cfg(test)]
use portable::{
    has_adjacent_variable_splice, has_brace_expansion, is_git_force, is_git_push_to_main,
    is_git_reset_hard, is_rm_rf,
};
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
    /// PostToolUse(Write|Edit|MultiEdit) — advisory reminder per
    /// core/rules/71-entry-point-verify-law.md: a write to a registered
    /// fragile entry-point file (scripts/yana-rt-wrapper.js by default,
    /// extend via YANA_ENTRY_POINT_PATHS) needs an independent verify-agent
    /// real-`exec()` pass, not just a diff re-read. Never denies (the write
    /// already happened by PostToolUse) — surfaces additionalContext only,
    /// same non-blocking shape as infra-review-reminder.sh.
    EntryPointCheck,
    /// Run a command with flock-v1 held for its entire lifetime. After lock
    /// acquisition the command replaces yana-rt, preserving argv, cwd,
    /// environment, signals, and the target's own exit behavior.
    LockWith {
        /// Resource identifier the lock name is derived from — usually the
        /// target file path the wrapped command reads/writes
        #[arg(long)]
        resource: String,
        /// Seconds to wait for the lock to become free before failing
        #[arg(long, default_value = "30")]
        timeout: u64,
        #[arg(trailing_var_arg = true, required = true)]
        command: Vec<String>,
    },
    /// Print the canonical flock-v1 identity and derived lock path.
    LockIdentity {
        #[arg(long)]
        resource: String,
    },
}

pub fn dispatch(action: GuardAction) {
    let code = match action {
        GuardAction::Destructive => cmd_destructive(),
        GuardAction::TokenBudget { tool } => token_budget::cmd_token_budget(tool),
        GuardAction::BlastRadius => blast_radius::cmd_blast_radius(),
        GuardAction::SelfMod => self_mod::cmd_self_mod(),
        GuardAction::EntryPointCheck => entry_point_check::cmd_entry_point_check(),
        GuardAction::LockWith {
            resource,
            timeout,
            command,
        } => lock::cmd_lock_with(&resource, timeout, &command),
        GuardAction::LockIdentity { resource } => lock::cmd_lock_identity(&resource),
    };
    std::process::exit(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// guard destructive
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct HookEvent {
    #[serde(default)]
    tool_name: String,
    #[serde(default)]
    tool_input: serde_json::Value,
}

/// Command-shaped JSON keys — checked as exact tokens (see `tokenize_key`),
/// never raw substring containment, against MCP tool_input payloads.
const COMMAND_LIKE_KEYS: &[&str] = &[
    "command",
    "commands",
    "cmd",
    "script",
    "exec",
    "execute",
    "sql",
    "statement",
    "shell",
    "bash",
    "sh",
];

/// Splits a JSON object key into lowercase tokens on snake_case ('_'/'-')
/// and camelCase boundaries, e.g. "shell_command" -> ["shell","command"],
/// "executeScript" -> ["execute","script"]. Exact-token matching against
/// `COMMAND_LIKE_KEYS` (not substring containment) is deliberate:
/// "description" contains the raw substring "script" ("de-SCRIPT-ion") and
/// must NOT be treated as command-shaped, or a ticket/notes-style MCP tool's
/// `description` field would false-positive-trigger the destructive-command
/// scan below on ordinary prose that merely mentions a dangerous command.
// SECURITY FIX (2026-07-11, caught by code-auditor review of the MCP
// coverage change): the original rule only inserted a `_` boundary before
// an uppercase char whose PREVIOUS char was lowercase/digit — this misses
// an acronym-run-to-word boundary, e.g. "SQLCommand" (S,Q,L all uppercase,
// then "Command") never got a `_` before "Command", so it tokenized to the
// single blob "sqlcommand", which matches nothing in COMMAND_LIKE_KEYS.
// Verified live bypass before this fix: {"SQLCommand":"DROP TABLE users;"}
// was silently allowed by both this function and its jq mirror in
// guard-destructive.sh. Fix: also split when the previous char is
// uppercase AND the char after the current one is lowercase (the acronym
// "SQL" ends, a new capitalized word "Command" begins).
fn tokenize_key(key: &str) -> Vec<String> {
    let chars: Vec<char> = key.chars().collect();
    let mut spaced = String::new();
    for (i, &ch) in chars.iter().enumerate() {
        if ch.is_uppercase() && i > 0 {
            let prev = chars[i - 1];
            let prev_lower_or_digit = prev.is_lowercase() || prev.is_ascii_digit();
            let acronym_to_word_boundary =
                prev.is_uppercase() && chars.get(i + 1).is_some_and(|c| c.is_lowercase());
            if prev_lower_or_digit || acronym_to_word_boundary {
                spaced.push('_');
            }
        }
        spaced.push(ch.to_ascii_lowercase());
    }
    spaced
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// True if any token of `key` (see `tokenize_key`) exactly matches a
/// command-shaped key name.
fn is_command_like_key(key: &str) -> bool {
    tokenize_key(key)
        .iter()
        .any(|t| COMMAND_LIKE_KEYS.contains(&t.as_str()))
}

/// Recursion depth cap for `collect_command_like_strings`, per
/// `core/rules/fuzz-testing-constraints.md`'s "no recursion without a depth
/// limit" requirement — an adversarial MCP tool_input nested thousands of
/// levels deep could otherwise exhaust the stack, which aborts the process
/// outside this hook's documented 0/2 exit contract (the same failure
/// category the 2026-07-10 UTF-8-panic fix elsewhere in this file worried
/// about). Hitting the cap just stops collecting further candidates — it
/// does not affect whatever was already found at shallower depth.
const MAX_COLLECT_DEPTH: usize = 32;

/// Recursively collects the string VALUES of every command-shaped KEY
/// anywhere under `v` (any nesting depth up to `MAX_COLLECT_DEPTH` — MCP
/// servers may nest args under e.g. {"params": {"command": ...}}),
/// appending them to `out`. Only used for MCP tool_input trees (see
/// `cmd_destructive`) — native Bash calls keep using the single
/// `.tool_input.command` field, unchanged.
///
/// SECURITY FIX (2026-07-11, caught by code-auditor + security-auditor
/// review): the original version only extracted a command-shaped key's
/// value when that value was itself a STRING. `COMMAND_LIKE_KEYS` includes
/// "commands" (plural) — which only makes sense for an array-of-strings
/// shape (a batch/sequential-exec MCP tool) — but that shape was silently
/// dropped: the array was recursed into looking for further nested
/// OBJECTS, never checked for bare string elements. Verified live bypass
/// before this fix: {"commands":["rm -rf /tmp/x","echo ok"]} was silently
/// allowed. Fix: when a command-shaped key's value is an array, also
/// collect any string elements directly (in addition to still recursing,
/// so arrays of nested objects keep working exactly as before).
fn collect_command_like_strings(v: &serde_json::Value, out: &mut Vec<String>) {
    collect_command_like_strings_at(v, out, 0);
}

fn collect_command_like_strings_at(v: &serde_json::Value, out: &mut Vec<String>, depth: usize) {
    if depth >= MAX_COLLECT_DEPTH {
        return;
    }
    match v {
        serde_json::Value::Object(map) => {
            for (k, val) in map {
                let key_is_command_like = is_command_like_key(k);
                match val {
                    serde_json::Value::String(s) if key_is_command_like => out.push(s.clone()),
                    serde_json::Value::Array(arr) if key_is_command_like => {
                        for item in arr {
                            if let serde_json::Value::String(s) = item {
                                out.push(s.clone());
                            }
                        }
                    }
                    _ => {}
                }
                collect_command_like_strings_at(val, out, depth + 1);
            }
        }
        serde_json::Value::Array(arr) => {
            for val in arr {
                collect_command_like_strings_at(val, out, depth + 1);
            }
        }
        _ => {}
    }
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

    // Empty/EOF stdin (read_to_string succeeds with an empty buf) is not an
    // error — that just means no tool_input.command to inspect, matching the
    // bash version's `jq -r '.tool_input.command // ""'` on empty input.
    if buf.trim().is_empty() {
        return 0;
    }

    // SECURITY FIX (2026-07-10, same review as split_segments above):
    // non-empty-but-unparseable JSON used to fall through `unwrap_or_default()`
    // into an empty HookEvent → empty command → silent allow, three lines
    // below a comment describing this function's fail-closed philosophy for
    // the stdin-unreadable case — a philosophy that wasn't actually applied
    // here. "Can't verify this input" resolving to "allow" is the opposite
    // of fail-closed. Deny outright when the payload isn't valid JSON at all.
    // (Bash's own analogue for this case isn't a clean reference to match:
    // `jq -r` on invalid JSON under `set -euo pipefail` aborts the whole
    // script with jq's own exit code, not a deny decision — this Rust path
    // is stricter than that, not just "finally matching bash.")
    let event: HookEvent = match serde_json::from_str(&buf) {
        Ok(event) => event,
        Err(_) => {
            return deny_json(
                "Blocked: the destructive-command guard received a tool-call payload that isn't valid JSON. \
                 Failing closed rather than allowing an unverified command through.",
            );
        }
    };
    let primary = event
        .tool_input
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // MCP tool calls (tool_name like mcp__<server>__<tool>) don't share a
    // single field path for command/script content the way native tools do
    // — each server picks its own key. When this is an MCP call, also
    // collect string values at command-shaped keys anywhere in tool_input
    // (any nesting depth) and check each candidate independently below.
    // Mirrors core/hooks/guard-destructive.sh's CANDIDATES array — bash and
    // Rust must stay in sync (see the "Non-negotiable" note in that file).
    let mut candidates = vec![primary];
    if event.tool_name.starts_with("mcp__") {
        collect_command_like_strings(&event.tool_input, &mut candidates);
    }

    for command in candidates.iter().filter(|c| !c.is_empty()) {
        if let Some(reason) = check_command(command) {
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

    // ── Regression tests for the 2026-07-10 global-opt/quoting/expansion
    // bypass fix — one test per case in core/tests/hooks/run-hook-tests.sh
    // that was failing against this module before this fix (verified via
    // `bash core/tests/hooks/run-hook-tests.sh` showing 13 FAILs, all in
    // guard-destructive.sh, none in any other hook).

    #[test]
    fn dash_c_global_opt_no_longer_bypasses_push_force() {
        assert!(is_git_force(
            "git -C /tmp/x push --force origin main",
            "push"
        ));
    }

    #[test]
    fn dash_c_global_opt_no_longer_bypasses_clean_force() {
        assert!(is_git_force("git -C /tmp/x clean -f", "clean"));
    }

    #[test]
    fn dash_c_global_opt_no_longer_bypasses_push_to_main() {
        assert!(is_git_push_to_main("git -C /tmp/x push origin main"));
    }

    #[test]
    fn dash_c_global_opt_no_longer_bypasses_reset_hard() {
        assert!(is_git_reset_hard("git -C /tmp/x reset --hard HEAD~1"));
    }

    #[test]
    fn dash_c_legit_usage_still_allowed() {
        assert!(!is_git_force("git -C /tmp/x status", "push"));
        assert!(!is_git_push_to_main("git -C /tmp/x log --oneline -5"));
    }

    #[test]
    fn unlisted_global_opt_no_longer_bypasses_push_force() {
        assert!(is_git_force(
            "git --super-prefix /tmp/x push --force origin main",
            "push"
        ));
    }

    #[test]
    fn unlisted_global_opt_no_longer_bypasses_clean_force() {
        assert!(is_git_force("git --super-prefix /tmp/x clean -fd", "clean"));
    }

    #[test]
    fn quoted_subcommand_token_no_longer_bypasses() {
        assert!(is_git_force(r#"git "push" --force origin main"#, "push"));
    }

    #[test]
    fn backslash_escaped_subcommand_token_no_longer_bypasses() {
        assert!(is_git_force(r"git \push --force origin main", "push"));
    }

    #[test]
    fn quoted_force_flag_still_blocked() {
        assert!(is_git_force(
            r#"git push "--force" origin feature-branch"#,
            "push"
        ));
    }

    #[test]
    fn quoted_rm_flag_token_no_longer_bypasses() {
        assert!(is_rm_rf(r#"rm "-rf" /tmp/x"#));
    }

    #[test]
    fn ifs_spliced_subcommand_denied_outright() {
        assert!(has_adjacent_variable_splice(
            "git${IFS}push --force origin main"
        ));
    }

    #[test]
    fn ifs_spliced_rm_flag_denied_outright() {
        assert!(has_adjacent_variable_splice("rm${IFS}-rf /tmp/x"));
    }

    #[test]
    fn env_var_prefixed_git_command_not_flagged_as_splice() {
        // Normal `VAR=val cmd` prefix has a space before "git" — not the
        // no-whitespace adjacent-letter shape this check targets.
        assert!(!has_adjacent_variable_splice(
            "GIT_AUTHOR_NAME=x git commit -m test"
        ));
    }

    #[test]
    fn unrelated_adjacent_splice_without_git_or_rm_allowed() {
        assert!(!has_adjacent_variable_splice("echo a${b}c"));
    }

    #[test]
    fn ansi_c_quoted_subcommand_no_longer_bypasses() {
        assert!(is_git_force("git $'push' --force origin main", "push"));
    }

    #[test]
    fn ansi_c_quoted_force_flag_still_blocked() {
        assert!(is_git_force(
            "git push $'--force' origin feature-branch",
            "push"
        ));
    }

    #[test]
    fn brace_expansion_alongside_rm_denied_outright() {
        assert!(has_brace_expansion("rm -{rf,} /tmp/x"));
    }

    #[test]
    fn unrelated_brace_expansion_without_git_or_rm_allowed() {
        assert!(!has_brace_expansion("echo file.{js,ts}"));
    }

    #[test]
    fn reset_hard_still_blocked_without_global_opt() {
        assert!(is_git_reset_hard("git reset --hard"));
        assert!(!is_git_reset_hard("git reset"));
        assert!(!is_git_reset_hard("git reset --soft HEAD~1"));
    }

    #[test]
    fn push_to_main_still_blocked_without_global_opt() {
        assert!(is_git_push_to_main("git push origin main"));
        assert!(is_git_push_to_main("git push master"));
        assert!(!is_git_push_to_main("git push origin feature-branch"));
    }

    // ── Regression tests for the 2026-07-10 UTF-8 panic fix in
    // split_segments(). Before this fix, any multi-byte UTF-8 byte anywhere
    // in the command string (Vietnamese diacritics, an em dash, curly
    // quotes, CJK, emoji) caused an unconditional panic — with no git/rm
    // gate protecting it, unlike the variable-splice/brace-expansion checks.
    // These use `std::panic::catch_unwind` to assert on the actual outcome
    // rather than just "didn't crash the test process."

    fn does_not_panic(f: impl FnOnce() -> bool + std::panic::UnwindSafe) -> bool {
        std::panic::catch_unwind(f).unwrap_or_else(|_| panic!("guard function panicked"))
    }

    #[test]
    fn vietnamese_text_in_benign_command_does_not_panic() {
        assert!(!does_not_panic(|| is_rm_rf("echo \"xin chào thế giới\"")));
        assert!(!does_not_panic(|| is_git_force(
            "git commit -m \"sửa lỗi\"",
            "push"
        )));
    }

    #[test]
    fn em_dash_in_git_commit_message_does_not_panic() {
        // The exact shape the security-auditor review flagged: an em dash
        // inside a git commit message, alongside a real git invocation.
        // The second segment genuinely does push to main, so the correct
        // (non-panicking) outcome is `true`, not merely "didn't crash."
        assert!(does_not_panic(|| is_git_push_to_main(
            "git commit -m \"note — done\" && git push origin main"
        )));
    }

    #[test]
    fn destructive_command_with_vietnamese_text_still_denied() {
        assert!(does_not_panic(|| is_rm_rf(
            "rm -rf /tmp/x # xóa thư mục tạm"
        )));
    }

    #[test]
    fn cjk_and_emoji_in_command_does_not_panic() {
        assert!(!does_not_panic(|| is_rm_rf("echo \"你好 🎉\"")));
    }

    // ── Regression test for the 2026-07-10 malformed-JSON fail-open fix.
    // cmd_destructive() itself reads stdin, so it isn't unit-tested directly
    // here (see core/tests/hooks/run-hook-tests.sh for the integration-level
    // stdin-driven tests) — this covers the JSON-parsing decision in
    // isolation, matching the exact type cmd_destructive() deserializes to.

    #[test]
    fn malformed_json_is_rejected_not_silently_defaulted() {
        let result: Result<HookEvent, _> = serde_json::from_str("not valid json{{{");
        assert!(result.is_err());
    }

    #[test]
    fn empty_json_object_parses_to_empty_command() {
        let event: HookEvent = serde_json::from_str("{}").unwrap();
        assert!(event.tool_input.get("command").is_none());
        assert_eq!(event.tool_name, "");
    }

    #[test]
    fn hook_event_parses_tool_name_and_arbitrary_tool_input_shape() {
        // tool_input is now a raw Value (not a fixed {command} struct) so it
        // can hold whatever shape an MCP server's tool_input actually has.
        let event: HookEvent =
            serde_json::from_str(r#"{"tool_name":"mcp__x__y","tool_input":{"cmd":"ls"}}"#).unwrap();
        assert_eq!(event.tool_name, "mcp__x__y");
        assert_eq!(
            event.tool_input.get("cmd").and_then(|v| v.as_str()),
            Some("ls")
        );
    }

    // ── Regression tests for the 2026-07-11 MCP tool-call coverage fix ─────
    // Before this fix, cmd_destructive() only ever read `.tool_input.command`
    // — an MCP tool call (tool_name like mcp__<server>__<tool>) whose
    // command lived under a server-specific key (cmd, script, nested
    // params.command, ...) produced an empty command string and silently
    // allowed, regardless of what the call actually did.

    #[test]
    fn tokenize_key_splits_snake_case() {
        assert_eq!(tokenize_key("shell_command"), vec!["shell", "command"]);
    }

    #[test]
    fn tokenize_key_splits_camel_case() {
        assert_eq!(tokenize_key("executeScript"), vec!["execute", "script"]);
        assert_eq!(tokenize_key("shellCommand"), vec!["shell", "command"]);
    }

    #[test]
    fn tokenize_key_single_word_stays_one_token() {
        assert_eq!(tokenize_key("description"), vec!["description"]);
        assert_eq!(tokenize_key("command"), vec!["command"]);
    }

    #[test]
    fn is_command_like_key_matches_exact_tokens_only() {
        assert!(is_command_like_key("command"));
        assert!(is_command_like_key("cmd"));
        assert!(is_command_like_key("shell_command"));
        assert!(is_command_like_key("executeScript"));
        assert!(is_command_like_key("params_script"));
    }

    #[test]
    fn is_command_like_key_rejects_substring_false_positives() {
        // "description" contains the raw substring "script" — must NOT
        // match. This is the exact bug this design was written to avoid:
        // a ticket/notes-style MCP tool's free-text description field would
        // otherwise false-positive-trigger the destructive-command scan.
        assert!(!is_command_like_key("description"));
        assert!(!is_command_like_key("content"));
        assert!(!is_command_like_key("message"));
        assert!(!is_command_like_key("prompt"));
        assert!(!is_command_like_key("recommendation")); // contains "command" as substring, must not match on that
    }

    #[test]
    fn collect_command_like_strings_finds_nested_value_ignores_sibling_prose() {
        let v = serde_json::json!({
            "description": "never run rm -rf in prod",
            "params": { "command": "rm -rf /tmp/x" }
        });
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert_eq!(out, vec!["rm -rf /tmp/x".to_string()]);
    }

    #[test]
    fn collect_command_like_strings_finds_camel_case_key_at_top_level() {
        let v = serde_json::json!({ "shellCommand": "git push --force origin main" });
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert_eq!(out, vec!["git push --force origin main".to_string()]);
    }

    #[test]
    fn collect_command_like_strings_descends_into_arrays() {
        let v = serde_json::json!({ "steps": [ { "cmd": "rm -rf /tmp/y" } ] });
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert_eq!(out, vec!["rm -rf /tmp/y".to_string()]);
    }

    #[test]
    fn check_command_denies_rm_rf_regardless_of_source() {
        // check_command has no notion of "which JSON key did this come
        // from" — that filtering happens earlier, in
        // collect_command_like_strings' key matching (tested above). This
        // just confirms the extracted-and-passed-through path still denies.
        assert!(check_command("rm -rf /tmp/x").is_some());
    }

    // ── Regression tests for the 2026-07-11 security/code-auditor review
    // findings on the initial MCP coverage change. Both were verified live
    // bypasses before these fixes.

    #[test]
    fn tokenize_key_splits_acronym_to_word_boundary() {
        // "SQLCommand": an all-caps acronym run (S,Q,L) followed by a new
        // capitalized word ("Command") — the original rule (split only on
        // lowercase/digit -> uppercase) never inserted a boundary here,
        // producing the single blob "sqlcommand", which matches nothing.
        assert_eq!(tokenize_key("SQLCommand"), vec!["sql", "command"]);
        assert_eq!(tokenize_key("URLExecScript"), vec!["url", "exec", "script"]);
    }

    #[test]
    fn tokenize_key_ordinary_camel_case_unaffected_by_acronym_fix() {
        assert_eq!(tokenize_key("shellCommand"), vec!["shell", "command"]);
        assert_eq!(tokenize_key("executeScript"), vec!["execute", "script"]);
    }

    #[test]
    fn is_command_like_key_matches_acronym_prefixed_key() {
        assert!(is_command_like_key("SQLCommand"));
    }

    #[test]
    fn collect_command_like_strings_finds_value_under_acronym_prefixed_key() {
        let v = serde_json::json!({ "SQLCommand": "DROP TABLE users;" });
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert_eq!(out, vec!["DROP TABLE users;".to_string()]);
    }

    #[test]
    fn collect_command_like_strings_extracts_array_of_strings_under_plural_key() {
        // "commands" (plural) is in COMMAND_LIKE_KEYS specifically for this
        // shape — a batch/sequential-exec MCP tool. Before this fix, an
        // array value was recursed into looking for nested OBJECTS only;
        // bare string elements were silently dropped.
        let v = serde_json::json!({ "commands": ["rm -rf /tmp/x", "echo ok"] });
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert_eq!(
            out,
            vec!["rm -rf /tmp/x".to_string(), "echo ok".to_string()]
        );
    }

    #[test]
    fn collect_command_like_strings_array_of_objects_still_works_after_array_fix() {
        // Regression check: the array-of-strings fix must not break the
        // pre-existing array-of-objects case.
        let v = serde_json::json!({ "steps": [ { "cmd": "rm -rf /tmp/y" } ] });
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert_eq!(out, vec!["rm -rf /tmp/y".to_string()]);
    }

    #[test]
    fn collect_command_like_strings_respects_max_depth() {
        // Build a payload nested well past MAX_COLLECT_DEPTH with the
        // command-shaped value at the very bottom — it must NOT be found
        // (proves the cap actually stops recursion), and this must not
        // stack-overflow regardless.
        let mut v = serde_json::json!({ "command": "rm -rf /tmp/deep" });
        for _ in 0..(MAX_COLLECT_DEPTH + 10) {
            v = serde_json::json!({ "wrapper": v });
        }
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert!(
            out.is_empty(),
            "value past MAX_COLLECT_DEPTH must not be collected"
        );
    }

    #[test]
    fn collect_command_like_strings_within_max_depth_still_found() {
        let mut v = serde_json::json!({ "command": "rm -rf /tmp/shallow" });
        for _ in 0..(MAX_COLLECT_DEPTH - 5) {
            v = serde_json::json!({ "wrapper": v });
        }
        let mut out = Vec::new();
        collect_command_like_strings(&v, &mut out);
        assert_eq!(out, vec!["rm -rf /tmp/shallow".to_string()]);
    }

    // ── Regression tests for the 2026-07-24 inline-script bypass fix ────────
    // Verified as a real, live bypass before this fix (both this Rust path
    // and core/hooks/guard-destructive.sh's bash path): every check above
    // tokenizes on shell whitespace, and content inside a quoted -c/-e
    // argument to python/node/ruby/perl isn't shell syntax at all, so
    // `os.system('rm -rf ...')` never produced a bare "rm" token.

    #[test]
    fn python_c_rm_rf_bypass_now_blocked() {
        assert!(check_command("python3 -c \"import os; os.system('rm -rf /tmp/x')\"").is_some());
        assert!(check_command("python -c \"import os; os.system('rm -rf /tmp/x')\"").is_some());
    }

    #[test]
    fn node_e_rm_rf_bypass_now_blocked() {
        assert!(
            check_command("node -e \"require('child_process').execSync('rm -rf /tmp/x')\"")
                .is_some()
        );
    }

    #[test]
    fn ruby_e_and_perl_e_rm_rf_bypass_now_blocked() {
        assert!(check_command("ruby -e \"system('rm -rf /tmp/x')\"").is_some());
        assert!(check_command("perl -e \"system('rm -rf /tmp/x')\"").is_some());
    }

    #[test]
    fn python_c_drop_table_bypass_now_blocked() {
        assert!(check_command("python3 -c \"cursor.execute('DROP TABLE users')\"").is_some());
    }

    #[test]
    fn python_c_git_force_push_bypass_now_blocked() {
        assert!(
            check_command("python3 -c \"os.system('git push --force origin main')\"").is_some()
        );
    }

    #[test]
    fn python_c_git_reset_hard_bypass_now_blocked() {
        assert!(check_command("python3 -c \"os.system('git reset --hard HEAD~5')\"").is_some());
    }

    #[test]
    fn benign_inline_scripts_not_blocked() {
        // Real interpreter -c/-e usage with no destructive pattern anywhere
        // in the script text must stay allowed — this fix is deliberately
        // coarse (substring/regex, not a real interpreter-language parser)
        // and must not turn every inline script into a denial.
        assert!(check_command("python3 -c \"print('hello world')\"").is_none());
        assert!(check_command("python3 -c \"import json; print(json.dumps({'a': 1}))\"").is_none());
        assert!(check_command("node -e \"console.log('hi')\"").is_none());
        assert!(check_command("python3 -c \"print('please remove the file manually')\"").is_none());
        assert!(
            check_command("python3 -c \"import os.path; print(os.path.exists('/tmp'))\"").is_none()
        );
    }

    #[test]
    fn interpreter_without_inline_flag_not_affected() {
        // `python3 script.py` (no -c/-e) is running a real file Yana AI's
        // other tooling can review — this fix must not touch that case.
        assert!(check_command("python3 script.py").is_none());
        assert!(check_command("node index.js").is_none());
    }

    // ── Round 2 (2026-07-24) — security-auditor adversarial review of round 1
    // found all three of these as live bypasses of round 1's own new check,
    // on this repo's own Darwin dev machine (case-insensitive filesystem
    // resolves `Python3`/`RM` to the real binaries).

    #[test]
    fn capitalized_interpreter_name_no_longer_bypasses() {
        assert!(check_command("Python3 -c \"import os; os.system('rm -rf /tmp/x')\"").is_some());
    }

    #[test]
    fn capitalized_inner_payload_no_longer_bypasses() {
        assert!(check_command("python3 -c \"import os; os.system('RM -RF /tmp/x')\"").is_some());
    }

    #[test]
    fn bash_c_and_sh_c_inline_rm_rf_now_blocked() {
        assert!(check_command("bash -c \"rm -rf /tmp/x\"").is_some());
        assert!(check_command("sh -c \"rm -rf /tmp/x\"").is_some());
    }

    #[test]
    fn git_clean_force_inside_interpreter_now_blocked() {
        assert!(check_command("python3 -c \"import os; os.system('git clean -fdx')\"").is_some());
    }
}
