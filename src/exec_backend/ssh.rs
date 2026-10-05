//! The SSH backend (WS6 E2, docs/contracts/ws6-exec-backends.md section 8 and 17).
//!
//! Runs one command on another machine by calling the `ssh` program (no SSH crate, no tar
//! crate). The project is sent as a private copy (the same one the Docker backend makes, so no
//! secret-named file, `.git` or `.yana-ai` leaves this machine), the command runs in a fresh
//! directory there, and the result is received into another private directory here and copied
//! back with the same checks as for Docker. What ssh may do is decided by `ssh_options`, a pure
//! function whose output is tested string by string: the host key is pinned, nothing is read
//! from `~/.ssh/config`, no agent, no password, no forwarding.

use super::staging::StagingLimits;
use super::{BackendDisclosure, ExecBackend, ExecOutput, ExecRequest};
use crate::capability::CapabilityError;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub struct SshLimits {
    /// How long the command may run (the remote side is also asked to stop it then).
    pub wall: Duration,
    /// How long each transfer (send, receive) and the final cleanup may take.
    pub transfer_wall: Duration,
    /// Kept from each of stdout and stderr of the command separately.
    pub output_bytes: usize,
}

impl Default for SshLimits {
    fn default() -> Self {
        Self { wall: Duration::from_secs(120), transfer_wall: Duration::from_secs(300), output_bytes: 32 * 1024 }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SshConfig {
    /// Absolute path of the `ssh` client program.
    pub program: PathBuf,
    pub host: String,
    pub port: u16,
    pub user: String,
    /// Absolute path of a private key file (mode 0600 or stricter). Only the path is used;
    /// Yana never reads the key.
    pub key_path: PathBuf,
    /// The host's public key as `<type> <base64>` (for example the second and third words of
    /// a `known_hosts` line). It is pinned: a different key stops the run.
    pub host_key: String,
    /// Absolute directory on the remote machine under which one directory per run is made
    /// and removed.
    pub remote_base: String,
    pub limits: SshLimits,
    pub staging: StagingLimits,
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn word_ok(text: &str, extra: &str) -> bool {
    !text.is_empty() && !text.starts_with('-') && text.chars().all(|c| c.is_ascii_alphanumeric() || extra.contains(c))
}

pub(super) fn quote(text: &str) -> String {
    shell_words::quote(text).into_owned()
}

impl SshConfig {
    pub fn validate(&self) -> Result<(), CapabilityError> {
        if !self.program.is_absolute() {
            return Err(invalid("the ssh program must be an absolute path"));
        }
        if !word_ok(&self.host, ".-") || self.host.len() > 253 {
            return Err(invalid("the host name has characters that are not accepted (letters, digits, dot, hyphen; not starting with a hyphen)"));
        }
        if self.port == 0 {
            return Err(invalid("the port must be 1 to 65535"));
        }
        if !word_ok(&self.user, "._-") || self.user.len() > 32 {
            return Err(invalid("the remote user name has characters that are not accepted"));
        }
        if !self.key_path.is_absolute() {
            return Err(invalid("the key file must be an absolute path"));
        }
        let mut parts = self.host_key.split(' ');
        let (kind, blob, rest) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""), parts.next());
        let kind_ok = ["ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "ssh-rsa", "sk-ssh-ed25519@openssh.com"].contains(&kind);
        if !kind_ok || blob.len() < 20 || !blob.chars().all(|c| c.is_ascii_alphanumeric() || "+/=".contains(c)) || rest.is_some() {
            return Err(invalid("the pinned host key must be exactly `<type> <base64>`"));
        }
        let base = &self.remote_base;
        let depth = base.split('/').filter(|p| !p.is_empty()).count();
        let safe = base.starts_with('/')
            && !base.ends_with('/')
            && depth >= 2
            && base.chars().all(|c| c.is_ascii_alphanumeric() || "/._-".contains(c))
            && !base.split('/').any(|p| p == ".." || p == ".");
        if !safe {
            return Err(invalid("the remote base directory must be an absolute path of at least two levels (such as /home/me/yana-work) with only letters, digits and . _ - /"));
        }
        let l = &self.limits;
        let ok = (Duration::from_secs(1)..=Duration::from_secs(600)).contains(&l.wall)
            && (Duration::from_secs(10)..=Duration::from_secs(900)).contains(&l.transfer_wall)
            && (1024..=1024 * 1024).contains(&l.output_bytes);
        if !ok {
            return Err(invalid("a limit is outside its allowed range (wall 1-600 s, transfer 10-900 s, output 1 KiB-1 MiB)"));
        }
        Ok(())
    }

    pub(super) fn target(&self) -> String {
        format!("{}@{}", self.user, self.host)
    }

    /// The line to pin in the known-hosts file: `host` or `[host]:port`, then the key.
    pub(super) fn known_hosts_line(&self) -> String {
        let name = if self.port == 22 { self.host.clone() } else { format!("[{}]:{}", self.host, self.port) };
        format!("{name} {}\n", self.host_key)
    }

    /// Every option of every ssh call (before the target and the remote command). Pure.
    pub(super) fn ssh_options(&self, known_hosts: &Path) -> Vec<String> {
        let mut args: Vec<String> = ["-F", "/dev/null", "-T", "-x", "-a", "-q"].iter().map(|s| s.to_string()).collect();
        let fixed = [
            "BatchMode=yes",
            "PasswordAuthentication=no",
            "PreferredAuthentications=publickey",
            "PubkeyAuthentication=yes",
            "IdentitiesOnly=yes",
            "IdentityAgent=none",
            "ForwardAgent=no",
            "ForwardX11=no",
            "ClearAllForwardings=yes",
            "StrictHostKeyChecking=yes",
            "GlobalKnownHostsFile=/dev/null",
            "CheckHostIP=no",
            "HashKnownHosts=no",
            "VerifyHostKeyDNS=no",
            "ControlMaster=no",
            "ControlPath=none",
            "PermitLocalCommand=no",
            "ProxyCommand=none",
            "RequestTTY=no",
            "ConnectTimeout=10",
            "ServerAliveInterval=15",
            "ServerAliveCountMax=3",
        ];
        for option in fixed {
            args.extend(["-o".to_string(), option.to_string()]);
        }
        args.extend(["-o".to_string(), format!("UserKnownHostsFile={}", known_hosts.display())]);
        args.extend(["-i".to_string(), self.key_path.display().to_string(), "-p".to_string(), self.port.to_string()]);
        args
    }

    /// `base/<run id>`: the directory of one run on the remote machine.
    pub(super) fn remote_dir(&self, run_id: &str) -> String {
        format!("{}/{run_id}", self.remote_base)
    }
}

/// The remote shell commands, built here and tested as text. The remote login shell must be
/// POSIX-compatible (sh, bash, zsh): the quoting is single quotes.
pub(super) fn upload_script(dir: &str) -> String {
    format!("umask 077 && mkdir -p {d} && tar -xf - -C {d}", d = quote(dir))
}

pub(super) fn run_script(dir: &str, wall_secs: u64, argv: &[String]) -> String {
    const WRAP: &str = "if command -v timeout >/dev/null 2>&1; then exec timeout \"$0\" \"$@\"; else exec \"$@\"; fi";
    let mut words: Vec<String> = ["env", "YANA_AGENT_CHILD=1", "sh", "-c", WRAP].iter().map(|s| s.to_string()).collect();
    words.push(wall_secs.to_string());
    words.extend(argv.iter().cloned());
    format!("cd {} && exec {}", quote(dir), shell_words::join(&words))
}

pub(super) fn download_script(dir: &str) -> String {
    format!("cd {} && tar --format=ustar -cf - .", quote(dir))
}

pub(super) fn cleanup_script(dir: &str) -> String {
    format!("rm -rf {}", quote(dir))
}

pub struct SshBackend {
    config: SshConfig,
}

impl SshBackend {
    pub fn new(config: SshConfig) -> Result<Self, CapabilityError> {
        config.validate()?;
        Ok(Self { config })
    }
}

impl ExecBackend for SshBackend {
    fn disclosure(&self) -> BackendDisclosure {
        let c = &self.config;
        let key_tail: String = c.host_key.chars().rev().take(12).collect::<Vec<_>>().into_iter().rev().collect();
        BackendDisclosure {
            kind: "ssh",
            notes: vec![
                format!("runs on {}:{} as {}, with the key file {}", c.host, c.port, c.user, c.key_path.display()),
                format!("the host key is pinned ({}, ends ...{key_tail}); a different key stops the run; ~/.ssh/config, agents, passwords and forwarding are not used", c.host_key.split(' ').next().unwrap_or("")),
                format!("sends a private copy of the working directory under {} on that machine, leaving out .git, .yana-ai, files named like secrets, links and special files, and vendored folders; the copy is removed afterwards", c.remote_base),
                "the command has that machine's own network and whatever the remote account can reach; the remote shell must be POSIX; variables are not passed".to_string(),
                "changes are copied back as plain files only, never over .git, .yana-ai or secret-named files, and never over a file that changed on this machine meanwhile; what a command writes (a Makefile, package.json, scripts) can run on this machine later".to_string(),
                format!("limits: {} s for the command, {} s per transfer", c.limits.wall.as_secs(), c.limits.transfer_wall.as_secs()),
            ],
        }
    }

    fn run(&self, request: &ExecRequest) -> Result<ExecOutput, CapabilityError> {
        super::ssh_run::run(&self.config, request)
    }
}
