//! Remote and encoded code execution, plus world-writable permissions.
//!
//! `02-terminal-validator.md` lists `curl * | bash`, `wget * | bash` and `chmod 777` as hard blocks and
//! `anti-evasion-law.md` adds decoders and process substitution. `check_command` used to judge only
//! destructive commands, so a client that asks it (the MCP server, the editor translators) was told
//! `allow` for all of these.
//!
//! The command is split the way a shell reads it (see `remote_exec_parse`), each command word is
//! normalised (quotes removed, `sudo`/`env`/`xargs` prefixes and directories skipped) and the rules look
//! at the resulting commands, not at raw text. Inline scripts (`bash -c '...'`, `eval`, `ssh host '...'`),
//! substitutions, here-documents and here-strings that feed an interpreter are judged again, down to
//! `MAX_DEPTH`. Text only: no filesystem, process or host-policy checks, so the WASM surface compiles it too.
//!
//! Known limits (documented, not hidden): a downloaded file run in a second step (`curl -o f && bash f`),
//! a fetcher hidden behind an alias or a function, content piped into a program that executes its input
//! in a way this module does not know (`xargs -I{} bash -c {}`), and modes such as `chmod 666` or
//! `chmod a+w`, which make files world-writable without matching the `777` rule. The bash fallback in
//! `core/hooks/guard-destructive.sh` does not implement this module: it applies only where `yana-rt` runs.

#[path = "remote_exec_classify.rs"]
mod classify;
#[path = "remote_exec_parse.rs"]
mod parse;
#[path = "remote_exec_probe.rs"]
mod probe;
#[path = "remote_exec_rules.rs"]
mod rules;
#[cfg(test)]
#[path = "remote_exec_tests.rs"]
mod tests;

use classify::{executes_text, inline_scripts};
use parse::{Pipeline, Stage};
use probe::{
    consumes_stdin_program, decodes_deep, feeds_decoded, feeds_remote, fetches, in_bodies,
    judge_sinks, Bodies,
};
use rules::world_writable;

/// Shells that read a program from stdin when given no script.
const SHELLS: [&str; 13] = [
    "sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "csh", "tcsh", "rbash", "mksh", "yash",
    "xonsh",
];
/// Interpreters. A name matches exactly or with a version suffix: `python3.11`, `node22`, `perl5`.
const LANGS: [&str; 15] = [
    "rscript",
    "julia",
    "groovy",
    "osascript",
    "python",
    "node",
    "bun",
    "deno",
    "perl",
    "ruby",
    "php",
    "pwsh",
    "powershell",
    "lua",
    "tclsh",
];
/// Commands that bring remote content in.
const FETCHERS: [&str; 7] = ["curl", "wget", "fetch", "aria2c", "nc", "ncat", "telnet"];
/// How deep inline scripts and substitutions are followed. Past it the command is refused: it cannot be judged.
const MAX_DEPTH: usize = 4;

const FETCH_PIPE: &str = "Blocked: downloaded content is piped straight into a shell or interpreter (curl/wget ... | bash). The code is never reviewed before it runs. Download to a file, read it, then run it, or ask the human to confirm.";
const DECODE_PIPE: &str = "Blocked: decoded content is piped into, or executed by, a shell or interpreter (base64 -d / xxd -r / openssl enc -d / printf escapes ... | bash). A command that cannot be read before it runs is not allowed. Run the readable command directly.";
const FETCH_EXEC: &str = "Blocked: the output of curl/wget is executed as code (bash <(curl ...), source <(curl ...), eval \"$(curl ...)\", bash -c \"$(curl ...)\", bash <<< \"$(curl ...)\"). Download to a file, read it, then run it, or ask the human to confirm.";
const WORLD_WRITABLE: &str = "Blocked: 'chmod 777' (also a=rwx, a+rwx, ugo+rwx, o+rwx) makes files writable by every user. Grant the narrowest mode that works, for example 755 or 644.";
const TOO_DEEP: &str = "Blocked: scripts are nested too deeply (sh -c inside sh -c inside ...) for this guard to read. Run the inner command directly, or ask the human to confirm.";

fn base(word: &str) -> &str {
    word.rsplit('/').next().unwrap_or(word)
}

fn name_of(stage: &Stage) -> Option<&str> {
    stage.command().map(|(word, _)| base(word))
}

fn is_shell(name: &str) -> bool {
    // `bash5`, `zsh5.9`: a version suffix does not make it another program
    SHELLS.contains(&name.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.'))
}

fn is_lang(name: &str) -> bool {
    LANGS.iter().any(|lang| {
        name.strip_prefix(lang)
            .is_some_and(|rest| rest.chars().all(|c| c.is_ascii_digit() || c == '.'))
    })
}

/// A cluster of short flags such as `-lc` or `-di`, as opposed to `--long` or a plain word.
fn short_flags(arg: &str) -> Option<&str> {
    arg.strip_prefix('-')
        .filter(|rest| !rest.is_empty() && !rest.starts_with('-'))
}

pub fn check(command: &str) -> Option<&'static str> {
    // Lower-cased once: macOS and Windows resolve `CURL` and `BASH` to the real programs, and every name
    // and flag this module compares against is lower case.
    judge(&command.to_lowercase(), 0)
}

fn judge(text: &str, depth: usize) -> Option<&'static str> {
    let all = parse::pipelines(text);
    all.iter().enumerate().find_map(|(index, pipeline)| {
        judge_pipeline(pipeline, &all[..index], &all[index + 1..], depth)
    })
}

fn judge_pipeline(
    pipeline: &Pipeline,
    prior: &[Pipeline],
    rest: &[Pipeline],
    depth: usize,
) -> Option<&'static str> {
    pipeline.iter().enumerate().find_map(|(index, stage)| {
        let before = &pipeline[..index];
        judge_stage(stage, before, prior, depth)
            .or_else(|| judge_sinks(stage, before))
            .or_else(|| judge_group(stage, before, pipeline, rest))
    })
}

/// A pipe into `{ ...; }`, `( ... )` or a loop feeds every command inside it: if anything later reads a
/// program from stdin, the piped content is that program.
fn judge_group(
    stage: &Stage,
    before: &[Stage],
    pipeline: &Pipeline,
    rest: &[Pipeline],
) -> Option<&'static str> {
    if !stage.opens_group() || before.is_empty() {
        return None;
    }
    let later = pipeline.iter().chain(rest.iter().flatten());
    if !later.clone().any(consumes_stdin_program) {
        return None;
    }
    if before.iter().any(feeds_remote) {
        Some(FETCH_PIPE)
    } else {
        before.iter().any(feeds_decoded).then_some(DECODE_PIPE)
    }
}

fn judge_stage(
    stage: &Stage,
    before: &[Stage],
    prior: &[Pipeline],
    depth: usize,
) -> Option<&'static str> {
    judge_stdin_program(stage, before, prior, depth)
        .or_else(|| judge_text_runner(stage))
        .or_else(|| world_writable(stage).then_some(WORLD_WRITABLE))
        .or_else(|| judge_children(stage, depth))
}

/// A shell or interpreter that reads its program from stdin: what feeds it is the program.
fn judge_stdin_program(
    stage: &Stage,
    before: &[Stage],
    prior: &[Pipeline],
    depth: usize,
) -> Option<&'static str> {
    if !consumes_stdin_program(stage) {
        return None;
    }
    // A pipe that leaves a group (`{ curl x; } | bash`, `(curl x) | bash`) is fed by everything before it.
    let from_group = before.iter().any(Stage::is_group_source);
    let feeders: Vec<&Stage> = before
        .iter()
        .chain(prior.iter().flatten().filter(|_| from_group))
        .collect();
    if feeders.iter().any(|s| feeds_remote(s)) {
        return Some(FETCH_PIPE);
    }
    if in_bodies(stage, 0, Bodies::Both, &fetches) {
        return Some(FETCH_EXEC); // bash <<< "$(curl ...)"
    }
    if feeders.iter().any(|s| feeds_decoded(s)) || decodes_deep(stage, 0) {
        return Some(DECODE_PIPE);
    }
    before
        .iter()
        .chain([stage])
        .filter_map(|source| source.heredoc.as_deref())
        .find_map(|body| descend(body, depth))
}

/// `eval`, a shell given an inline script, or a shell or interpreter given a process substitution.
fn judge_text_runner(stage: &Stage) -> Option<&'static str> {
    let runs_inline = !inline_scripts(stage).is_empty() || name_of(stage) == Some("eval");
    let runs_files = executes_text(stage);
    if runs_inline && in_bodies(stage, 0, Bodies::Substitutions, &fetches) {
        return Some(FETCH_EXEC);
    }
    if runs_files && in_bodies(stage, 0, Bodies::Process, &fetches) {
        return Some(FETCH_EXEC);
    }
    let decodes_in_scripts = runs_inline && in_bodies(stage, 0, Bodies::Both, &decodes_deep);
    let decodes_in_files = runs_files && in_bodies(stage, 0, Bodies::Process, &decodes_deep);
    (decodes_in_scripts || decodes_in_files).then_some(DECODE_PIPE)
}

/// Texts inside this command that run later: substitutions, process substitutions, inline scripts.
fn judge_children(stage: &Stage, depth: usize) -> Option<&'static str> {
    stage
        .substitutions()
        .chain(stage.process_substitutions())
        .map(str::to_string)
        .chain(inline_scripts(stage))
        .find_map(|text| descend(&text, depth))
}

fn descend(text: &str, depth: usize) -> Option<&'static str> {
    if text.trim().is_empty() {
        return None;
    }
    if depth + 1 > MAX_DEPTH {
        return Some(TOO_DEEP);
    }
    judge(text, depth + 1)
}
