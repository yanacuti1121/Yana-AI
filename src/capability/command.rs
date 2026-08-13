//! Command validation and execution. Moved as-is from the original
//! single-file `capability/mod.rs` — bodies unchanged, error type changed
//! from `String` to `CapabilityError`.

use super::error::CapabilityError;
use super::MAX_COMMAND_OUTPUT_BYTES;
use std::{
    path::Path,
    process::{Command, Output},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedCommand {
    pub argv: Vec<String>,
    pub guard_verdict: Option<&'static str>,
}

pub fn validate_command(command: &str) -> Result<ValidatedCommand, CapabilityError> {
    let argv = shell_words::split(command).map_err(|e| CapabilityError::CommandParseError {
        detail: e.to_string(),
    })?;
    if argv.is_empty() {
        return Err(CapabilityError::EmptyCommand);
    }
    Ok(ValidatedCommand {
        argv,
        guard_verdict: crate::guard::check_command(command),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandOutcome {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub truncated: bool,
}

pub fn execute_command(
    root: &Path,
    argv: &[String],
    use_sandbox: bool,
) -> Result<CommandOutcome, CapabilityError> {
    if argv.is_empty() {
        return Err(CapabilityError::EmptyCommand);
    }
    let root = root.canonicalize().map_err(|error| CapabilityError::Io {
        detail: format!("resolve command root: {error}"),
    })?;
    if !root.is_dir() {
        return Err(CapabilityError::NotADirectory {
            requested: root.display().to_string(),
        });
    }
    let mut command = if use_sandbox {
        let mut command = Command::new("bash");
        command
            .arg(root.join("core/scripts/sandbox-exec.sh"))
            .args(argv);
        command
    } else {
        let mut command = Command::new(&argv[0]);
        command.args(&argv[1..]);
        command
    };
    let output =
        command
            .current_dir(root)
            .output()
            .map_err(|error| CapabilityError::SpawnFailed {
                detail: error.to_string(),
            })?;
    Ok(cap_command_output(output))
}

fn cap_command_output(output: Output) -> CommandOutcome {
    let (stdout, stdout_truncated) = cap_command_bytes(&output.stdout);
    let (stderr, stderr_truncated) = cap_command_bytes(&output.stderr);
    CommandOutcome {
        stdout,
        stderr,
        exit_code: output.status.code(),
        truncated: stdout_truncated || stderr_truncated,
    }
}

fn cap_command_bytes(bytes: &[u8]) -> (String, bool) {
    if bytes.len() > MAX_COMMAND_OUTPUT_BYTES {
        (
            String::from_utf8_lossy(&bytes[..MAX_COMMAND_OUTPUT_BYTES]).to_string(),
            true,
        )
    } else {
        (String::from_utf8_lossy(bytes).to_string(), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp_repo(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("yana-capability-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn command_validation_allows_benign_command() {
        let benign = validate_command("git status --short").unwrap();
        assert_eq!(benign.argv, ["git", "status", "--short"]);
        assert!(benign.guard_verdict.is_none());
    }

    #[test]
    fn command_validation_denies_rm_rf() {
        assert!(validate_command("rm -rf /tmp/x")
            .unwrap()
            .guard_verdict
            .is_some());
    }

    #[test]
    fn command_validation_denies_force_push() {
        assert!(validate_command("git push --force origin main")
            .unwrap()
            .guard_verdict
            .is_some());
    }

    #[test]
    fn command_validation_denies_inline_python_bypass() {
        assert!(
            validate_command("python3 -c \"import os; os.system('rm -rf /')\"")
                .unwrap()
                .guard_verdict
                .is_some()
        );
    }

    #[test]
    fn command_validation_rejects_empty_command() {
        assert!(matches!(
            validate_command(""),
            Err(CapabilityError::EmptyCommand)
        ));
    }

    #[test]
    fn command_validation_rejects_unbalanced_quotes() {
        assert!(matches!(
            validate_command("echo \"unterminated"),
            Err(CapabilityError::CommandParseError { .. })
        ));
    }

    #[test]
    fn command_execution_runs_direct_argv() {
        let root = tmp_repo("command-direct");
        let argv = ["echo".into(), "hello".into()];
        let outcome = execute_command(&root, &argv, false).unwrap();
        assert_eq!(outcome.stdout.trim(), "hello");
        assert_eq!(outcome.exit_code, Some(0));
        assert!(!outcome.truncated);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn command_execution_is_rooted_in_the_repository() {
        let root = tmp_repo("command");
        let init = Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap();
        assert!(init.success());

        let argv = ["git".into(), "rev-parse".into(), "--show-toplevel".into()];
        let outcome = execute_command(&root, &argv, false).unwrap();
        assert_eq!(outcome.exit_code, Some(0));
        assert_eq!(
            PathBuf::from(outcome.stdout.trim()).canonicalize().unwrap(),
            root.canonicalize().unwrap()
        );
        assert!(!outcome.truncated);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn command_execution_captures_nonzero_exit_code() {
        let root = tmp_repo("command-nonzero");
        let init = Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap();
        assert!(init.success());
        let failing = [
            "git".into(),
            "cat-file".into(),
            "-e".into(),
            "refs/heads/definitely-missing".into(),
        ];
        let outcome = execute_command(&root, &failing, false).unwrap();
        assert_ne!(outcome.exit_code, Some(0));
        fs::remove_dir_all(root).ok();
    }
}
