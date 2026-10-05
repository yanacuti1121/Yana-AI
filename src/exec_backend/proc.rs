//! Running a client program (`docker`, `ssh`) with exactly the environment given, a deadline, a
//! bounded read of its output, an optional writer for its input, and its whole process group
//! ended afterwards (WS6). Shared by the Docker and SSH backends.

use crate::capability::CapabilityError;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const POLL: Duration = Duration::from_millis(20);
/// How long to wait for the pipes to close after the client has exited.
const PIPE_GRACE: Duration = Duration::from_secs(2);

pub(super) struct Finished {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub truncated: bool,
    /// Why feeding the client's input failed, if it did (for example it exited early).
    pub feed_error: Option<String>,
}

/// Writes the client's input. Runs on its own thread; the input is closed when it returns.
pub(super) type Feeder = Box<dyn FnOnce(&mut dyn Write) -> Result<(), String> + Send>;

/// What a reader thread has kept of one pipe, shared so it can be read even if the thread
/// is still blocked (a helper that escaped the process group can hold the pipe open).
type Kept = std::sync::Arc<std::sync::Mutex<(Vec<u8>, bool)>>;

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

pub(super) fn kill_group(child: &mut Child) {
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

pub(super) fn run_client(program: &Path, args: &[String], env: &[(OsString, OsString)], wall: Duration, cap: usize) -> Result<Finished, CapabilityError> {
    run_client_fed(program, args, env, wall, cap, None)
}

/// Run `program args` with exactly `env`, to completion or `wall`, then end its process group.
pub(super) fn run_client_fed(program: &Path, args: &[String], env: &[(OsString, OsString)], wall: Duration, cap: usize, feeder: Option<Feeder>) -> Result<Finished, CapabilityError> {
    let mut command = Command::new(program);
    let stdin = if feeder.is_some() { Stdio::piped() } else { Stdio::null() };
    command.args(args).env_clear().envs(env.iter().cloned()).stdin(stdin).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    let mut child = command.spawn().map_err(|error| CapabilityError::SpawnFailed { detail: format!("the client program could not be started ({:?})", error.kind()) })?;
    let (Some(out_pipe), Some(err_pipe)) = (child.stdout.take(), child.stderr.take()) else {
        kill_group(&mut child);
        return Err(CapabilityError::SpawnFailed { detail: "no pipes to read the client output".into() });
    };
    let (out, out_thread) = read_capped(out_pipe, cap);
    let (err, err_thread) = read_capped(err_pipe, cap);
    let feed_thread = feeder.and_then(|feed| {
        let mut pipe = child.stdin.take()?;
        Some(std::thread::spawn(move || feed(&mut pipe)))
    });
    let deadline = Instant::now() + wall;
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (Some(status), false),
            Ok(None) if Instant::now() >= deadline => break (None, true),
            Ok(None) => std::thread::sleep(POLL),
            Err(error) => {
                kill_group(&mut child);
                return Err(CapabilityError::Io { detail: format!("waiting for the client program failed: {error}") });
            }
        }
    };
    if timed_out {
        kill_group(&mut child);
    }
    // After a normal exit the pipes close with the client. If a helper that left the group
    // keeps one open, stop waiting after a short grace and use what was read.
    let grace = Instant::now() + PIPE_GRACE;
    while !(out_thread.is_finished() && err_thread.is_finished() && feed_thread.as_ref().is_none_or(|t| t.is_finished())) && Instant::now() < grace {
        std::thread::sleep(POLL);
    }
    let feed_error = feed_thread.and_then(|thread| if thread.is_finished() { thread.join().ok().and_then(Result::err) } else { Some("the input was still being written when the client ended".to_string()) });
    let ((stdout, cut_out), (stderr, cut_err)) = (snapshot(&out), snapshot(&err));
    Ok(Finished { stdout, stderr, exit_code: status.and_then(|s| s.code()), timed_out, truncated: cut_out || cut_err, feed_error })
}
