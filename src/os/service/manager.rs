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
    pub schema_version: u32,
    pub runtime_version: String,
    pub service_id: String,
    pub platform: String,
    pub installed: bool,
    pub registered: Option<bool>,
    pub running: Option<bool>,
    pub definition_paths: Vec<String>,
    pub detail: String,
}

#[derive(Debug, Clone)]
pub(crate) struct RuntimeInspection {
    pub registered: Option<bool>,
    pub running: Option<bool>,
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
    pub remove: Vec<Invocation>,
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
        let previous = plan
            .paths
            .iter()
            .map(read_definition)
            .collect::<Result<Vec<_>>>()?;
        let installation = (|| -> Result<()> {
            for (path, content) in plan.paths.iter().zip(&plan.contents) {
                write_definition(path, content)?;
            }
            invoke_all(&plan.start)
        })();
        if let Err(error) = installation {
            let _ = invoke_all(&plan.remove);
            restore_definitions(&plan.paths, &previous);
            let _ = refresh_after_remove();
            return Err(error).context("activating resident service; installation rolled back");
        }
        let status = self.status()?;
        if !activation_verified(&status, env::consts::OS) {
            let _ = invoke_all(&plan.remove);
            restore_definitions(&plan.paths, &previous);
            let _ = refresh_after_remove();
            bail!(
                "resident service activation could not be verified; installation rolled back: {}",
                status.detail
            );
        }
        Ok(status)
    }

    pub fn start(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        if !plan.paths.iter().all(|path| path.is_file()) {
            bail!("service is not installed; run install first");
        }
        invoke_all(&plan.start)?;
        self.status()
    }

    pub fn stop(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        invoke_all(&plan.stop)?;
        self.status()
    }

    pub fn restart(&self) -> Result<ServiceStatus> {
        self.stop()?;
        self.start()
    }

    pub fn status(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        let installed = plan.paths.iter().all(|path| path.is_file());
        let runtime = if installed {
            inspect_runtime(&self.definition)
        } else {
            RuntimeInspection {
                registered: Some(false),
                running: Some(false),
                detail: "service definition is absent".into(),
            }
        };
        Ok(ServiceStatus {
            schema_version: 1,
            runtime_version: env!("CARGO_PKG_VERSION").into(),
            service_id: identity(&self.definition),
            platform: env::consts::OS.into(),
            installed,
            registered: runtime.registered,
            running: runtime.running,
            definition_paths: plan
                .paths
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            detail: runtime.detail,
        })
    }

    pub fn uninstall(&self) -> Result<ServiceStatus> {
        let plan = platform_plan(&self.definition)?;
        invoke_all(&plan.remove)?;
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
            schema_version: 1,
            runtime_version: env!("CARGO_PKG_VERSION").into(),
            service_id: identity(&self.definition),
            platform: env::consts::OS.into(),
            installed: false,
            registered: Some(false),
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

fn activation_verified(status: &ServiceStatus, platform: &str) -> bool {
    status.installed
        && status.registered == Some(true)
        && (platform == "windows" || status.running == Some(true))
}

pub fn print(status: &ServiceStatus, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(status)?);
    } else {
        println!("Yana always-on service");
        println!("  schema      {}", status.schema_version);
        println!("  runtime     {}", status.runtime_version);
        println!("  identity    {}", status.service_id);
        println!("  platform    {}", status.platform);
        println!("  installed   {}", status.installed);
        println!(
            "  registered  {}",
            status
                .registered
                .map_or("—", |value| if value { "yes" } else { "no" })
        );
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

#[cfg(target_os = "linux")]
use crate::os::platform::linux::service::plan as platform_plan;
#[cfg(target_os = "macos")]
use crate::os::platform::macos::service::plan as platform_plan;
#[cfg(target_os = "windows")]
use crate::os::platform::windows::service::plan as platform_plan;

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn platform_plan(_def: &ServiceDefinition) -> Result<PlatformPlan> {
    bail!("always-on service management is supported on macOS, Linux, and Windows")
}

#[cfg(target_os = "macos")]
fn inspect_runtime(def: &ServiceDefinition) -> RuntimeInspection {
    crate::os::platform::macos::service::inspect(&identity(def))
}

#[cfg(target_os = "linux")]
fn inspect_runtime(def: &ServiceDefinition) -> RuntimeInspection {
    crate::os::platform::linux::service::inspect(&identity(def))
}

#[cfg(target_os = "windows")]
fn inspect_runtime(def: &ServiceDefinition) -> RuntimeInspection {
    crate::os::platform::windows::service::inspect(&identity(def))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn inspect_runtime(_def: &ServiceDefinition) -> RuntimeInspection {
    RuntimeInspection {
        registered: None,
        running: None,
        detail: "service-manager status is unavailable on this platform".into(),
    }
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

fn invoke_all(invocations: &[Invocation]) -> Result<()> {
    for invocation in invocations {
        invoke(invocation)?;
    }
    Ok(())
}

fn read_definition(path: &PathBuf) -> Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => bail!(
            "refusing non-regular service definition: {}",
            path.display()
        ),
        Ok(_) => fs::read(path)
            .map(Some)
            .with_context(|| format!("reading {}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| format!("inspecting {}", path.display())),
    }
}

fn restore_definitions(paths: &[PathBuf], previous: &[Option<Vec<u8>>]) {
    for (path, content) in paths.iter().zip(previous) {
        match content {
            Some(bytes) => {
                let _ = write_definition(path, &String::from_utf8_lossy(bytes));
            }
            None => {
                let _ = fs::remove_file(path);
            }
        }
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
    use uuid::Uuid;

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

    #[test]
    fn definition_write_is_atomic_and_replaces_regular_content() {
        let root = std::env::temp_dir().join(format!("yana-service-write-{}", Uuid::new_v4()));
        let path = root.join("service definition.conf");
        write_definition(&path, "first").unwrap();
        write_definition(&path, "second").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        assert_eq!(
            fs::read_dir(&root).unwrap().count(),
            1,
            "temporary definition must not remain"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn definition_write_refuses_symlink_replacement() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!("yana-service-link-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("target");
        let path = root.join("service.conf");
        fs::write(&target, "do not touch").unwrap();
        symlink(&target, &path).unwrap();
        assert!(write_definition(&path, "replacement").is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "do not touch");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn activation_never_treats_definition_only_or_unknown_as_healthy() {
        let mut status = ServiceStatus {
            schema_version: 1,
            runtime_version: "test".into(),
            service_id: "test".into(),
            platform: "linux".into(),
            installed: true,
            registered: Some(false),
            running: Some(false),
            definition_paths: vec![],
            detail: "definition only".into(),
        };
        assert!(!activation_verified(&status, "linux"));
        status.registered = Some(true);
        status.running = None;
        assert!(!activation_verified(&status, "linux"));
        status.running = Some(true);
        assert!(activation_verified(&status, "linux"));
        status.running = None;
        assert!(activation_verified(&status, "windows"));
    }
}
