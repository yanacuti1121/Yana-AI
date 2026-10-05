//! Running a command over ssh with the private-copy transfer (WS6 E2). See `ssh.rs`.

use super::docker_mounts::check_root;
use super::proc::{run_client_fed, Feeder, Finished};
use super::ssh::{cleanup_script, download_script, run_script, upload_script, SshConfig};
use super::staging::Staging;
use super::staging_sync::copy_back_notes;
use super::tar::{read_archive, write_archive};
use super::{ExecOutput, ExecRequest};
use crate::capability::CapabilityError;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// What ssh itself exits with when it could not connect or authenticate (not the command's code).
const SSH_FAILED: i32 = 255;
/// What `timeout` exits with when it stopped the command.
const TIMEOUT_EXIT: i32 = 124;
/// Local grace beyond the remote time limit, so the remote `timeout` reports first.
const LOCAL_GRACE: Duration = Duration::from_secs(5);
const SMALL_OUTPUT: usize = 4096;
/// Kept of what the remote side says on stderr during a transfer (only the first line is used).
const SMALL_CAPS: (usize, usize) = (SMALL_OUTPUT, SMALL_OUTPUT);

fn failed(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::SpawnFailed { detail: detail.into() }
}

/// The pinned host key, in a file only this run can reach, removed afterwards.
struct KnownHosts {
    dir: PathBuf,
    file: PathBuf,
}

impl KnownHosts {
    fn create(base: &Path, line: &str) -> Result<Self, CapabilityError> {
        let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot write the pinned host key: {error}") };
        let dir = base.join(format!("yana-ssh-{}", uuid::Uuid::new_v4().simple()));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
        builder.create(&dir).map_err(io)?;
        let this = Self { file: dir.join("known_hosts"), dir };
        std::fs::write(&this.file, line).map_err(io)?;
        Ok(this)
    }
}

impl Drop for KnownHosts {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// The key file must be a plain private file: ssh would refuse a readable one, and so do we, early.
fn check_key(path: &Path) -> Result<(), CapabilityError> {
    let meta = std::fs::symlink_metadata(path).map_err(|_| failed("the key file does not exist"))?;
    if !meta.is_file() {
        return Err(failed("the key file must be a plain file, not a link"));
    }
    #[cfg(unix)]
    if std::os::unix::fs::PermissionsExt::mode(&meta.permissions()) & 0o077 != 0 {
        return Err(failed("the key file can be read by others: make it private (chmod 600)"));
    }
    Ok(())
}

struct Session<'a> {
    config: &'a SshConfig,
    options: Vec<String>,
    env: Vec<(OsString, OsString)>,
}

impl Session<'_> {
    /// `caps` is how much to keep of (stdout, stderr) of the call.
    fn call(&self, remote: &str, wall: Duration, caps: (usize, usize), feeder: Option<Feeder>) -> Result<Finished, CapabilityError> {
        let mut args = self.options.clone();
        args.push(self.config.target());
        args.push(remote.to_string());
        run_client_fed(&self.config.program, &args, &self.env, wall, caps, feeder)
    }

    /// An error for a call that did not succeed, with the first line ssh said (never contents).
    fn explain(what: &str, done: &Finished) -> CapabilityError {
        // The first line the remote side said, with control characters made visible.
        let said: String = String::from_utf8_lossy(&done.stderr).lines().next().unwrap_or("").chars().take(200).map(|c| if c.is_control() { '?' } else { c }).collect();
        let why = if done.timed_out { "it timed out".to_string() } else { done.feed_error.clone().unwrap_or(said) };
        failed(format!("{what}: {why}"))
    }
}

pub(super) fn run(config: &SshConfig, request: &ExecRequest) -> Result<ExecOutput, CapabilityError> {
    config.validate()?;
    let root = request.root.canonicalize().map_err(|error| CapabilityError::Io { detail: format!("resolve command root: {error}") })?;
    if !root.is_dir() {
        return Err(CapabilityError::NotADirectory { requested: root.display().to_string() });
    }
    if request.argv.is_empty() {
        return Err(CapabilityError::EmptyCommand);
    }
    check_key(&config.key_path)?;
    let copies = std::env::temp_dir().canonicalize().unwrap_or_else(|_| std::env::temp_dir());
    let home = std::env::var_os("HOME").and_then(|home| PathBuf::from(home).canonicalize().ok());
    check_root(&root, home.as_deref(), &copies)?;
    let staging = Staging::copy_in(&root, &copies, config.staging)?;
    let hosts = KnownHosts::create(&copies, &config.known_hosts_line())?;
    if !super::ssh::path_ok(&hosts.file) {
        return Err(failed("the temporary folder path has a space, quote, backslash or % in it, which ssh would read as something else: set TMPDIR to a plain path"));
    }
    let mut env: Vec<(OsString, OsString)> = Vec::new();
    if let Some(path) = std::env::var_os("PATH").and_then(|p| crate::capability::program_path::safe_path_var(&p, &root)) {
        env.push(("PATH".into(), path));
    }
    let session = Session { config, options: config.ssh_options(&hosts.file), env };
    let run_id: String = uuid::Uuid::new_v4().simple().to_string().chars().take(16).collect();
    let dir = config.remote_dir(&run_id);
    let mut result = transfer_and_run(&session, &staging, &root, &dir, request, &copies);
    // The remote directory is removed however the run went; if that fails it is said, because
    // the project copy is still on that machine.
    let cleaned = session.call(&cleanup_script(&dir), config.limits.transfer_wall, SMALL_CAPS, None);
    if !cleaned.as_ref().is_ok_and(|done| !done.timed_out && done.exit_code == Some(0)) {
        if let Ok(output) = result.as_mut() {
            output.notes.push(format!("the run directory {dir} could not be removed on the remote machine"));
        }
    }
    result
}

fn transfer_and_run(session: &Session, staging: &Staging, root: &Path, dir: &str, request: &ExecRequest, copies: &Path) -> Result<ExecOutput, CapabilityError> {
    let config = session.config;
    let limits = &config.limits;
    // 1. Send the private copy.
    let (source, files) = (staging.dir.clone(), staging.files());
    let feeder: Feeder = Box::new(move |out| write_archive(&source, &files, out).map_err(|error| error.to_string()));
    let sent = session.call(&upload_script(&config.remote_base, dir), limits.transfer_wall, SMALL_CAPS, Some(feeder))?;
    if sent.timed_out || sent.exit_code != Some(0) || sent.feed_error.is_some() {
        return Err(Session::explain("could not send the working directory to the remote machine", &sent));
    }
    // 2. Run the command there.
    let ran = session.call(&run_script(dir, limits.wall.as_secs(), &request.argv), limits.wall + LOCAL_GRACE, (limits.output_bytes, limits.output_bytes), None)?;
    // 255 is ssh itself failing; no exit code at all is ssh killed by a signal, and the command may still be running.
    if !ran.timed_out && (ran.exit_code == Some(SSH_FAILED) || ran.exit_code.is_none()) {
        return Err(Session::explain("ssh could not run the command", &ran));
    }
    let timed_out = ran.timed_out || ran.exit_code == Some(TIMEOUT_EXIT);
    let mut notes = Vec::new();
    if !staging.left_out.is_empty() {
        notes.push(format!("left out of the copy: {}", staging.left_out.join(", ")));
    }
    if timed_out {
        notes.push("the command timed out: its changes were not copied back".to_string());
    } else {
        // 3. Receive the result into another private directory, then check and copy it back.
        let room = usize::try_from(config.staging.max_bytes).unwrap_or(usize::MAX).saturating_add(config.staging.max_files.saturating_mul(2048)).saturating_add(1 << 20);
        let received = session.call(&download_script(dir), limits.transfer_wall, (room, SMALL_OUTPUT), None)?;
        if received.timed_out || received.truncated || received.exit_code != Some(0) {
            notes.push(format!("changes were not copied back: the result could not be received ({})", Session::explain("download", &received)));
        } else {
            let receiving = staging.receiving(copies)?;
            match read_archive(&mut received.stdout.as_slice(), &receiving.dir, config.staging) {
                Ok(report) => {
                    if report.skipped > 0 {
                        notes.push(format!("{} entries from the remote side were ignored (protected, secret-named, vendored, links or special files)", report.skipped));
                    }
                    notes.extend(copy_back_notes(&receiving, root, config.staging));
                }
                Err(error) => notes.push(format!("changes were not copied back: {error}")),
            }
        }
    }
    Ok(ExecOutput { stdout: ran.stdout, stderr: ran.stderr, exit_code: if timed_out { None } else { ran.exit_code }, timed_out, truncated: ran.truncated, notes })
}
