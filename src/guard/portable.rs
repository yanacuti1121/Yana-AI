//! Platform-independent destructive-command judgment.
//!
//! This module contains no filesystem, process, or host-policy checks. Both
//! the native guard and the WASM surface compile this exact source.

use std::sync::LazyLock;

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
static RE_GIT_OR_RM: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\b(git|rm)\b").unwrap());
static RE_ADJACENT_VAR_SPLICE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"[A-Za-z]\$\{?[A-Za-z_][A-Za-z0-9_]*\}?[A-Za-z]").unwrap());
static RE_BRACE_EXPANSION: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\{[^{}]*,[^{}]*\}").unwrap());
static RE_PUSH_TO_MAIN: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\s(origin\s+)?(main|master)\b").unwrap());
static RE_RESET_HARD: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"--hard\b").unwrap());
// Inline-script bypass detection (2026-07-24 finding, ported 1:1 from
// core/hooks/guard-destructive.sh — see that file's matching comment for
// the full writeup, including the verified live bypass this closes: bash
// and Rust must stay in sync). Coarse, non-tokenized substring/regex
// checks against the raw command text — content inside a quoted -c/-e
// argument isn't shell syntax, so the token-precise checks above (is_rm_rf
// et al.) never see it as a real "rm" token in the first place.
//
// SECURITY FIX (2026-07-24, round 2 — caught by security-auditor
// adversarial review of round 1; same three findings as
// core/hooks/guard-destructive.sh's matching comment, ported here to keep
// bash and Rust in sync): all five patterns now case-insensitive (`(?i)`)
// — `Python3 -c "..."` and an inner-payload-only-capitalized `os.system('RM
// -RF ...')` both bypassed round 1 on this repo's own case-insensitive
// Darwin filesystem. `bash|sh|zsh` added to the interpreter alternation —
// `bash -c "..."`'s argument is real shell syntax, not a harder evasion
// than python/node/ruby/perl, and was omitted from round 1 entirely.
// `git clean -f` added to the OR-list below (round 1 only checked rm-rf,
// SQL DROP/TRUNCATE, git push --force, git reset --hard).
static RE_INLINE_SCRIPT_INTERPRETER: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\b(python3?|node|ruby|perl|bash|sh|zsh)\b[^|;&]*(-c|-e|--eval)\b")
        .unwrap()
});
static RE_INLINE_RM_RF: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\brm\b[^|;&]*(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive|--force)").unwrap()
});
static RE_INLINE_GIT_FORCE_PUSH: LazyLock<regex::Regex> = LazyLock::new(|| {
    // A single leading (?i) applies to the whole pattern including branches
    // after a top-level `|` (regex crate's own documented behavior,
    // confirmed live during code-auditor review) -- a second (?i) on the
    // right branch was redundant, not a scoping bug, removed for clarity.
    regex::Regex::new(
        r"(?i)\bgit\b[^|;&]*\bpush\b[^|;&]*--force|\bgit\b[^|;&]*--force[^|;&]*\bpush\b",
    )
    .unwrap()
});
static RE_INLINE_GIT_RESET_HARD: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?i)\bgit\b[^|;&]*\breset\b[^|;&]*--hard").unwrap());
static RE_INLINE_GIT_CLEAN_FORCE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\bgit\b[^|;&]*\bclean\b[^|;&]*(-[a-zA-Z]*f[a-zA-Z]*|--force)").unwrap()
});
// Same pattern as destructive_patterns()'s DROP/TRUNCATE entry — a separate
// named regex rather than indexing into DESTRUCTIVE_PATTERNS_COMPILED[0],
// so this check doesn't silently break if that array is ever reordered.
static RE_INLINE_SQL_DESTRUCTIVE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b").unwrap()
});
static DESTRUCTIVE_PATTERNS_COMPILED: LazyLock<Vec<(regex::Regex, &'static str)>> =
    LazyLock::new(|| {
        destructive_patterns()
            .into_iter()
            .map(|(pattern, reason)| {
                (
                    regex::Regex::new(pattern).expect(
                        "destructive_patterns() must contain only valid, fixed regex strings",
                    ),
                    reason,
                )
            })
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
const GIT_GLOBAL_OPTS_WITH_ARG: &[&str] = &[
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--exec-path",
];

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
pub(crate) fn has_adjacent_variable_splice(cmd: &str) -> bool {
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
pub(crate) fn has_brace_expansion(cmd: &str) -> bool {
    if !RE_GIT_OR_RM.is_match(cmd) {
        return false;
    }
    RE_BRACE_EXPANSION.is_match(cmd)
}

/// git push targeting main/master directly, any global-option prefix.
/// Ported 1:1 from `is_git_push_to_main()`.
pub(crate) fn is_git_push_to_main(cmd: &str) -> bool {
    split_segments(cmd)
        .into_iter()
        .any(|seg| git_segment_targets(seg, "push") && RE_PUSH_TO_MAIN.is_match(seg))
}

/// `git reset --hard`, any global-option prefix. Ported 1:1 from
/// `is_git_reset_hard()` — replaces the old plain `git\s+reset\s+--hard`
/// regex, which (like every other adjacency-based check here) was
/// bypassable via `git -C <path> reset --hard` or `git --super-prefix
/// <path> reset --hard`.
pub(crate) fn is_git_reset_hard(cmd: &str) -> bool {
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
pub(crate) fn split_segments(cmd: &str) -> Vec<&str> {
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
        Some(rest)
            if !rest.is_empty()
                && !rest.starts_with('-')
                && rest.chars().all(|c| c.is_ascii_alphabetic()) =>
        {
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
pub(crate) fn is_rm_rf(cmd: &str) -> bool {
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
pub(crate) fn is_git_force(cmd: &str, subcmd: &str) -> bool {
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
/// True if `command` invokes an interpreter with an inline script
/// (-c/-e/--eval) whose raw text contains a destructive pattern. See the
/// static regexes above and core/hooks/guard-destructive.sh's matching
/// comment for the full writeup of the bypass this closes.
fn has_inline_script_bypass(command: &str) -> bool {
    if !RE_INLINE_SCRIPT_INTERPRETER.is_match(command) {
        return false;
    }
    RE_INLINE_RM_RF.is_match(command)
        || RE_INLINE_SQL_DESTRUCTIVE.is_match(command)
        || RE_INLINE_GIT_FORCE_PUSH.is_match(command)
        || RE_INLINE_GIT_RESET_HARD.is_match(command)
        || RE_INLINE_GIT_CLEAN_FORCE.is_match(command)
}

/// `pub`, not the module-private default this function had until Program J's
/// Phase 9 spike (docs/programs/PROGRAM-J-SKELETON.md) needed to call it from
/// `src/mcp.rs` without going through `dispatch()`/`cmd_destructive()` (both
/// route to `std::process::exit()` — `dispatch()` calls it directly,
/// `cmd_destructive()` returns the code `dispatch()` then exits with — fatal
/// either way if invoked from a long-running server process; see Phase 3's
/// Architecture section for why this exact function, not those two, is the
/// real MCP integration point).
pub fn check_command(command: &str) -> Option<&'static str> {
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
        return Some(
            "Blocked: direct push to main/master. Create a feature branch and open a PR instead.",
        );
    }

    for (re, reason) in DESTRUCTIVE_PATTERNS_COMPILED.iter() {
        // Each pattern string embeds its own (?i) where the original bash
        // check used `grep -qiE` (pattern 6 only) — Regex::new respects that
        // inline flag, so no case-insensitive builder option is needed here.
        if re.is_match(command) {
            return Some(reason);
        }
    }

    if has_inline_script_bypass(command) {
        return Some(
            "Blocked: command invokes an interpreter (python/node/ruby/perl/bash/sh/zsh) with an inline script (-c/-e/--eval) whose content appears to contain a destructive pattern (rm -rf, DROP TABLE/TRUNCATE, git push --force, git reset --hard, or git clean -f). This guard cannot safely verify commands embedded inside interpreter scripts. Run the destructive operation directly (not wrapped in an inline script), or ask the human to confirm.",
        );
    }

    None
}
