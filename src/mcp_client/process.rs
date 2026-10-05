//! Starting and stopping a configured server as a child process, shared by the MCP
//! and LSP clients (WS3 T1, section 17).
//!
//! The child gets an EMPTY environment plus `PATH` and the variable names the
//! user listed for that server, the repository root as its working directory,
//! no terminal input, and its error output discarded. It runs in its own
//! process group so the whole tree can be killed. It is killed when dropped.

use super::config::ServerConfig;
use std::path::Path;
use std::process::Stdio;
use tokio::process::{Child, Command};

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

/// Kill the server and everything it started (`npx`, `sh -c` wrappers and the
/// like leave helpers behind), then reap it. The child was put in its own
/// process group when it was spawned, so the group id is its pid.
pub(crate) async fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // SAFETY: plain signal to a process group this module created.
        unsafe {
            let _ = libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    let _ = child.kill().await;
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
