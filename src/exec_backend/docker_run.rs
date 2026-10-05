//! Running the `docker` client with a deadline, a bounded read, and cleanup
//! (WS6 E1). The client is a trusted program on this machine and gets a short list of
//! variables; what the container gets is decided in `docker.rs`.

use super::docker::{DockerConfig, RunContext};
use super::docker_mounts::check_root;
use super::staging::Staging;
use super::staging_sync::sync_back;
use super::{ExecOutput, ExecRequest};
use crate::capability::CapabilityError;
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// How long `docker kill`/`docker rm` may take when cleaning up after a timeout.
const CLEANUP_WALL: Duration = Duration::from_secs(15);
const CLEANUP_OUTPUT: usize = 4096;
const POLL: Duration = Duration::from_millis(20);
/// Seconds past a run's own time limit before its container counts as an orphan.
const ORPHAN_GRACE_SECS: u64 = 60;
/// `docker run` exit status for a failure of Docker itself, as opposed to the command.
const DOCKER_FAILED: i32 = 125;
/// Variables the `docker` client itself needs to find its daemon and configuration.
const CLIENT_ENV: [&str; 8] = ["HOME", "DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_CONTEXT", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY", "XDG_RUNTIME_DIR", "TMPDIR"];

struct Finished {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    exit_code: Option<i32>,
    timed_out: bool,
    truncated: bool,
}

/// What a reader thread has kept of one pipe, shared so it can be read even if the thread
/// is still blocked (a helper that escaped the process group can hold the pipe open).
type Kept = std::sync::Arc<std::sync::Mutex<(Vec<u8>, bool)>>;

/// How long to wait for the pipes to close after the client has exited.
const PIPE_GRACE: Duration = Duration::from_secs(2);

/// Keep at most `cap` bytes of a pipe and drain the rest, so a noisy child never blocks.
fn read_capped<R: Read + Send + 'static>(mut pipe: R, cap: usize) -> (Kept, std::thread::JoinHandle<()>) {
    let kept: Kept = Default::default();
    let sink = std::sync::Arc::clone(&kept);
    let handle = std::thread::spawn(move || {
        let mut chunk = [0u8; 8192];
        loop {
            match pipe.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let Ok(mut guard) = sink.lock() else { break };
                    let room = cap.saturating_sub(guard.0.len());
                    guard.0.extend_from_slice(&chunk[..n.min(room)]);
                    guard.1 |= n > room;
                }
            }
        }
    });
    (kept, handle)
}

fn snapshot(kept: &Kept) -> (Vec<u8>, bool) {
    kept.lock().map(|guard| guard.clone()).unwrap_or_default()
}

fn kill_group(child: &mut Child) {
    #[cfg(unix)]
    if let Ok(pid) = i32::try_from(child.id()) {
        // SAFETY: a signal to the process group this module created for the child, sent
        // while the child is still unreaped so its pid cannot belong to anyone else.
        unsafe {
            let _ = libc::kill(-pid, libc::SIGKILL);
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Run `program args` with exactly `env`, to completion or `wall`, then end its process group.
fn run_client(program: &Path, args: &[String], env: &[(OsString, OsString)], wall: Duration, cap: usize) -> Result<Finished, CapabilityError> {
    let mut command = Command::new(program);
    command.args(args).env_clear().envs(env.iter().cloned()).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    let mut child = command.spawn().map_err(|error| CapabilityError::SpawnFailed { detail: format!("the docker program could not be started ({:?})", error.kind()) })?;
    let (Some(out_pipe), Some(err_pipe)) = (child.stdout.take(), child.stderr.take()) else {
        kill_group(&mut child);
        return Err(CapabilityError::SpawnFailed { detail: "no pipes to read the docker output".into() });
    };
    let (out, out_thread) = read_capped(out_pipe, cap);
    let (err, err_thread) = read_capped(err_pipe, cap);
    let deadline = Instant::now() + wall;
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (Some(status), false),
            Ok(None) if Instant::now() >= deadline => break (None, true),
            Ok(None) => std::thread::sleep(POLL),
            Err(error) => {
                kill_group(&mut child);
                return Err(CapabilityError::Io { detail: format!("waiting for the docker program failed: {error}") });
            }
        }
    };
    if timed_out {
        kill_group(&mut child);
    }
    // After a normal exit the pipes close with the client. If a helper that left the group
    // keeps one open, stop waiting after a short grace and use what was read.
    let grace = Instant::now() + PIPE_GRACE;
    while !(out_thread.is_finished() && err_thread.is_finished()) && Instant::now() < grace {
        std::thread::sleep(POLL);
    }
    let ((stdout, cut_out), (stderr, cut_err)) = (snapshot(&out), snapshot(&err));
    Ok(Finished { stdout, stderr, exit_code: status.and_then(|s| s.code()), timed_out, truncated: cut_out || cut_err })
}

/// The variables the docker client gets: its own few, a PATH without repository entries,
/// and the values of the names to pass into the container (read here, never put in the
/// argument list).
fn client_env(config: &DockerConfig, root: &Path) -> Vec<(OsString, OsString)> {
    let mut env: Vec<(OsString, OsString)> = Vec::new();
    for name in CLIENT_ENV.iter().copied().chain(config.env_names.iter().map(String::as_str)) {
        if let Some(value) = std::env::var_os(name) {
            env.push((name.into(), value));
        }
    }
    if let Some(path) = std::env::var_os("PATH").and_then(|p| crate::capability::program_path::safe_path_var(&p, root)) {
        env.push(("PATH".into(), path));
    }
    env
}

pub(super) fn run(config: &DockerConfig, request: &ExecRequest) -> Result<ExecOutput, CapabilityError> {
    let root = request.root.canonicalize().map_err(|error| CapabilityError::Io { detail: format!("resolve command root: {error}") })?;
    if !root.is_dir() {
        return Err(CapabilityError::NotADirectory { requested: root.display().to_string() });
    }
    check_daemon(std::env::var("DOCKER_HOST").ok().as_deref(), std::env::var("DOCKER_CONTEXT").ok().as_deref())?;
    let run_id: String = uuid::Uuid::new_v4().simple().to_string().chars().take(16).collect();
    let ctx = RunContext {
        run_id: run_id.clone(),
        owner_pid: std::process::id(),
        deadline_unix: unix_now() + config.limits.wall.as_secs() + ORPHAN_GRACE_SECS,
        home: std::env::var_os("HOME").and_then(|home| PathBuf::from(home).canonicalize().ok()),
        uid_gid: own_ids(),
    };
    let copies = std::env::temp_dir().canonicalize().unwrap_or_else(|_| std::env::temp_dir());
    check_root(&root, ctx.home.as_deref(), &copies)?;
    let staging = Staging::copy_in(&root, &copies, config.staging)?;
    let args = config.run_args(&staging.dir, &request.argv, &ctx)?;
    let env = client_env(config, &root);
    let finished = run_client(&config.program, &args, &env, config.limits.wall, config.limits.output_bytes)?;
    if finished.timed_out {
        let name = format!("yana-{run_id}");
        for verb in [["kill", name.as_str()], ["rm", name.as_str()]] {
            let mut args: Vec<String> = verb.iter().map(|s| s.to_string()).collect();
            if verb[0] == "rm" {
                args.insert(1, "-f".into());
            }
            let _ = run_client(&config.program, &args, &env, CLEANUP_WALL, CLEANUP_OUTPUT);
        }
    }
    // `docker run` exits 125 when Docker itself failed (daemon, flags, missing image) and the
    // command's own code otherwise; a client ended by a signal has no code. Neither is a result.
    if !finished.timed_out {
        match finished.exit_code {
            Some(DOCKER_FAILED) => {
                let reason = String::from_utf8_lossy(&finished.stderr).lines().next().unwrap_or("").chars().take(200).collect::<String>();
                return Err(CapabilityError::SpawnFailed { detail: format!("docker could not run the container: {reason}") });
            }
            None => return Err(CapabilityError::SpawnFailed { detail: "the docker program ended without an exit code".into() }),
            Some(_) => {}
        }
    }
    let mut notes = Vec::new();
    if !staging.left_out.is_empty() {
        notes.push(format!("left out of the copy: {}", staging.left_out.join(", ")));
    }
    if finished.timed_out {
        notes.push("the command timed out: its changes were not copied back".to_string());
    } else if !container_gone(config, &env, &run_id) {
        notes.push("the container could not be confirmed to have stopped: its changes were not copied back".to_string());
    } else {
        // A failure to copy back never hides what the command did: the result is returned
        // with a note saying nothing came back.
        match sync_back(&staging, &root, config.staging) {
            Ok(report) => {
                notes.push(format!("copied back: {} written, {} deleted", report.written.len(), report.deleted));
                if !report.written.is_empty() {
                    notes.push(format!("written on this machine: {}", report.written.iter().take(20).cloned().collect::<Vec<_>>().join(", ")));
                }
                if !report.skipped.is_empty() {
                    notes.push(format!("not copied back: {}", report.skipped.join(", ")));
                }
            }
            Err(error) => notes.push(format!("changes were not copied back: {error}")),
        }
    }
    Ok(ExecOutput { stdout: finished.stdout, stderr: finished.stderr, exit_code: finished.exit_code, timed_out: finished.timed_out, truncated: finished.truncated, notes })
}

/// Whether the container is certainly gone. The client exits when the container does, but it
/// can also exit while the container keeps running (the connection to the daemon was lost), so
/// this asks the daemon. A container that still exists is stopped and removed, and nothing is
/// copied back from it; so is any answer other than "no such object".
fn container_gone(config: &DockerConfig, env: &[(OsString, OsString)], run_id: &str) -> bool {
    let name = format!("yana-{run_id}");
    let Ok(answer) = run_client(&config.program, &["inspect".to_string(), name.clone()], env, CLEANUP_WALL, CLEANUP_OUTPUT) else { return false };
    if answer.exit_code != Some(0) && String::from_utf8_lossy(&answer.stderr).contains("No such") {
        return true;
    }
    if answer.exit_code == Some(0) {
        for verb in [vec!["kill".to_string(), name.clone()], vec!["rm".to_string(), "-f".to_string(), name.clone()]] {
            let _ = run_client(&config.program, &verb, env, CLEANUP_WALL, CLEANUP_OUTPUT);
        }
    }
    false
}

/// The user and group this process runs as.
fn own_ids() -> (u32, u32) {
    #[cfg(unix)]
    // SAFETY: plain reads of this process's own ids.
    unsafe {
        (libc::getuid(), libc::getgid())
    }
    #[cfg(not(unix))]
    (0, 0)
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

/// Only a daemon on this machine is used: a mount source is a path on the daemon's disk, so
/// with a remote daemon (or an unknown context) `source=<dir>` would mean another machine.
pub(super) fn check_daemon(docker_host: Option<&str>, docker_context: Option<&str>) -> Result<(), CapabilityError> {
    let local_host = docker_host.map_or(true, |host| host.is_empty() || host.starts_with("unix://"));
    let local_context = docker_context.map_or(true, |context| context.is_empty() || context == "default");
    if local_host && local_context {
        return Ok(());
    }
    Err(CapabilityError::InvalidInput { detail: "DOCKER_HOST or DOCKER_CONTEXT points away from the local Docker daemon: the working directory would have to exist on that machine, so the command is not run in a container".into() })
}

/// Remove containers of Yana that are past their deadline: a client that was killed or lost
/// its connection mid-command left them. A container before its deadline, and any container
/// without the labels or the `yana-` name, is never touched. Works the same whoever started it.
pub(super) fn reap_orphans(config: &DockerConfig) {
    reap_orphans_at(config, unix_now());
}

pub(super) fn reap_orphans_at(config: &DockerConfig, now: u64) {
    let env = client_env(config, &std::env::temp_dir());
    let list = ["ps", "-a", "--filter", "label=yana.run", "--format", "{{.ID}} {{.Names}} {{.Label \"yana.deadline\"}}"].map(String::from);
    let Ok(listing) = run_client(&config.program, &list, &env, CLEANUP_WALL, 64 * 1024) else { return };
    for line in String::from_utf8_lossy(&listing.stdout).lines() {
        let mut parts = line.split_whitespace();
        let (Some(id), Some(name), Some(deadline)) = (parts.next(), parts.next(), parts.next()) else { continue };
        let id_ok = !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit());
        if id_ok && name.starts_with("yana-") && deadline.parse::<u64>().is_ok_and(|d| d < now) {
            let _ = run_client(&config.program, &["rm".to_string(), "-f".to_string(), id.to_string()], &env, CLEANUP_WALL, CLEANUP_OUTPUT);
        }
    }
}
