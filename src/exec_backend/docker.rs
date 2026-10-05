//! The Docker backend (WS6 E1, docs/contracts/ws6-exec-backends.md section 7).
//!
//! Runs one command in a fresh container by calling the `docker` program (no Docker crate).
//! What the command can see is decided here, by `run_args`, a pure function whose output is
//! tested string by string: the working directory at `/work`, a tmpfs `/tmp`, and nothing
//! else of this machine. No home, no trust store, no Docker socket, no network by default.

use super::docker_mounts::{check_root, mount_args, mountable, NOT_SEARCHED, READ_ONLY_PATHS, WORK};
use super::{BackendDisclosure, ExecBackend, ExecOutput, ExecRequest};
use crate::capability::CapabilityError;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Variable names that are never passed into the container: they would change how programs
/// are found or loaded, or hand over this machine's locations.
const DENIED_ENV_PREFIXES: [&str; 5] = ["YANA_", "DOCKER_", "LD_", "DYLD_", "SSH_"];
const DENIED_ENV_NAMES: [&str; 5] = ["HOME", "PATH", "USER", "TMPDIR", "XDG_RUNTIME_DIR"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    /// No network at all (the default).
    None,
    /// The container's default bridge network; the approval says so every time.
    Open,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Limits {
    pub wall: Duration,
    pub cpus: f32,
    pub memory_mb: u32,
    pub pids: u32,
    /// Kept from each of stdout and stderr separately (so up to twice this in all).
    pub output_bytes: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self { wall: Duration::from_secs(120), cpus: 1.0, memory_mb: 512, pids: 128, output_bytes: 32 * 1024 }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct DockerConfig {
    /// Absolute path of the `docker` client program.
    pub program: PathBuf,
    /// `name@sha256:<64 hex>`: a pinned image, never a movable tag.
    pub image: String,
    /// `uid:gid`, both numeric and non-zero. `None` uses this process's own ids.
    pub user: Option<String>,
    pub limits: Limits,
    pub network: Network,
    /// Names of variables to pass (values are read from this process by the client, never put
    /// in the argument list).
    pub env_names: Vec<String>,
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn is_digest_image(image: &str) -> bool {
    let Some((name, digest)) = image.split_once("@sha256:") else { return false };
    let name_ok = !name.is_empty()
        && name.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "._-/:".contains(c));
    name_ok && digest.len() == 64 && digest.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn valid_env_name(name: &str) -> bool {
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        && !DENIED_ENV_NAMES.iter().any(|d| d.eq_ignore_ascii_case(name))
        && !DENIED_ENV_PREFIXES.iter().any(|p| name.to_ascii_uppercase().starts_with(p))
}

impl DockerConfig {
    pub fn validate(&self) -> Result<(), CapabilityError> {
        if !self.program.is_absolute() {
            return Err(invalid("the docker program must be an absolute path"));
        }
        if !is_digest_image(&self.image) {
            return Err(invalid("the image must be pinned by digest: name@sha256:<64 lowercase hex>"));
        }
        if let Some(user) = &self.user {
            let numeric = user.split_once(':').is_some_and(|(u, g)| [u, g].iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) && p.parse::<u32>().is_ok_and(|n| n != 0)));
            if !numeric {
                return Err(invalid("the container user must be numeric uid:gid, neither of them 0"));
            }
        }
        if let Some(bad) = self.env_names.iter().find(|name| !valid_env_name(name)) {
            return Err(invalid(format!("the variable name {bad:?} cannot be passed into a container")));
        }
        let l = &self.limits;
        let ok = (Duration::from_secs(1)..=Duration::from_secs(600)).contains(&l.wall)
            && (0.1..=8.0).contains(&l.cpus)
            && (64..=8192).contains(&l.memory_mb)
            && (16..=1024).contains(&l.pids)
            && (1024..=1024 * 1024).contains(&l.output_bytes);
        if !ok {
            return Err(invalid("a limit is outside its allowed range (wall 1-600 s, cpus 0.1-8, memory 64-8192 MB, pids 16-1024, output 1 KiB-1 MiB)"));
        }
        Ok(())
    }

    fn user_arg(&self) -> String {
        if let Some(user) = &self.user {
            return user.clone();
        }
        #[cfg(unix)]
        {
            // SAFETY: plain reads of this process's own ids.
            let (uid, gid) = unsafe { (libc::getuid(), libc::getgid()) };
            if uid != 0 && gid != 0 {
                return format!("{uid}:{gid}");
            }
        }
        // Running as root (or no ids): never map that into the container.
        "65534:65534".to_string()
    }

    /// The argument list of `docker run` for `argv` in the working directory `root` (already
    /// canonical). Pure apart from looking at what is under `root`.
    pub(crate) fn run_args(&self, root: &Path, argv: &[String], ctx: &RunContext) -> Result<Vec<String>, CapabilityError> {
        self.validate()?;
        if argv.is_empty() {
            return Err(CapabilityError::EmptyCommand);
        }
        check_root(root, ctx.home.as_deref())?;
        let mut args: Vec<String> = Vec::new();
        let mut push = |parts: &[&str]| args.extend(parts.iter().map(|p| p.to_string()));
        let id = &ctx.run_id;
        push(&["run", "--rm", "--init", "--pull", "never", "--name", &format!("yana-{id}")]);
        push(&["--label", &format!("yana.run={id}"), "--label", &format!("yana.owner={}", ctx.owner_pid)]);
        push(&["--label", &format!("yana.deadline={}", ctx.deadline_unix)]);
        push(&["--user", &self.user_arg(), "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"]);
        push(&["--cap-drop", "ALL", "--security-opt", "no-new-privileges"]);
        let l = &self.limits;
        let memory = format!("{}m", l.memory_mb);
        push(&["--pids-limit", &l.pids.to_string(), "--memory", &memory, "--memory-swap", &memory, "--cpus", &format!("{:.2}", l.cpus)]);
        push(&["--network", if self.network == Network::None { "none" } else { "bridge" }]);
        push(&["-w", WORK, "-e", "HOME=/tmp", "-e", "YANA_AGENT_CHILD=1"]);
        for name in &self.env_names {
            push(&["-e", name]);
        }
        push(&["--mount", &format!("type=bind,source={},target={WORK}", mountable(root)?)]);
        args.extend(mount_args(root)?);
        args.push(self.image.clone());
        args.extend(argv.iter().cloned());
        Ok(args)
    }
}

/// What differs from one run to the next.
pub(crate) struct RunContext {
    /// Sixteen lowercase hex characters naming the container (`yana-<id>`).
    pub run_id: String,
    pub owner_pid: u32,
    /// Unix time after which no live client could still be running this container; a
    /// container past it is an orphan whoever started it.
    pub deadline_unix: u64,
    /// The home directory, which a working directory may not be or contain.
    pub home: Option<PathBuf>,
}

pub struct DockerBackend {
    config: DockerConfig,
}

impl DockerBackend {
    pub fn new(config: DockerConfig) -> Result<Self, CapabilityError> {
        config.validate()?;
        Ok(Self { config })
    }
}

impl ExecBackend for DockerBackend {
    fn disclosure(&self) -> BackendDisclosure {
        let c = &self.config;
        let mut notes = vec![
            format!("image {}", c.image),
            format!("sees only the working directory (at {WORK}) and an empty /tmp; not your home directory, keys, trust records or Docker socket"),
            format!("read-only inside: {} (a .git that does not exist yet is not protected)", READ_ONLY_PATHS.join(", ")),
            format!("hidden: files and folders named like secrets (.env, *.pem, .ssh...), except inside {}", NOT_SEARCHED.join(", ")),
            "the working directory is writable: what a command writes there stays on this machine and can run later (build scripts, Makefile, package.json)".to_string(),
            format!("network: {}", if c.network == Network::None { "none" } else { "OPEN (container bridge network: reaches your local network and cloud metadata addresses)" }),
            format!("limits: {} s, {} CPU, {} MB, {} processes", c.limits.wall.as_secs(), c.limits.cpus, c.limits.memory_mb, c.limits.pids),
        ];
        if !c.env_names.is_empty() {
            notes.push(format!("passes variables: {}", c.env_names.join(", ")));
        }
        BackendDisclosure { kind: "docker", notes }
    }

    fn run(&self, request: &ExecRequest) -> Result<ExecOutput, CapabilityError> {
        super::docker_run::run(&self.config, request)
    }

    fn cleanup(&self) {
        super::docker_run::reap_orphans(&self.config);
    }
}
