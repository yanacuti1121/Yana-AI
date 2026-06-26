//! guard blast-radius — block by CONSEQUENCE, not by command name.
//!
//! Why this exists
//! ---------------
//! `guard destructive` (the sibling module) matches the *text* of a command
//! against 8 regex patterns. That is the weakest possible defense: it is a
//! blocklist, and a blocklist is an endless catch-up game. Concrete bypasses
//! that `destructive` lets straight through today:
//!
//!     rm -rf build/           BLOCKED   (matches the rm-rf pattern)
//!     find . -delete          ALLOWED   (deletes just as much, no `rm`)
//!     find . -exec rm {} +    ALLOWED   (the `rm` isn't in `rm -rf` shape)
//!     DROP TABLE users        BLOCKED
//!     DELETE FROM users       ALLOWED   (empties the table, no DROP)
//!     truncate -s 0 *.db      ALLOWED   (zeroes files, not "TRUNCATE TABLE")
//!     git push origin +main   ALLOWED   (force via refspec '+', no --force)
//!
//! The fix is not "add 7 more patterns" — there is always an 8th bypass.
//! The fix is to stop guessing intent from the verb and instead measure the
//! *blast radius*: how many real files on disk this command can write to or
//! destroy, and whether any of them sit inside a protected path. A command
//! that touches 4000 files or reaches into `core/rules/` is dangerous
//! regardless of whether it spells itself `rm`, `find`, or `truncate`.
//!
//! What it does
//! ------------
//! 1. Read the PreToolUse payload from stdin (same envelope as `destructive`).
//! 2. Tokenize the command with `shell-words` (handles quotes/escapes — a
//!    naive split would miscount `rm "a b"` as two paths).
//! 3. Pull out the path-like operands of *write/delete-class* tools
//!    (rm, find -delete/-exec rm, mv, truncate, dd, shred, tee, cp -r over
//!    existing trees, redirections `>`/`>>`, git clean, etc).
//! 4. For each operand, expand globs and walk the tree (see `blast_radius_fs`)
//!    to get the REAL count of files that would be hit, capped so a walk
//!    over `/` can't hang the guard.
//! 5. Deny if (a) any operand resolves inside a protected path, or
//!    (b) the total file count exceeds the configured ceiling.
//!
//! This is advisory-grade containment (it runs before the command, in the
//! agent's own filesystem view) — it is NOT a kernel sandbox and does not
//! claim to be. It closes the "looks innocent, wipes the repo" gap that the
//! regex guard structurally cannot.

#[path = "blast_radius_fs.rs"]
mod fs_measure;

use fs_measure::{count_files, repo_relative};
use serde::Deserialize;
use std::io::Read;
use std::path::Path;

// ── Tunables (env-overridable so a session can tighten/loosen per task) ──────

/// Max files a single command may touch before it's blocked.
fn max_files() -> usize {
    std::env::var("YANA_BLAST_MAX_FILES")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(50)
}

/// Hard cap on how many entries we'll walk per operand, so a `find /` style
/// argument can't make the guard itself spin. If a walk hits this cap we treat
/// the operand as "definitely over budget" and block — failing safe.
fn walk_cap() -> usize {
    std::env::var("YANA_BLAST_WALK_CAP")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5000)
}

/// Repo-relative prefixes that must never be the target of a bulk write/delete.
/// These are the files that ARE Yana AI's safety surface — letting an agent
/// rewrite them in bulk is the self-modification hole. Extend via
/// YANA_BLAST_PROTECTED (colon-separated) without recompiling.
fn protected_prefixes() -> Vec<String> {
    let mut v = vec![
        "core/rules".to_string(),
        "core/hooks".to_string(),
        "core/gates".to_string(),
        "gates".to_string(),
        ".git".to_string(),
        "memory/L1_atomic".to_string(),
    ];
    if let Ok(extra) = std::env::var("YANA_BLAST_PROTECTED") {
        v.extend(extra.split(':').filter(|s| !s.is_empty()).map(String::from));
    }
    v
}

// ── Hook envelope (same shape the destructive guard parses) ─────────────────

#[derive(Deserialize, Default)]
struct ToolInput {
    command: Option<String>,
}
#[derive(Deserialize, Default)]
struct HookEvent {
    #[serde(default)]
    tool_input: ToolInput,
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

pub fn cmd_blast_radius() -> i32 {
    let mut buf = String::new();
    if std::io::stdin().read_to_string(&mut buf).is_err() {
        return deny_json(
            "Blocked: blast-radius guard could not read the tool-call payload from stdin. \
             Failing closed rather than allowing an unmeasured command through.",
        );
    }
    let event: HookEvent = serde_json::from_str(&buf).unwrap_or_default();
    let command = event.tool_input.command.unwrap_or_default();
    if command.trim().is_empty() {
        return 0;
    }

    // shell-words gives correct operand boundaries through quotes/escapes.
    // If it can't parse (exotic/garbled command), fail closed: an unparseable
    // command is one we cannot measure, so we don't pass it.
    let tokens = match shell_words::split(&command) {
        Ok(t) => t,
        Err(_) => {
            return deny_json(
                "Blocked: blast-radius guard could not tokenize this command (unbalanced quotes \
                 or escapes). A command that can't be parsed can't be measured — rephrase it.",
            )
        }
    };

    let targets = extract_write_targets(&tokens, &command);
    if targets.is_empty() {
        return 0; // no write/delete-class operand detected
    }

    match evaluate_targets(&targets) {
        Some(reason) => deny_json(&reason),
        None => 0,
    }
}

/// Walks every target operand, denying on the first protected-path hit or
/// once the running file total crosses the configured ceiling. Returns the
/// deny reason, or `None` if every target is within budget.
fn evaluate_targets(targets: &[String]) -> Option<String> {
    let cap = walk_cap();
    let protected = protected_prefixes();
    let mut total_files = 0usize;

    for raw in targets {
        // 1) Protected-path check — independent of file count. Touching the
        //    safety surface in bulk is blocked even for a single file.
        if let Some(hit) = protected_hit(raw, &protected) {
            return Some(format!(
                "Blocked: command targets a protected path '{hit}'. Bulk write/delete operations \
                 are not allowed inside Yana AI's own safety surface (rules, hooks, gates, .git, \
                 L1 memory). Edit one file at a time with an explicit path, or get human approval."
            ));
        }

        // 2) Real file count via a bounded walk.
        let n = count_files(raw, cap);
        if n >= cap {
            return Some(format!(
                "Blocked: '{raw}' expands to at least {cap} files (walk cap hit). This command's \
                 blast radius is too large to verify safely. Narrow the path/glob and retry."
            ));
        }
        total_files += n;
        if total_files > max_files() {
            return Some(format!(
                "Blocked: this command would write to or delete {}+ files (limit {}). High blast \
                 radius regardless of which tool ('rm', 'find', 'truncate'...) is used. Split it \
                 into smaller targeted operations, or raise YANA_BLAST_MAX_FILES deliberately.",
                total_files,
                max_files()
            ));
        }
    }
    None
}

/// Pull path-like operands from write/delete-class invocations.
///
/// We intentionally over-collect (false positives just trigger a cheap walk),
/// but we anchor on the *tool* so a read-only `grep -r .` or `cat ./big` isn't
/// counted as a write target.
fn extract_write_targets(tokens: &[String], raw_command: &str) -> Vec<String> {
    let mut out = Vec::new();
    if tokens.is_empty() {
        return out;
    }

    // Redirection truncates/overwrites a file: `cmd > file`, `cmd >> file`.
    // shell-words keeps `>`/`>>` as their own tokens; the next token is the sink.
    for w in tokens.windows(2) {
        if w[0] == ">" || w[0] == ">>" {
            out.push(w[1].clone());
        }
    }

    let head = tokens[0].as_str();
    let is_path = |s: &str| !s.starts_with('-') && s != ">" && s != ">>";

    match head {
        // Classic destroyers — every non-flag operand is a target.
        "rm" | "shred" | "truncate" | "mv" | "dd" => {
            out.extend(tokens[1..].iter().filter(|t| is_path(t)).cloned());
        }
        // `cp -r src dst` can clobber an existing dst tree — count the dst.
        "cp" | "rsync" => {
            let paths: Vec<&String> = tokens[1..].iter().filter(|t| is_path(t)).collect();
            if let Some(dst) = paths.last() {
                out.push((*dst).clone());
            }
        }
        // `find <path> ... -delete|-exec rm` — the path arg is the root, and we
        // only care when it's actually a destructive find.
        "find" => {
            let destructive = raw_command.contains("-delete")
                || raw_command.contains("-exec rm")
                || raw_command.contains("-exec  rm")
                || raw_command.contains("-execdir rm");
            if destructive {
                // first non-flag operand after `find` is the search root
                if let Some(root) = tokens[1..].iter().find(|t| is_path(t)) {
                    out.push(root.clone());
                }
            }
        }
        // `git clean` deletes untracked files across the worktree.
        "git" if tokens.get(1).map(|s| s == "clean").unwrap_or(false) => {
            out.push(".".to_string());
        }
        _ => {}
    }

    out
}

/// Does this operand resolve inside any protected prefix? Returns the prefix.
///
/// Uses `repo_relative` (not a bare lexical normalize) so an absolute path
/// can't be used to spell the same protected target and slip past a plain
/// string-prefix check — see `blast_radius_fs::repo_relative` for the bug
/// this fixes.
fn protected_hit(raw: &str, protected: &[String]) -> Option<String> {
    let norm = repo_relative(Path::new(raw));
    let norm_str = norm.to_string_lossy();
    for p in protected {
        // Match on a path-segment boundary so "core/rules" doesn't also flag
        // an unrelated "core/rulesets-public" sibling.
        if norm_str == p.as_str() || norm_str.starts_with(&format!("{p}/")) {
            return Some(p.clone());
        }
    }
    None
}

#[cfg(test)]
#[path = "blast_radius_test.rs"]
mod tests;
