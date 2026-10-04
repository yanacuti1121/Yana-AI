//! The Docker backend (WS6 E1, docs/contracts/ws6-exec-backends.md section 7).
//!
//! Runs one command in a fresh container by calling the `docker` program (no Docker crate).
//! What the command can see is decided here, by `run_args`, a pure function whose output is
//! tested string by string: the working directory at `/work`, a tmpfs `/tmp`, and nothing
//! else of this machine. No home, no trust store, no Docker socket, no network by default.

use super::{BackendDisclosure, ExecBackend, ExecOutput, ExecRequest};
use crate::capability::CapabilityError;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Paths inside the working directory that stay read-only in the container: what the model
/// must not rewrite (its own configuration) and what runs on this machine later (git hooks).
const READ_ONLY_PATHS: [&str; 3] = [".yana-ai", ".git/hooks", ".git/config"];
/// Most entries of the working directory looked at when hiding secret-named files.
const MAX_ROOT_ENTRIES: usize = 2000;
/// Where the working directory appears inside the container.
const WORK: &str = "/work";
/// Variable names that are never passed into the container: they would change how programs
/// are found or loaded, or hand over this machine's locations.
const DENIED_ENV_PREFIXES: [&str; 5] = ["YANA_", "DOCKER_", "LD_", "DYLD_", "SSH_"];
const DENIED_ENV_NAMES: [&str; 3] = ["HOME", "PATH", "USER"];

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
        && !DENIED_ENV_NAMES.contains(&name)
        && !DENIED_ENV_PREFIXES.iter().any(|p| name.starts_with(p))
}

/// A path that can be put in a `--mount` value without being read as another option.
fn mountable(path: &Path) -> Result<&str, CapabilityError> {
    let text = path.to_str().ok_or_else(|| invalid("a path that is not valid UTF-8 cannot be mounted"))?;
    if text.contains([',', '\n', '\r', '\0', '"']) || !path.is_absolute() {
        return Err(invalid("the working directory path has a character a container mount cannot carry (a comma, quote or line break)"));
    }
    Ok(text)
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
        let ok = (1..=600).contains(&l.wall.as_secs())
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
    /// canonical). Pure apart from looking at which protected paths exist under `root`.
    pub(crate) fn run_args(&self, root: &Path, argv: &[String], run_id: &str, owner_pid: u32) -> Result<Vec<String>, CapabilityError> {
        self.validate()?;
        if argv.is_empty() {
            return Err(CapabilityError::EmptyCommand);
        }
        let mut args: Vec<String> = Vec::new();
        let mut push = |parts: &[&str]| args.extend(parts.iter().map(|p| p.to_string()));
        let name = format!("yana-{run_id}");
        push(&["run", "--rm", "--init", "--name", &name]);
        push(&["--label", &format!("yana.run={run_id}"), "--label", &format!("yana.owner={owner_pid}")]);
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
        let root_text = mountable(root)?;
        push(&["--mount", &format!("type=bind,source={root_text},target={WORK}")]);
        for protected in READ_ONLY_PATHS {
            let source = root.join(protected);
            match std::fs::symlink_metadata(&source) {
                Ok(meta) if meta.file_type().is_symlink() => {
                    return Err(invalid(format!("{protected} is a symbolic link: it cannot be kept read-only, so the command is not run in a container")));
                }
                Ok(_) => push(&["--mount", &format!("type=bind,source={},target={WORK}/{protected},readonly", mountable(&source)?)]),
                Err(_) => {}
            }
        }
        for (entry, is_dir) in hidden_entries(root) {
            let target = format!("{WORK}/{entry}");
            if is_dir {
                push(&["--tmpfs", &format!("{target}:ro,size=4k")]);
            } else {
                push(&["--mount", &format!("type=bind,source=/dev/null,target={target},readonly")]);
            }
        }
        push(&[&self.image]);
        args.extend(argv.iter().cloned());
        Ok(args)
    }
}

/// Top-level entries of the working directory whose names say they hold secrets
/// (`.env`, `*.pem`, `.ssh`...): hidden inside the container, a regular file by an empty
/// file over it and a directory by an empty tmpfs. Deeper ones are not looked for here, and
/// a symbolic link is left alone (its target is resolved inside the container).
fn hidden_entries(root: &Path) -> Vec<(String, bool)> {
    let Ok(entries) = std::fs::read_dir(root) else { return Vec::new() };
    entries
        .take(MAX_ROOT_ENTRIES)
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let kind = entry.file_type().ok()?;
            let fine_name = !name.contains([',', '=', '"', '\n', '\r']);
            (fine_name && !kind.is_symlink() && crate::lsp_client::operation::sensitive_path(&name)).then_some((name, kind.is_dir()))
        })
        .collect()
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
            format!("read-only inside: {}", READ_ONLY_PATHS.join(", ")),
            format!("network: {}", if c.network == Network::None { "none" } else { "OPEN (container bridge network)" }),
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
