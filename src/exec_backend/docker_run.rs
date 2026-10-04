//! Running the `docker` client with a deadline, a bounded read, and cleanup
//! (WS6 E1). The client is a trusted program on this machine and gets a short list of
//! variables; what the container gets is decided in `docker.rs`.

use super::docker::DockerConfig;
use super::{ExecOutput, ExecRequest};
use crate::capability::CapabilityError;
use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// How long `docker kill`/`docker rm` may take when cleaning up after a timeout.
const CLEANUP_WALL: Duration = Duration::from_secs(15);
const CLEANUP_OUTPUT: usize = 4096;
const POLL: Duration = Duration::from_millis(20);
/// Variables the `docker` client itself needs to find its daemon and configuration.
const CLIENT_ENV: [&str; 8] = ["HOME", "DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_CONTEXT", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY", "XDG_RUNTIME_DIR", "TMPDIR"];

struct Finished {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    exit_code: Option<i32>,
    timed_out: bool,
    truncated: bool,
}

/// Keep at most `cap` bytes of a pipe and drain the rest, so a noisy child never blocks.
fn read_capped<R: Read + Send + 'static>(mut pipe: R, cap: usize) -> std::thread::JoinHandle<(Vec<u8>, bool)> {
    std::thread::spawn(move || {
        let (mut kept, mut cut, mut chunk) = (Vec::new(), false, [0u8; 8192]);
        loop {
            match pipe.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let room = cap.saturating_sub(kept.len());
                    kept.extend_from_slice(&chunk[..n.min(room)]);
                    cut |= n > room;
                }
            }
        }
        (kept, cut)
    })
}

fn kill_group(child: &mut Child) {
    #[cfg(unix)]
    // SAFETY: a signal to the process group this module created for the child.
    unsafe {
        let _ = libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Run `program args` with exactly `env`, to completion or `wall`, then kill its process group.
fn run_client(program: &Path, args: &[String], env: &[(OsString, OsString)], wall: Duration, cap: usize) -> Result<Finished, CapabilityError> {
    let mut command = Command::new(program);
    command.args(args).env_clear().envs(env.iter().cloned()).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    let mut child = command.spawn().map_err(|error| CapabilityError::SpawnFailed { detail: format!("the docker program could not be started ({:?})", error.kind()) })?;
    let (out, err) = match (child.stdout.take(), child.stderr.take()) {
        (Some(out), Some(err)) => (read_capped(out, cap), read_capped(err, cap)),
        _ => {
            kill_group(&mut child);
            return Err(CapabilityError::SpawnFailed { detail: "no pipes to read the docker output".into() });
        }
    };
    let deadline = Instant::now() + wall;
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (Some(status), false),
            Ok(None) if Instant::now() >= deadline => break (None, true),
            Ok(None) => std::thread::sleep(POLL),
            Err(_) => break (None, true),
        }
    };
    if timed_out {
        kill_group(&mut child);
    } else {
        // The client may have left helpers in its group; the group is the unit that ends.
        #[cfg(unix)]
        // SAFETY: as in `kill_group`; the leader has already been reaped, so this only reaches stragglers.
        unsafe {
            let _ = libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
    }
    let (stdout, cut_out) = out.join().unwrap_or_default();
    let (stderr, cut_err) = err.join().unwrap_or_default();
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
    let run_id = uuid::Uuid::new_v4().simple().to_string();
    let args = config.run_args(&root, &request.argv, &run_id[..16], std::process::id())?;
    let env = client_env(config, &root);
    let finished = run_client(&config.program, &args, &env, config.limits.wall, config.limits.output_bytes)?;
    if finished.timed_out {
        let name = format!("yana-{}", &run_id[..16]);
        for verb in [["kill", name.as_str()], ["rm", name.as_str()]] {
            let mut args: Vec<String> = verb.iter().map(|s| s.to_string()).collect();
            if verb[0] == "rm" {
                args.insert(1, "-f".into());
            }
            let _ = run_client(&config.program, &args, &env, CLEANUP_WALL, CLEANUP_OUTPUT);
        }
    }
    Ok(ExecOutput { stdout: finished.stdout, stderr: finished.stderr, exit_code: finished.exit_code, timed_out: finished.timed_out, truncated: finished.truncated })
}

fn pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // SAFETY: signal 0 only checks that the process exists.
        let found = unsafe { libc::kill(pid as i32, 0) } == 0;
        found || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        true
    }
}

/// Remove containers made by a Yana process that no longer exists (it died mid-command).
/// Containers of a live process, and any container without the label, are never touched.
pub(super) fn reap_orphans(config: &DockerConfig) {
    let env = client_env(config, Path::new("/"));
    let list = ["ps", "-a", "--filter", "label=yana.run", "--format", "{{.ID}} {{.Label \"yana.owner\"}}"].map(String::from);
    let Ok(listing) = run_client(&config.program, &list, &env, CLEANUP_WALL, 64 * 1024) else { return };
    for line in String::from_utf8_lossy(&listing.stdout).lines() {
        let mut parts = line.split_whitespace();
        let (Some(id), Some(owner)) = (parts.next(), parts.next()) else { continue };
        let id_ok = !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit());
        if id_ok && owner.parse::<u32>().is_ok_and(|pid| !pid_alive(pid)) {
            let _ = run_client(&config.program, &["rm".to_string(), "-f".to_string(), id.to_string()], &env, CLEANUP_WALL, CLEANUP_OUTPUT);
        }
    }
}
