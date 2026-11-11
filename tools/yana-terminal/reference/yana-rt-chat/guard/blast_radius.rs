//! guard blast-radius — block by CONSEQUENCE, not by command name.
//!
//! The sibling `destructive` guard matches command *text* against regex. That
//! is a blocklist — an endless catch-up game. Bypasses it lets through today:
//! `find . -delete`, `find . -exec rm {} +`, `DELETE FROM users`,
//! `truncate -s 0 *.db`, `git push origin +main` (force via '+' refspec).
//!
//! The fix is not "add more patterns" — there is always another bypass. Instead
//! we measure the *blast radius*: how many real files a write/delete-class
//! command would hit, and whether any sit inside a protected path. A command
//! that touches 4000 files or reaches into `core/rules/` is dangerous whether
//! it spells itself `rm`, `find`, or `truncate`.
//!
//! Flow: read PreToolUse payload → tokenize with `shell-words` → extract
//! write/delete operands → expand globs + walk with `walkdir` for the REAL file
//! count (capped so a walk over `/` can't hang) → deny if any operand is in a
//! protected path (see blast_paths.rs) or the total exceeds the ceiling.
//!
//! This is advisory-grade containment (runs before the command, in the agent's
//! own filesystem view) — NOT a kernel sandbox, and does not claim to be. It
//! closes the "looks innocent, wipes the repo" gap regex structurally cannot.

use super::blast_paths::protected_hit;
use serde::Deserialize;
use std::io::Read;
use std::path::Path;
use walkdir::WalkDir;

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

    let cap = walk_cap();
    let mut total_files = 0usize;
    let protected = protected_prefixes();

    for raw in &targets {
        // 1) Protected-path check — independent of file count. Touching the
        //    safety surface in bulk is blocked even for a single file.
        if let Some(hit) = protected_hit(raw, &protected) {
            return deny_json(&format!(
                "Blocked: command targets a protected path '{hit}'. Bulk write/delete operations \
                 are not allowed inside Yana AI's own safety surface (rules, hooks, gates, .git, \
                 L1 memory). Edit one file at a time with an explicit path, or get human approval."
            ));
        }

        // 2) Real file count via a bounded walk.
        let n = count_files(raw, cap);
        if n >= cap {
            return deny_json(&format!(
                "Blocked: '{raw}' expands to at least {cap} files (walk cap hit). This command's \
                 blast radius is too large to verify safely. Narrow the path/glob and retry."
            ));
        }
        total_files += n;
        if total_files > max_files() {
            return deny_json(&format!(
                "Blocked: this command would write to or delete {}+ files (limit {}). High blast \
                 radius regardless of which tool ('rm', 'find', 'truncate'...) is used. Split it \
                 into smaller targeted operations, or raise YANA_BLAST_MAX_FILES deliberately.",
                total_files,
                max_files()
            ));
        }
    }

    0
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

/// Count real files under `raw` (expanding a trailing glob), bounded by `cap`.
/// A non-existent path counts as 0 (e.g. `rm newfile` that doesn't exist yet
/// is harmless). A single existing file counts as 1. A directory walks.
fn count_files(raw: &str, cap: usize) -> usize {
    // Glob expansion first: `rm build/*.o` -> each match walked.
    if raw.contains('*') || raw.contains('?') || raw.contains('[') {
        if let Ok(paths) = glob::glob(raw) {
            let mut n = 0;
            for entry in paths.flatten() {
                n += count_path(&entry, cap - n.min(cap));
                if n >= cap {
                    return cap;
                }
            }
            return n;
        }
    }
    count_path(Path::new(raw), cap)
}

fn count_path(p: &Path, cap: usize) -> usize {
    if !p.exists() {
        return 0;
    }
    if p.is_file() {
        return 1;
    }
    let mut n = 0;
    for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            n += 1;
            if n >= cap {
                return cap;
            }
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(cmd: &str) -> Vec<String> {
        let toks = shell_words::split(cmd).unwrap();
        extract_write_targets(&toks, cmd)
    }

    #[test]
    fn detects_find_delete_that_regex_guard_misses() {
        // The whole point: no `rm -rf` here, but it's a mass delete.
        assert_eq!(targets("find . -delete"), vec!["."]);
        assert_eq!(targets("find ./build -exec rm {} +"), vec!["./build"]);
    }

    #[test]
    fn detects_redirection_truncate() {
        assert_eq!(targets("echo x > important.db"), vec!["important.db"]);
        assert_eq!(targets("cat a >> log.txt"), vec!["log.txt"]);
    }

    #[test]
    fn ignores_read_only_commands() {
        assert!(targets("grep -r foo .").is_empty());
        assert!(targets("cat ./big.log").is_empty());
        assert!(targets("ls -la /etc").is_empty());
    }

    #[test]
    fn rm_collects_every_path_operand() {
        assert_eq!(targets("rm a b c"), vec!["a", "b", "c"]);
        assert_eq!(targets("rm -rf build"), vec!["build"]); // flags dropped
    }
}
