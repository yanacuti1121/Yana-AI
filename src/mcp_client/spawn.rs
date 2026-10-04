//! Starting a configured MCP server as a child process (WS3 T1).
//!
//! The child gets an EMPTY environment plus `PATH` and the variable names the
//! user listed for that server, the repository root as its working directory,
//! no terminal input, and its error output discarded. It runs in its own
//! process group so the whole tree can be killed, and its output is read
//! through a bounded reader. It is killed when the session ends or is dropped.

use super::bounded::{BoundedReader, MAX_LINE_BYTES, MAX_TOTAL_BYTES};
use super::config::ServerConfig;
use super::session::{Limits, Session};
use crate::capability::CapabilityError;
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

pub(crate) fn command_for(config: &ServerConfig, root: &Path) -> Command {
    command_with_path(config, root, std::env::var_os("PATH"))
}

fn command_with_path(config: &ServerConfig, root: &Path, path: Option<std::ffi::OsString>) -> Command {
    let mut command = Command::new(&config.command);
    command.args(&config.args).current_dir(root).env_clear();
    // PATH without relative, empty and in-repository entries: a program the server starts by
    // name is not looked up in the repository either.
    if let Some(path) = path.and_then(|path| crate::capability::program_path::safe_path_var(&path, root)) {
        command.env("PATH", path);
    }
    for name in &config.env {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    command
}

/// Start `config`'s server and finish the MCP handshake.
pub async fn spawn_session(config: &ServerConfig, root: &Path) -> Result<Session, CapabilityError> {
    let mut child = command_for(config, root).spawn().map_err(|e| CapabilityError::SpawnFailed {
        detail: format!("MCP server '{}' could not be started ({:?})", config.name, e.kind()),
    })?;
    let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        return Err(CapabilityError::SpawnFailed { detail: format!("MCP server '{}': no pipes to talk through", config.name) });
    };
    let limits = Limits { startup: config.timeout(), call: config.timeout() };
    let bounded = BoundedReader::new(stdout, MAX_LINE_BYTES, MAX_TOTAL_BYTES);
    Session::start((bounded, stdin), Some(child), limits, &config.name).await
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn the_child_gets_a_path_without_relative_empty_and_in_repository_entries() {
        let outer = tempfile::tempdir().unwrap();
        let base = outer.path().canonicalize().unwrap();
        let root = base.join("repo");
        let inside = root.join("node_modules/.bin");
        std::fs::create_dir_all(&inside).unwrap();
        let usr = base.join("usr-bin");
        std::fs::create_dir_all(&usr).unwrap();
        let config = ServerConfig { name: "a".into(), command: "/bin/sh".into(), args: Vec::new(), env: Vec::new(), timeout_secs: None };
        let dirty = std::env::join_paths([Path::new("."), Path::new("node_modules/.bin"), Path::new(""), &inside, &usr]).unwrap();
        let command = command_with_path(&config, &root, Some(dirty));
        let given: Vec<PathBuf> = command
            .as_std()
            .get_envs()
            .find(|(name, _)| *name == "PATH")
            .and_then(|(_, value)| value.map(|v| std::env::split_paths(v).collect()))
            .expect("PATH is passed");
        assert_eq!(given, [usr], "only the safe entry reaches the child");
        // Nothing safe left: PATH is not passed at all, so the system default applies.
        let only_bad = std::env::join_paths([Path::new("."), &inside]).unwrap();
        assert!(command_with_path(&config, &root, Some(only_bad)).as_std().get_envs().all(|(name, _)| name != "PATH"));
    }
}
