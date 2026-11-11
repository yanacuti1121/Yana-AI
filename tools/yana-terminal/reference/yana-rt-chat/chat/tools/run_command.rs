//! `run_command` tool: parse + guard-check a shell command string
//! (`validate`), then actually execute it (`execute`) — split in two
//! because approval must happen on the render thread between them (see
//! `tui/turn.rs`'s `TurnState::AwaitingApproval`), while execution itself
//! runs on a worker thread so the render loop stays responsive.

use std::process::{Command, Output};

pub struct Validated {
    pub argv: Vec<String>,
    /// `Some(reason)` when `crate::guard::check_command()` denies this
    /// command — callers must not offer a y/N override when this is set,
    /// only an acknowledge-and-abort path (see the approval-prompt design
    /// in the plan). `None` means the guard allows it; a human approval
    /// is still required before `execute()` runs.
    pub guard_verdict: Option<&'static str>,
}

/// Pure, synchronous: parses the command into argv and asks
/// `crate::guard::check_command()` — the single source of judgment for
/// "is this destructive" (identical logic to
/// `core/hooks/guard-destructive.sh`) — never a second pattern list of
/// its own.
pub fn validate(command: &str) -> Result<Validated, String> {
    let argv = shell_words::split(command).map_err(|e| format!("cannot parse command: {e}"))?;
    if argv.is_empty() {
        return Err("empty command".to_string());
    }
    let guard_verdict = crate::guard::check_command(command);
    Ok(Validated { argv, guard_verdict })
}

/// Bound each stream so a runaway command can't flood the TUI/history.
const MAX_OUTPUT_BYTES: usize = 32 * 1024;

pub struct ExecOutcome {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub truncated: bool,
}

/// Actually runs the command. Only ever called after (a) `validate()`
/// found `guard_verdict == None`, and (b) the human approved via the TUI
/// — this function does not re-check either condition itself. Direct
/// argv exec, no `sh -c` string-building (per `shell-sanitize-law.md`,
/// same style as `plugin.rs`/`guard/lock.rs`). When `use_sandbox` is
/// true, routes through `core/scripts/sandbox-exec.sh` for real
/// Docker/nsjail/ulimit isolation instead of running the argv directly.
pub fn execute(argv: &[String], use_sandbox: bool) -> Result<ExecOutcome, String> {
    if argv.is_empty() {
        return Err("empty command".to_string());
    }
    let mut cmd = if use_sandbox {
        let mut c = Command::new("bash");
        c.arg("core/scripts/sandbox-exec.sh").args(argv);
        c
    } else {
        let mut c = Command::new(&argv[0]);
        c.args(&argv[1..]);
        c
    };
    let output = cmd.output().map_err(|e| format!("failed to spawn: {e}"))?;
    Ok(cap_output(output))
}

fn cap_output(output: Output) -> ExecOutcome {
    let (stdout, out_trunc) = cap_bytes(&output.stdout);
    let (stderr, err_trunc) = cap_bytes(&output.stderr);
    ExecOutcome { stdout, stderr, exit_code: output.status.code(), truncated: out_trunc || err_trunc }
}

fn cap_bytes(bytes: &[u8]) -> (String, bool) {
    if bytes.len() > MAX_OUTPUT_BYTES {
        (String::from_utf8_lossy(&bytes[..MAX_OUTPUT_BYTES]).to_string(), true)
    } else {
        (String::from_utf8_lossy(bytes).to_string(), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn benign_command_allowed() {
        let v = validate("ls -la").unwrap();
        assert_eq!(v.argv, vec!["ls", "-la"]);
        assert!(v.guard_verdict.is_none());
    }

    #[test]
    fn rm_rf_denied() {
        let v = validate("rm -rf /tmp/x").unwrap();
        assert!(v.guard_verdict.is_some());
    }

    #[test]
    fn git_push_force_denied() {
        let v = validate("git push --force origin main").unwrap();
        assert!(v.guard_verdict.is_some());
    }

    #[test]
    fn inline_python_bypass_denied() {
        // Same case src/mcp.rs's Program J spike already verified against
        // check_command() directly — confirms this tool calls the exact
        // same judgment function, not a reimplementation.
        let v = validate("python3 -c \"import os; os.system('rm -rf /')\"").unwrap();
        assert!(v.guard_verdict.is_some());
    }

    #[test]
    fn empty_command_rejected() {
        assert!(validate("").is_err());
    }

    #[test]
    fn unparseable_command_rejected() {
        // Unbalanced quote — shell_words::split must error, not panic.
        assert!(validate("echo \"unterminated").is_err());
    }

    #[test]
    fn execute_runs_direct_argv_without_sandbox() {
        let argv = vec!["echo".to_string(), "hello".to_string()];
        let outcome = execute(&argv, false).unwrap();
        assert_eq!(outcome.stdout.trim(), "hello");
        assert_eq!(outcome.exit_code, Some(0));
        assert!(!outcome.truncated);
    }

    #[test]
    fn execute_captures_nonzero_exit_code() {
        let argv = vec!["sh".to_string(), "-c".to_string(), "exit 3".to_string()];
        let outcome = execute(&argv, false).unwrap();
        assert_eq!(outcome.exit_code, Some(3));
    }
}
