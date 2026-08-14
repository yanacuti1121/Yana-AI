//! Cross-platform install/start/stop/restart/status/uninstall for a
//! resident always-on service definition.
//!
//! Platform-specific service-definition rendering lives in `launchd`,
//! `systemd`, and `windows`; this file holds the shared, OS-agnostic
//! orchestration (atomic file writes, external-command invocation) and
//! the public API, following the exact atomic-write/no-symlink-follow
//! discipline already established by `os::monitor_service`.

use anyhow::{bail, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use super::{launchd, systemd, windows};

#[derive(Debug, Clone)]
pub struct ServiceDefinition {
    pub name: String,
    pub description: String,
    pub program: PathBuf,
    pub args: Vec<String>,
    pub working_directory: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatus {
    pub platform: String,
    pub installed: bool,
    pub running: Option<bool>,
    pub definition_paths: Vec<String>,
    pub detail: String,
}

/// Everything a platform installer needs to install/uninstall a service
/// definition: where the definition file(s) live, their rendered
/// contents, and the external-command invocations that start/stop it.
pub(crate) struct PlatformPlan {
    pub paths: Vec<PathBuf>,
    pub contents: Vec<String>,
    pub start: Vec<Invocation>,
    pub stop: Vec<Invocation>,
}

pub(crate) struct Invocation {
    pub program: String,
    pub args: Vec<String>,
    pub tolerate_failure: bool,
}

pub struct ServiceManager {
    definition: ServiceDefinition,
}

impl ServiceManager {
    pub fn new(definition: ServiceDefinition) -> Self {
        Self { definition }
    }

    pub fn install(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        for (path, content) in plan.paths.iter().zip(&plan.contents) {
            write_definition(path, content)?;
        }
        for invocation in &plan.start {
            invoke(invocation)?;
        }
        self.status()
    }

    pub fn start(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        if !plan.paths.iter().all(|path| path.is_file()) {
            bail!("service is not installed; run install first");
        }
        for invocation in &plan.start {
            invoke(invocation)?;
        }
        self.status()
    }

    pub fn stop(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        for invocation in &plan.stop {
            invoke(invocation)?;
        }
        self.status()
    }

    pub fn restart(&self) -> Result<ServiceStatus> {
        self.stop()?;
        self.start()
    }

    pub fn status(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        let installed = plan.paths.iter().all(|path| path.is_file());
        Ok(ServiceStatus {
            platform: env::consts::OS.into(),
            installed,
            running: installed.then(|| is_active(&self.definition)).flatten(),
            definition_paths: plan
                .paths
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            detail: if installed {
                "service definition present".into()
            } else {
                "service is not installed".into()
            },
        })
    }

    pub fn uninstall(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        for invocation in &plan.stop {
            invoke(invocation)?;
        }
        for path in &plan.paths {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(error).with_context(|| format!("removing {}", path.display()))
                }
            }
        }
        refresh_after_remove()?;
        Ok(ServiceStatus {
            platform: env::consts::OS.into(),
            installed: false,
            running: Some(false),
            definition_paths: plan
                .paths
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            detail: "service definitions removed".into(),
        })
    }
}

pub fn print(status: &ServiceStatus, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(status)?);
    } else {
        println!("Yana always-on service");
        println!("  platform    {}", status.platform);
        println!("  installed   {}", status.installed);
        println!(
            "  running     {}",
            status
                .running
                .map_or("—", |value| if value { "yes" } else { "no" })
        );
        println!("  detail      {}", status.detail);
        for path in &status.definition_paths {
            println!("  definition  {path}");
        }
    }
    Ok(())
}

/// Stable, project- and service-name-specific identity used to derive
/// definition file/label/task names, matching `os::monitor_service`'s own
/// `project_id` convention.
pub(crate) fn identity(def: &ServiceDefinition) -> String {
    let digest = Sha256::digest(def.working_directory.to_string_lossy().as_bytes());
    let short: String = digest
        .iter()
        .take(5)
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("{}-{short}", def.name)
}

pub(crate) fn home() -> Result<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| {
            anyhow::anyhow!("HOME/USERPROFILE is required to install a per-user service")
        })
}

pub(crate) fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(any(test, target_os = "linux"))]
pub(crate) fn systemd_escape(value: &Path) -> String {
    format!(
        "\"{}\"",
        value
            .display()
            .to_string()
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
    )
}

#[cfg(target_os = "macos")]
fn platform_plan(def: &ServiceDefinition) -> Result<PlatformPlan> {
    launchd::plan(def)
}

#[cfg(target_os = "linux")]
fn platform_plan(def: &ServiceDefinition) -> Result<PlatformPlan> {
    systemd::plan(def)
}

#[cfg(target_os = "windows")]
fn platform_plan(def: &ServiceDefinition) -> Result<PlatformPlan> {
    windows::plan(def)
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn platform_plan(_def: &ServiceDefinition) -> Result<PlatformPlan> {
    bail!("always-on service management is supported on macOS, Linux, and Windows")
}

#[cfg(target_os = "macos")]
fn is_active(def: &ServiceDefinition) -> Option<bool> {
    launchd::is_active(&identity(def))
}

#[cfg(target_os = "linux")]
fn is_active(def: &ServiceDefinition) -> Option<bool> {
    systemd::is_active(&identity(def))
}

#[cfg(target_os = "windows")]
fn is_active(def: &ServiceDefinition) -> Option<bool> {
    windows::is_active(&identity(def))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn is_active(_def: &ServiceDefinition) -> Option<bool> {
    None
}

#[cfg(target_os = "linux")]
fn refresh_after_remove() -> Result<()> {
    invoke(&Invocation {
        program: "systemctl".into(),
        args: vec!["--user".into(), "daemon-reload".into()],
        tolerate_failure: true,
    })
}

#[cfg(not(target_os = "linux"))]
fn refresh_after_remove() -> Result<()> {
    Ok(())
}

pub(crate) fn invoke(invocation: &Invocation) -> Result<()> {
    let status = Command::new(&invocation.program)
        .args(&invocation.args)
        .status();
    match status {
        Ok(status) if status.success() || invocation.tolerate_failure => Ok(()),
        Ok(status) => bail!(
            "{} exited with {}",
            invocation.program,
            status.code().unwrap_or(-1)
        ),
        Err(_) if invocation.tolerate_failure => Ok(()),
        Err(error) => Err(error).with_context(|| format!("starting {}", invocation.program)),
    }
}

fn write_definition(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => bail!(
            "refusing to replace non-regular service definition: {}",
            path.display()
        ),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).with_context(|| format!("inspecting {}", path.display())),
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = path.with_extension(format!("tmp.{}.{}", std::process::id(), nonce));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options.open(&temporary)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    let result = (|| -> Result<()> {
        #[cfg(target_os = "windows")]
        if path.exists() {
            fs::remove_file(path)?;
        }
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition() -> ServiceDefinition {
        ServiceDefinition {
            name: "yana-rt-service".into(),
            description: "Yana always-on service (test)".into(),
            program: PathBuf::from("/usr/local/bin/yana-rt"),
            args: vec!["os".into(), "service".into(), "run".into()],
            working_directory: PathBuf::from("/tmp/some project & one"),
        }
    }

    #[test]
    fn identity_is_stable_and_definition_specific() {
        let a = identity(&definition());
        let b = identity(&definition());
        assert_eq!(a, b);
        let mut other = definition();
        other.working_directory = PathBuf::from("/tmp/other");
        assert_ne!(a, identity(&other));
    }

    #[test]
    fn xml_escape_neutralizes_metacharacters() {
        assert_eq!(xml_escape("a & b < c"), "a &amp; b &lt; c");
    }
}
