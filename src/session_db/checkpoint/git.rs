//! Running `git` for checkpoints, always against the shadow repository.
//!
//! Safety rules encoded here:
//! - repository variables inherited from the environment (`GIT_DIR`,
//!   `GIT_WORK_TREE`, `GIT_INDEX_FILE`, ...) are removed, so a stray variable
//!   can never point these commands at the user's own repository;
//! - the git directory and work tree are passed as explicit flags on every
//!   command, never through the environment;
//! - user and system git configuration is ignored and hooks are disabled;
//! - nothing here can prompt, and no command that rewrites the user's
//!   working tree is ever built (a source-level test checks the verbs).

use super::CheckpointError;
use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(windows)]
const NULL_PATH: &str = "NUL";
#[cfg(not(windows))]
const NULL_PATH: &str = "/dev/null";

const INHERITED_REPO_VARS: [&str; 7] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
];
const IDENTITY_NAME: &str = "yana";
const IDENTITY_EMAIL: &str = "yana@localhost";
/// Longest stderr excerpt kept in an error.
const MAX_STDERR_CHARS: usize = 300;
/// How often a time-limited command is checked for completion.
const POLL: Duration = Duration::from_millis(10);

fn isolate(command: &mut Command) {
    for var in INHERITED_REPO_VARS {
        command.env_remove(var);
    }
    command
        .env("GIT_CONFIG_GLOBAL", NULL_PATH)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_AUTHOR_NAME", IDENTITY_NAME)
        .env("GIT_AUTHOR_EMAIL", IDENTITY_EMAIL)
        .env("GIT_COMMITTER_NAME", IDENTITY_NAME)
        .env("GIT_COMMITTER_EMAIL", IDENTITY_EMAIL);
}

/// A git command bound to `shadow`, and to `work_tree` when the command needs
/// to read the project's files.
pub(super) fn git_command(git: &OsStr, shadow: &Path, work_tree: Option<&Path>) -> Command {
    let mut command = Command::new(git);
    isolate(&mut command);
    command.arg("--git-dir").arg(shadow);
    if let Some(tree) = work_tree {
        command.arg("--work-tree").arg(tree);
    }
    command
        .arg("-c")
        .arg(format!("core.hooksPath={NULL_PATH}"))
        .args(["-c", "commit.gpgsign=false", "-c", "core.autocrlf=false"])
        .args(["-c", "core.fsmonitor=false", "-c", "gc.auto=0", "-c", "core.quotepath=off"]);
    command
}

/// `git init --bare <shadow>`: creates only the shadow repository.
pub(super) fn init_command(git: &OsStr, shadow: &Path) -> Command {
    let mut command = Command::new(git);
    isolate(&mut command);
    command.args(["init", "--bare", "--quiet"]).arg(shadow);
    command
}

/// Run `command` and return its stdout. With a `deadline`, the process is
/// killed when the time passes and `TimedOut` is returned.
pub(super) fn run_until(command: &mut Command, deadline: Option<Instant>) -> Result<Vec<u8>, CheckpointError> {
    let Some(deadline) = deadline else { return finish(command.output()) };
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(spawn_error)?;
    // Both pipes are drained on their own threads so a chatty command cannot block on a full pipe.
    let out = drain(child.stdout.take());
    let err = drain(child.stderr.take());
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(POLL),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(CheckpointError::TimedOut);
            }
            Err(error) => return Err(CheckpointError::Io(format!("waiting for git: {error}"))),
        }
    };
    let (stdout, stderr) = (out.join().unwrap_or_default(), err.join().unwrap_or_default());
    finish(Ok(std::process::Output { status, stdout, stderr }))
}

fn drain(pipe: Option<impl std::io::Read + Send + 'static>) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut bytes);
        }
        bytes
    })
}

fn spawn_error(error: std::io::Error) -> CheckpointError {
    match error.kind() {
        std::io::ErrorKind::NotFound => CheckpointError::GitMissing,
        _ => CheckpointError::Io(format!("running git: {error}")),
    }
}

fn finish(output: std::io::Result<std::process::Output>) -> Result<Vec<u8>, CheckpointError> {
    let output = output.map_err(spawn_error)?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let excerpt: String = stderr.trim().chars().take(MAX_STDERR_CHARS).collect();
    Err(CheckpointError::Git(excerpt))
}
