//! Native Bash-output compaction — reduces the token count of common
//! dev-tool command output before an AI coding agent (Claude Code, Codex,
//! Cursor) reads it. Opt-in (`YANA_COMPACT=1`), wired through
//! `core/hooks/sandbox-wrap.sh` — the one hook in this repo allowed to
//! rewrite Bash commands (see that file's own header comment for why a
//! second Bash-rewriting hook would race non-deterministically).
//!
//! Replaces the external, non-vendored `rtk` bridge
//! (`core/hooks/rtk-bridge.sh`, opt-in via `YANA_RTK_BRIDGE=1`, dead/unwired
//! by default per `docs/operations/hook-execution-path-audit.md`) with
//! something Yana AI owns and audits itself.
//!
//! Built specifically to not repeat rtk's real incident (2026-07-26):
//! `git log --oneline | wc -l` silently returned 50 instead of the true
//! 1,478, because rtk's compact `git log` format truncates rather than
//! preserving an exact count. "Never emits more tokens than raw" is a
//! token-count guarantee, not a completeness guarantee.
//!
//! Core discipline, enforced by the types below, not just documented:
//! every exact statistic a matcher reports (`ExactStats`) is computed from
//! the FULL, untruncated process output BEFORE any compaction — there is no
//! code path that derives a count from an already-shortened view. And any
//! command whose text contains shell composition (`|`, `>`, `&&`, `;`,
//! `` ` ``, `$(`...) is declined before a matcher ever runs, which is what
//! makes the exact rtk incident structurally impossible here: the pipeline
//! runs once, as one command, and this module only ever sees the final
//! captured output of the whole thing — never an intermediate stage.

mod git_log;
mod git_status;
mod test_runner;
#[cfg(test)]
mod tests;

use crate::capability::command::spawn_command;
use std::path::PathBuf;

/// Shell metacharacters that mean the command text is not a single,
/// self-contained invocation whose output this module can safely attribute
/// end-to-end. Any hit here means: decline to compact, return raw output
/// untouched. A conservative text-contains check can false-positive on a
/// quoted literal (e.g. `git commit -m "a > b"`) — that only ever costs a
/// missed compaction opportunity, never a wrong compaction, so the
/// imprecision is safe by construction.
///
/// MUST include `"\n"`: `bash -c` treats a literal newline as a statement
/// separator exactly like `;` — a command string with two statements
/// joined by an embedded newline instead of `;`/`&&` used to slip past this
/// list entirely (found by security-auditor review, 2026-08-27, reproduced
/// live: `"git log --oneline\ngit log --oneline"` ran both invocations and
/// `git_log::compact` reported a doubled "exact" commit count — the exact
/// failure class this module exists to make structurally impossible, just
/// via an operator this list didn't cover yet). `<`, `<<`, `<(` added for
/// the same completeness reason, not from a reproduced incident.
const SHELL_COMPOSITION_MARKERS: &[&str] =
    &["|", ">", ">>", "&&", "||", ";", "`", "$(", "\n", "<", "<<", "<("];

pub fn has_shell_composition(command_text: &str) -> bool {
    SHELL_COMPOSITION_MARKERS
        .iter()
        .any(|marker| command_text.contains(marker))
}

/// Every field a matcher extracted VERBATIM from the FULL raw output, never
/// re-derived from the (possibly compacted) display text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ExactStats {
    pub total_count: Option<usize>,
    pub pass_count: Option<usize>,
    pub fail_count: Option<usize>,
    pub error_count: Option<usize>,
    pub skip_count: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PassthroughReason {
    NoPatternMatched,
    ShellComposition,
    Bypassed,
    CompactedWasNotSmaller,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompactMode {
    Passthrough(PassthroughReason),
    Compacted {
        pattern: &'static str,
        stats: ExactStats,
    },
}

/// Input every matcher sees. `stdout`/`stderr` MUST be the FULL, untruncated
/// text — obtained via `spawn_command`, never `execute_command` (which caps
/// at 32KB before a matcher could count anything).
pub struct RawCommandOutput<'a> {
    pub command_text: &'a str,
    pub stdout: &'a str,
    pub stderr: &'a str,
    pub exit_code: Option<i32>,
}

pub struct CompactedBody {
    pub text: String,
    pub pattern: &'static str,
    pub stats: ExactStats,
}

pub struct CompactOutcome {
    pub text: String,
    pub mode: CompactMode,
    pub exit_code: Option<i32>,
    pub raw_bytes: usize,
    pub output_bytes: usize,
}

type Matcher = fn(&RawCommandOutput) -> Option<CompactedBody>;

/// MVP pattern set. Deliberately does NOT include `git diff`: diff hunks are
/// the one thing an agent/human almost always needs verbatim for code
/// review, and a compactor that collapses hunks risks silently hiding a
/// changed line the same way rtk silently hid 1,428 commits. Revisit only
/// with a dedicated design pass, not folded into this module.
const MATCHERS: &[Matcher] = &[git_log::compact, git_status::compact, test_runner::compact];

fn recognized_pattern(command_text: &str) -> Option<&'static str> {
    if git_log::recognizes(command_text) {
        return Some("git.log");
    }
    if git_status::recognizes(command_text) {
        return Some("git.status");
    }
    if test_runner::recognizes(command_text) {
        return Some("test.runner");
    }
    None
}

/// `command` is the argv Yana AI actually spawns. When invoked from
/// `sandbox-wrap.sh` it is `["bash", "-c", "<original command string>"]`,
/// preserving the original command's full shell semantics (pipes,
/// redirects) via a real nested `bash -c`. When invoked by hand it can be
/// any argv. Either way, the text a matcher pattern-matches against is the
/// user-meaningful command string, not the outer `bash -c` wrapper.
fn inner_command_text(command: &[String]) -> String {
    if command.len() == 3 && command[0] == "bash" && command[1] == "-c" {
        command[2].clone()
    } else {
        command.join(" ")
    }
}

fn passthrough_text(stdout: &str, stderr: &str) -> String {
    let mut text = String::with_capacity(stdout.len() + stderr.len());
    text.push_str(stdout);
    if !stderr.is_empty() {
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(stderr);
    }
    text
}

/// Executes `command` and returns either its compacted or its untouched raw
/// output. Never applies a byte cap on the passthrough path: an ordinary
/// Bash tool call (with no compaction involved at all) is never capped
/// either, so capping here would be a regression relative to plain Bash,
/// not a safety improvement.
pub fn run(command: &[String], force_raw: bool) -> CompactOutcome {
    let inner_text = inner_command_text(command);
    let bypassed =
        force_raw || std::env::var("YANA_COMPACT_BYPASS").ok().as_deref() == Some("1");

    let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let output = match spawn_command(&root, command, false) {
        Ok(output) => output,
        Err(error) => {
            eprintln!("yana-rt compact: spawn failed: {error}");
            return CompactOutcome {
                text: String::new(),
                mode: CompactMode::Passthrough(PassthroughReason::NoPatternMatched),
                exit_code: Some(127),
                raw_bytes: 0,
                output_bytes: 0,
            };
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let exit_code = output.status.code();
    let raw_bytes = stdout.len() + stderr.len();
    let full_passthrough = passthrough_text(&stdout, &stderr);

    if bypassed {
        let output_bytes = full_passthrough.len();
        return CompactOutcome {
            text: full_passthrough,
            mode: CompactMode::Passthrough(PassthroughReason::Bypassed),
            exit_code,
            raw_bytes,
            output_bytes,
        };
    }

    if has_shell_composition(&inner_text) {
        let output_bytes = full_passthrough.len();
        return CompactOutcome {
            text: full_passthrough,
            mode: CompactMode::Passthrough(PassthroughReason::ShellComposition),
            exit_code,
            raw_bytes,
            output_bytes,
        };
    }

    let raw_view = RawCommandOutput {
        command_text: &inner_text,
        stdout: &stdout,
        stderr: &stderr,
        exit_code,
    };

    let mut compacted_but_worse: Option<&'static str> = None;
    for matcher in MATCHERS {
        if let Some(body) = matcher(&raw_view) {
            if body.text.len() < raw_bytes {
                let output_bytes = body.text.len();
                return CompactOutcome {
                    text: body.text,
                    mode: CompactMode::Compacted {
                        pattern: body.pattern,
                        stats: body.stats,
                    },
                    exit_code,
                    raw_bytes,
                    output_bytes,
                };
            }
            compacted_but_worse = Some(body.pattern);
            break; // exactly one matcher should ever claim a given command
        }
    }

    let reason = if compacted_but_worse.is_some() {
        PassthroughReason::CompactedWasNotSmaller
    } else {
        PassthroughReason::NoPatternMatched
    };
    let output_bytes = full_passthrough.len();
    CompactOutcome {
        text: full_passthrough,
        mode: CompactMode::Passthrough(reason),
        exit_code,
        raw_bytes,
        output_bytes,
    }
}

/// `yana-rt compact [--detect] [--json] [--raw] -- <command...>` entry point.
pub fn dispatch(detect: bool, json: bool, raw: bool, command: Vec<String>) {
    if command.is_empty() {
        eprintln!("yana-rt compact: no command given");
        std::process::exit(2);
    }

    if detect {
        let inner_text = inner_command_text(&command);
        let matched =
            !has_shell_composition(&inner_text) && recognized_pattern(&inner_text).is_some();
        if json {
            let pattern = recognized_pattern(&inner_text).unwrap_or("");
            println!("{{\"detected\":{matched},\"pattern\":\"{pattern}\"}}");
        }
        std::process::exit(if matched { 0 } else { 1 });
    }

    let outcome = run(&command, raw);
    print!("{}", outcome.text);
    if !outcome.text.is_empty() && !outcome.text.ends_with('\n') {
        println!();
    }
    if json {
        let mode_label = match outcome.mode {
            CompactMode::Passthrough(PassthroughReason::NoPatternMatched) => "passthrough.no_pattern",
            CompactMode::Passthrough(PassthroughReason::ShellComposition) => "passthrough.shell_composition",
            CompactMode::Passthrough(PassthroughReason::Bypassed) => "passthrough.bypassed",
            CompactMode::Passthrough(PassthroughReason::CompactedWasNotSmaller) => "passthrough.not_smaller",
            CompactMode::Compacted { pattern, .. } => pattern,
        };
        eprintln!(
            "{}",
            serde_json::json!({
                "mode": mode_label,
                "raw_bytes": outcome.raw_bytes,
                "output_bytes": outcome.output_bytes,
            })
        );
    }
    std::process::exit(outcome.exit_code.unwrap_or(1));
}
