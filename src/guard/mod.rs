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
mod self_mod;
mod token_budget;

use clap::Subcommand;
use serde::Deserialize;
use std::io::Read;
use std::sync::LazyLock;

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
    /// ADR-008 — run a command with a shared mkdir-based lock held for its
    /// entire execution. Lock name is derived from `--resource` (usually the
    /// target file path being mutated), so bash/Python/Node/Rust callers
    /// touching the same resource contend for the same lock regardless of
    /// which language invoked this. `--timeout` bounds only how long this
    /// call waits for contention to clear — staleness/reclaim eligibility
    /// for a lock another process holds is a separate, fixed threshold
    /// (`YANA_LOCK_STALE_AFTER_SECS`, default 5s — see `src/guard/lock.rs`
    /// module doc for why these two are deliberately not the same number).
    /// See `docs/adr/ADR-008-shared-locking-infrastructure.md` and
    /// `core/lib/locking.sh` (the bash call site this wraps).
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
}

pub fn dispatch(action: GuardAction) {
    let code = match action {
        GuardAction::Destructive => cmd_destructive(),
        GuardAction::TokenBudget { tool } => token_budget::cmd_token_budget(tool),
        GuardAction::BlastRadius => blast_radius::cmd_blast_radius(),
        GuardAction::SelfMod => self_mod::cmd_self_mod(),
        GuardAction::EntryPointCheck => entry_point_check::cmd_entry_point_check(),
        GuardAction::LockWith { resource, timeout, command } =>
            lock::cmd_lock_with(&resource, timeout, &command),
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
    "command", "commands", "cmd", "script", "exec", "execute", "sql", "statement", "shell", "bash", "sh",
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
    spaced.split(|c: char| !c.is_alphanumeric()).filter(|s| !s.is_empty()).map(str::to_string).collect()
}

/// True if any token of `key` (see `tokenize_key`) exactly matches a
/// command-shaped key name.
fn is_command_like_key(key: &str) -> bool {
    tokenize_key(key).iter().any(|t| COMMAND_LIKE_KEYS.contains(&t.as_str()))
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

/// (pattern, case_insensitive, deny reason) — ported 1:1 from the grep -E /
/// grep -qiE checks in core/hooks/guard-destructive.sh, same wording.
/// `git reset --hard` and direct push-to-main moved OUT of this table (see
/// `is_git_reset_hard` / `is_git_push_to_main` below) once the -C/global-opt
/// bypass fix (2026-07-10) needed the same tokenizing approach `is_rm_rf`/
/// `is_git_force` already used — a plain regex can't skip an arbitrary git
/// global option before the subcommand. The two checks left here (destructive
/// SQL, npm publish) have no known tokenizing-bypass, so plain regex is fine.
fn destructive_patterns() -> [(&'static str, &'static str); 2] {
    [
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

// PERFORMANCE FIX (2026-07-11, requested independently by both the human
// reviewer and code-auditor's review of the MCP coverage change): every
// regex below used to be compiled fresh via `regex::Regex::new(...)` on
// every single call — and cmd_destructive() now calls into this check
// pipeline once per MCP candidate string (previously once per invocation
// total), multiplying the redundant compile cost. `LazyLock` (stable since
// Rust 1.80, no new dependency needed) compiles each pattern exactly once
// per process and reuses it for every subsequent call. All `.unwrap()`s
// here are over this file's own fixed, hand-written pattern strings — never
// user/attacker-controlled input — so a compile failure would only ever be
// a bug in this file, not a runtime possibility worth handling gracefully.
static RE_GIT_OR_RM: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"\b(git|rm)\b").unwrap());
static RE_ADJACENT_VAR_SPLICE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"[A-Za-z]\$\{?[A-Za-z_][A-Za-z0-9_]*\}?[A-Za-z]").unwrap());
static RE_BRACE_EXPANSION: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"\{[^{}]*,[^{}]*\}").unwrap());
static RE_PUSH_TO_MAIN: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\s(origin\s+)?(main|master)\b").unwrap());
static RE_RESET_HARD: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"--hard\b").unwrap());
static DESTRUCTIVE_PATTERNS_COMPILED: LazyLock<Vec<(regex::Regex, &'static str)>> = LazyLock::new(|| {
    destructive_patterns()
        .into_iter()
        .map(|(pattern, reason)| (regex::Regex::new(pattern).expect("destructive_patterns() must contain only valid, fixed regex strings"), reason))
        .collect()
});

/// Strip one matching pair of leading/trailing quote characters and
/// un-escape backslashes from a single raw token — ported 1:1 from
/// `strip_tok()` in guard-destructive.sh (2026-07-04 round 3, ANSI-C form
/// added round 4). Applied at every token comparison below so `git "push"
/// --force`, `git \push --force`, `git push "--force"`, `rm "-rf"`, and
/// `git $'push' --force` all resolve to the same token a real shell would
/// build, instead of comparing the raw quoted/escaped text.
fn strip_tok(raw: &str) -> String {
    let mut t = raw.to_string();
    // ANSI-C quoting ($'...') first — must run before the generic backslash
    // unescape below, which would otherwise leave the leading `$'` in place.
    if t.starts_with("$'") && t.ends_with('\'') && t.len() >= 3 {
        t = t[2..t.len() - 1].to_string();
    }
    t = t.replace('\\', ""); // unescape: \X -> X (all backslashes)
    if t.len() >= 2 {
        if t.starts_with('"') && t.ends_with('"') {
            t = t[1..t.len() - 1].to_string();
        } else if t.starts_with('\'') && t.ends_with('\'') {
            t = t[1..t.len() - 1].to_string();
        }
    }
    t
}

/// git global options that consume a separate following argument token
/// (`-C /path`, not `-C=/path`) — ported 1:1 from
/// `_GIT_GLOBAL_OPTS_WITH_ARG` in guard-destructive.sh.
const GIT_GLOBAL_OPTS_WITH_ARG: &[&str] = &["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"];

/// The git subcommand of `seg` (e.g. "push", "clean", "reset"), skipping
/// "git" itself and any global options — with or without a separate
/// argument — that precede it. `None` if `seg` isn't a git invocation.
/// Ported 1:1 from `git_subcommand()` (2026-07-04 audit fix): the previous
/// approach required "git" and the subcommand to be textually adjacent,
/// which any global option before the subcommand (`git -C /path push`)
/// defeated.
fn git_subcommand(seg: &str) -> Option<String> {
    let mut found_git = false;
    let mut skip_next = false;
    for raw in seg.split_whitespace() {
        let tok = strip_tok(raw);
        if skip_next {
            skip_next = false;
            continue;
        }
        if !found_git {
            if tok == "git" || tok.ends_with("/git") {
                found_git = true;
            }
            continue;
        }
        if tok.starts_with("--") && tok.contains('=') {
            continue; // self-contained --opt=value
        }
        if tok.starts_with('-') {
            if GIT_GLOBAL_OPTS_WITH_ARG.contains(&tok.as_str()) {
                skip_next = true;
            }
            continue;
        }
        return Some(tok);
    }
    None
}

/// True if `seg` is a git invocation targeting subcommand `want` — either
/// resolved precisely by `git_subcommand()`, or (fallback, unconditional OR)
/// `want` appears as a bare token anywhere after a genuine `git` invocation.
/// Ported 1:1 from `git_segment_targets()` (2026-07-04 round 2 audit fix):
/// an UNRECOGNIZED global option (e.g. `--super-prefix`, not in
/// `GIT_GLOBAL_OPTS_WITH_ARG`) makes `git_subcommand()` confidently return
/// that option's own argument instead of the real subcommand, so gating the
/// fallback on `git_subcommand()` returning nothing never actually
/// triggers — the fallback must run unconditionally, not as an else-branch.
fn git_segment_targets(seg: &str, want: &str) -> bool {
    if git_subcommand(seg).as_deref() == Some(want) {
        return true;
    }
    let mut found_git = false;
    for raw in seg.split_whitespace() {
        let tok = strip_tok(raw);
        if !found_git {
            if tok == "git" || tok.ends_with("/git") {
                found_git = true;
            }
            continue;
        }
        if tok == want {
            return true;
        }
    }
    false
}

/// True if `cmd` contains a `$VAR`/`${VAR}` reference glued directly between
/// two letters with no separating whitespace (e.g. `git${IFS}push`),
/// alongside a git/rm invocation. Ported 1:1 from the round-3 "suspicious
/// variable-splice" check in guard-destructive.sh: a real shell expands
/// `$IFS` to a space before tokenizing, so `git${IFS}push` executes as
/// `git push` — one opaque token to every whitespace-based check above.
/// This shape has no legitimate use in an ordinary command, so denying
/// outright on it (rather than trying to resolve what it expands to) costs
/// nothing real.
fn has_adjacent_variable_splice(cmd: &str) -> bool {
    if !RE_GIT_OR_RM.is_match(cmd) {
        return false;
    }
    RE_ADJACENT_VAR_SPLICE.is_match(cmd)
}

/// True if `cmd` contains a brace-expansion pattern (e.g. `{a,b}`) alongside
/// a git/rm invocation. Ported 1:1 from the round-4 "suspicious
/// brace-expansion" check: `rm -{rf,} /path` expands, before this guard
/// ever sees it, into the two real arguments `-rf` and `-` — i.e. the
/// actual command executed is `rm -rf - /path`. Brace expansion is a
/// distinct pre-tokenizing phase `strip_tok()` can't fix, so this denies
/// outright on the shape instead of reimplementing bash's expansion
/// algorithm.
fn has_brace_expansion(cmd: &str) -> bool {
    if !RE_GIT_OR_RM.is_match(cmd) {
        return false;
    }
    RE_BRACE_EXPANSION.is_match(cmd)
}

/// git push targeting main/master directly, any global-option prefix.
/// Ported 1:1 from `is_git_push_to_main()`.
fn is_git_push_to_main(cmd: &str) -> bool {
    split_segments(cmd)
        .into_iter()
        .any(|seg| git_segment_targets(seg, "push") && RE_PUSH_TO_MAIN.is_match(seg))
}

/// `git reset --hard`, any global-option prefix. Ported 1:1 from
/// `is_git_reset_hard()` — replaces the old plain `git\s+reset\s+--hard`
/// regex, which (like every other adjacency-based check here) was
/// bypassable via `git -C <path> reset --hard` or `git --super-prefix
/// <path> reset --hard`.
fn is_git_reset_hard(cmd: &str) -> bool {
    split_segments(cmd)
        .into_iter()
        .any(|seg| git_segment_targets(seg, "reset") && RE_RESET_HARD.is_match(seg))
}

/// Split a command line on shell chain/pipe operators (; && || |) so flags
/// from one command in a chain can't leak into the check for a different
/// command (e.g. "ls -r x && curl -f y" must not look like "rm -rf").
///
/// SECURITY FIX (2026-07-10, caught by security-auditor review of the
/// global-opt/quoting/expansion fix): the `else` branch used to advance `i`
/// by a flat 1 byte regardless of the current character's width. `&cmd[i..]`
/// panics if `i` isn't on a UTF-8 char boundary, and a raw `+= 1` lands
/// mid-character on ANY multi-byte UTF-8 input — Vietnamese diacritics, an
/// em dash, curly quotes, CJK, emoji. `git commit -m "note — done"` panicked
/// unconditionally, with no git/rm gate protecting it (unlike
/// `has_adjacent_variable_splice`/`has_brace_expansion`, which check first
/// and use regex `is_match` only, so they were never at risk). `main.rs`'s
/// panic hook exits 1 on an uncaught panic — outside this hook's documented
/// 0/2 exit contract (core/hooks/CLAUDE.md), an unpredictable failure mode
/// for a guard whose whole job is failing closed. Fix: advance by the
/// current character's full UTF-8 byte length, which always lands back on a
/// valid boundary, instead of a flat 1.
fn split_segments(cmd: &str) -> Vec<&str> {
    let mut segs = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < cmd.len() {
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
            let ch_len = rest.chars().next().map(char::len_utf8).unwrap_or(1);
            i += ch_len;
        }
    }
    segs.push(&cmd[start..]);
    segs
}

/// True if a single-dash short-flag cluster token (e.g. "-rf", "-vrf") — NOT
/// a long "--flag" — contains `ch`, case-insensitively (rm accepts -r or -R).
/// Takes the RAW token and strips it internally (mirrors
/// `short_flag_in_token()` calling `strip_tok` itself in the bash version),
/// so a quoted/escaped flag token (`"-rf"`, `\-rf`) is recognized too.
fn short_flag_present(raw_tok: &str, ch: char) -> bool {
    let tok = strip_tok(raw_tok);
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
        for raw in seg.split_whitespace() {
            let tok = strip_tok(raw);
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
            if short_flag_present(raw, 'r') {
                has_r = true;
            }
            if short_flag_present(raw, 'f') {
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
/// Uses `git_segment_targets()` (not a raw string-index comparison) to find
/// the real subcommand, so a global option before it — `git -C <path> push
/// --force`, `git --super-prefix <path> clean -fd` — no longer defeats
/// detection (2026-07-10 fix; the previous `seg.find("git")`/`seg.find(subcmd)`
/// approach was itself a lighter form of the exact adjacency bug the bash
/// version's `git_subcommand()` was written to close).
fn is_git_force(cmd: &str, subcmd: &str) -> bool {
    for seg in split_segments(cmd) {
        if !git_segment_targets(seg, subcmd) {
            continue;
        }
        for raw in seg.split_whitespace() {
            let tok = strip_tok(raw);
            if tok.starts_with("--force") {
                return true;
            }
            if short_flag_present(raw, 'f') {
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
    let primary = event.tool_input.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();

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

/// Runs the full destructive-command check pipeline against a single
/// candidate string, returning the deny reason if any check matches.
/// Order matches guard-destructive.sh exactly: the two deny-outright shape
/// checks (variable-splice, brace-expansion) run first, since they catch
/// expansions that would otherwise defeat every tokenizing check below by
/// producing a different opaque token here than the real argv a shell
/// builds. Extracted out of `cmd_destructive()` so it can be called once per
/// MCP candidate and once for the primary Bash command, unchanged either
/// way — this is the whole point of the design: zero changes to 4-rounds-
/// of-adversarial-review detection logic.
fn check_command(command: &str) -> Option<&'static str> {
    if has_adjacent_variable_splice(command) {
        return Some(
            "Blocked: command contains a variable reference glued directly between two letters (e.g. word${VAR}word) with no separating whitespace, alongside a git/rm invocation. This guard cannot safely verify commands using this pattern. Run the command without adjacent-letter variable splicing, or ask the human to confirm.",
        );
    }
    if has_brace_expansion(command) {
        return Some(
            "Blocked: command contains a brace-expansion pattern (e.g. {a,b}) alongside a git/rm invocation. This guard cannot safely verify commands using this pattern — brace expansion generates new arguments before any guard sees them. Run the command without brace expansion, or ask the human to confirm.",
        );
    }

    if is_rm_rf(command) {
        return Some(
            "Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible. Use targeted 'rm' with explicit paths, or ask the human to confirm first.",
        );
    }
    if is_git_force(command, "push") {
        return Some(
            "Blocked: 'git push --force' (any flag spelling) is not allowed. The orchestrator pushes branches; force-pushing risks overwriting shared history.",
        );
    }
    if is_git_reset_hard(command) {
        return Some("Blocked: 'git reset --hard' discards uncommitted work irreversibly. Use 'git stash' or commit before resetting.");
    }
    if is_git_force(command, "clean") {
        return Some("Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked files. Ask the human to confirm before running this.");
    }
    if is_git_push_to_main(command) {
        return Some("Blocked: direct push to main/master. Create a feature branch and open a PR instead.");
    }

    for (re, reason) in DESTRUCTIVE_PATTERNS_COMPILED.iter() {
        // Each pattern string embeds its own (?i) where the original bash
        // check used `grep -qiE` (pattern 6 only) — Regex::new respects that
        // inline flag, so no case-insensitive builder option is needed here.
        if re.is_match(command) {
            return Some(reason);
        }
    }

    None
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
        assert!(is_git_force("git -C /tmp/x push --force origin main", "push"));
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
        assert!(is_git_force("git --super-prefix /tmp/x push --force origin main", "push"));
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
        assert!(is_git_force(r#"git push "--force" origin feature-branch"#, "push"));
    }

    #[test]
    fn quoted_rm_flag_token_no_longer_bypasses() {
        assert!(is_rm_rf(r#"rm "-rf" /tmp/x"#));
    }

    #[test]
    fn ifs_spliced_subcommand_denied_outright() {
        assert!(has_adjacent_variable_splice("git${IFS}push --force origin main"));
    }

    #[test]
    fn ifs_spliced_rm_flag_denied_outright() {
        assert!(has_adjacent_variable_splice("rm${IFS}-rf /tmp/x"));
    }

    #[test]
    fn env_var_prefixed_git_command_not_flagged_as_splice() {
        // Normal `VAR=val cmd` prefix has a space before "git" — not the
        // no-whitespace adjacent-letter shape this check targets.
        assert!(!has_adjacent_variable_splice("GIT_AUTHOR_NAME=x git commit -m test"));
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
        assert!(is_git_force("git push $'--force' origin feature-branch", "push"));
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
        assert!(!does_not_panic(|| is_git_force("git commit -m \"sửa lỗi\"", "push")));
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
        assert_eq!(event.tool_input.get("cmd").and_then(|v| v.as_str()), Some("ls"));
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
        assert_eq!(out, vec!["rm -rf /tmp/x".to_string(), "echo ok".to_string()]);
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
        assert!(out.is_empty(), "value past MAX_COLLECT_DEPTH must not be collected");
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
}
