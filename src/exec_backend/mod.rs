//! Where a command runs (WS6, docs/contracts/ws6-exec-backends.md).
//!
//! E0: the trait and the `local` backend, which is exactly what `spawn_command` did
//! before: same program, same working directory, same inherited environment plus
//! `YANA_AGENT_CHILD`, same optional routing through `core/scripts/sandbox-exec.sh`, and
//! the same uncapped read of the output (callers cap afterwards, as before). Docker and
//! SSH backends (E1, E2) are added here; limits, network policy and the isolation rules
//! of the contract (section 5) arrive with them, because `local` enforces none of them.

// The trait's `disclosure` and `cleanup` and the request type have no caller until a
// second backend and the approval prompt use them (E1); only `LocalBackend::run` is used.
#![allow(dead_code)]

pub mod docker;
mod docker_mounts;
mod docker_run;
#[cfg(all(test, unix))]
mod docker_fake_tests;
#[cfg(test)]
mod docker_tests;

use crate::capability::command::AGENT_CHILD_ENV;
use crate::capability::CapabilityError;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// What a person is told about where a command will run (shown with the approval).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendDisclosure {
    pub kind: &'static str,
    /// One line each: what the command can see and reach.
    pub notes: Vec<String>,
}

/// One command to run: an argv (never a shell string) from a working directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecRequest {
    pub root: PathBuf,
    pub argv: Vec<String>,
}

/// What came back, uncapped (the caller decides how much to keep).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecOutput {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: Option<i32>,
    /// The wall-clock limit ran out and the command was killed (`exit_code` is then `None`).
    pub timed_out: bool,
    /// More output than the backend's cap was produced; the rest was dropped.
    pub truncated: bool,
}

pub trait ExecBackend: Send + Sync {
    fn disclosure(&self) -> BackendDisclosure;
    /// Run to completion. A failure to start is an error; a command that exits non-zero is not.
    fn run(&self, request: &ExecRequest) -> Result<ExecOutput, CapabilityError>;
    /// Remove anything this backend created. Safe to call more than once.
    fn cleanup(&self) {}
}

/// Runs the command on this machine, as the person running Yana. The highest-exposure
/// backend: it sees everything the user sees. Kept as it was; see the module doc.
#[derive(Debug, Clone, Copy)]
pub struct LocalBackend {
    use_sandbox: bool,
}

impl LocalBackend {
    pub fn new(use_sandbox: bool) -> Self {
        Self { use_sandbox }
    }

    /// The process output as the standard library reports it. `spawn_command` returns this
    /// (the compaction path reads the exit status and the full bytes).
    pub fn spawn(&self, root: &Path, argv: &[String]) -> Result<Output, CapabilityError> {
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
        let mut command = if self.use_sandbox {
            let mut command = Command::new("bash");
            command.arg(root.join("core/scripts/sandbox-exec.sh")).args(argv);
            command
        } else {
            let mut command = Command::new(&argv[0]);
            command.args(&argv[1..]);
            command
        };
        command
            .current_dir(root)
            .env(AGENT_CHILD_ENV, "1")
            .output()
            .map_err(|error| CapabilityError::SpawnFailed {
                detail: error.to_string(),
            })
    }
}

impl ExecBackend for LocalBackend {
    fn disclosure(&self) -> BackendDisclosure {
        let mut notes = vec!["runs on this machine with your environment and home directory".to_string()];
        if self.use_sandbox {
            notes.push("through core/scripts/sandbox-exec.sh (Docker, nsjail or ulimit, whichever it finds)".to_string());
        }
        BackendDisclosure { kind: "local", notes }
    }

    fn run(&self, request: &ExecRequest) -> Result<ExecOutput, CapabilityError> {
        let output = self.spawn(&request.root, &request.argv)?;
        Ok(ExecOutput {
            exit_code: output.status.code(),
            stdout: output.stdout,
            stderr: output.stderr,
            timed_out: false,
            truncated: false,
        })
    }
}

#[cfg(test)]
mod tests;
