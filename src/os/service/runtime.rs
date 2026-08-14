//! Resident Giám Thị payload.
//!
//! This process stays alive between supervisor ticks. It is deliberately
//! different from `os::monitor_service`, which only schedules one-shot ticks.
//! HALT never gets cleared here: while the shared lock exists the resident
//! process remains alive but performs no supervised work, preventing an OS
//! KeepAlive policy from turning HALT into a respawn loop.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::manager::{ServiceDefinition, ServiceManager};
use super::monitor::BoundedBackoff;
use crate::os::supervisor;

const COMPONENT_NAME: &str = "yana-giamthi-resident";
const HALT_RELATIVE_PATH: &str = ".claude/state/GIAMTHI_HALT.lock";
const INSTANCE_LOCK_IDENTITY: &str = "key:yana-os/giamthi-resident";
const MIN_INTERVAL_SECS: u64 = 5;
const MAX_ERROR_BACKOFF_SECS: u64 = 60;

pub fn manager(root: &Path, interval_secs: u64) -> Result<ServiceManager> {
    Ok(ServiceManager::new(definition(root, interval_secs)?))
}

pub fn preflight(root: &Path, allow_protected_path: bool) -> Result<()> {
    #[cfg(unix)]
    yana_rt::flock_v1::protocol_is_active(root)?;
    #[cfg(target_os = "macos")]
    if !allow_protected_path && macos_protected_path(root) {
        anyhow::bail!(
            "macOS background services may be denied access to Desktop/Documents/Downloads. Move the checkout under ~/Projects, or grant Full Disk Access and retry with --allow-protected-path"
        );
    }
    let _ = allow_protected_path;
    ensure_real_directory(root, &[".yana-ai", "os"])?;
    ensure_real_directory(root, &[".claude", "state"])?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_protected_path(root: &Path) -> bool {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return false;
    };
    ["Desktop", "Documents", "Downloads"]
        .iter()
        .map(|name| home.join(name))
        .any(|protected| root == protected || root.starts_with(protected))
}

pub fn definition(root: &Path, interval_secs: u64) -> Result<ServiceDefinition> {
    definition_for(
        root,
        std::env::current_exe().context("resolving current yana-rt binary")?,
        interval_secs,
    )
}

fn definition_for(root: &Path, binary: PathBuf, interval_secs: u64) -> Result<ServiceDefinition> {
    let root = root
        .canonicalize()
        .with_context(|| format!("resolving project root {}", root.display()))?;
    Ok(ServiceDefinition {
        name: COMPONENT_NAME.into(),
        description: "Yana Giám Thị resident supervisor".into(),
        program: binary,
        args: vec![
            "os".into(),
            "service".into(),
            "run".into(),
            "--dir".into(),
            root.display().to_string(),
            "--interval-secs".into(),
            normalized_interval(interval_secs).to_string(),
        ],
        working_directory: root,
    })
}

pub fn run(root: &Path, interval_secs: u64) -> Result<()> {
    ensure_real_directory(root, &[".yana-ai", "os"])?;
    ensure_real_directory(root, &[".claude", "state"])?;
    let _instance = acquire_instance(root)?;
    let interval = Duration::from_secs(normalized_interval(interval_secs));
    let process_started_at = crate::os::state::now();
    let mut error_backoff = BoundedBackoff::new(
        Duration::from_secs(1),
        Duration::from_secs(MAX_ERROR_BACKOFF_SECS),
        interval,
    );

    loop {
        let started = Instant::now();
        if halt_is_present(root) {
            std::thread::sleep(interval);
            continue;
        }
        match supervisor::tick_resident(root, &process_started_at) {
            Ok(_) => {
                error_backoff.reset();
                std::thread::sleep(interval.saturating_sub(started.elapsed()));
            }
            Err(error) => {
                eprintln!("Yana resident supervisor tick failed: {error:#}");
                std::thread::sleep(error_backoff.record_failure(started.elapsed()));
            }
        }
    }
}

fn normalized_interval(interval_secs: u64) -> u64 {
    interval_secs.max(MIN_INTERVAL_SECS)
}

fn halt_is_present(root: &Path) -> bool {
    match std::fs::symlink_metadata(root.join(HALT_RELATIVE_PATH)) {
        Ok(_) => true,
        Err(error) => error.kind() != std::io::ErrorKind::NotFound,
    }
}

fn ensure_real_directory(root: &Path, components: &[&str]) -> Result<()> {
    let mut current = root.to_path_buf();
    for component in components {
        current.push(component);
        match std::fs::create_dir(&current) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("creating service state {}", current.display()))
            }
        }
        let file_type = std::fs::symlink_metadata(&current)?.file_type();
        if file_type.is_symlink() || !file_type.is_dir() {
            anyhow::bail!(
                "resident service state path must be a real directory: {}",
                current.display()
            );
        }
    }
    Ok(())
}

#[cfg(unix)]
fn acquire_instance(root: &Path) -> Result<yana_rt::flock_v1::FlockGuard> {
    yana_rt::flock_v1::acquire(INSTANCE_LOCK_IDENTITY, root, Duration::ZERO).context(
        "another resident Giám Thị instance is already running, or flock-v1 is unavailable",
    )
}

#[cfg(windows)]
struct WindowsInstanceGuard(PathBuf);

#[cfg(windows)]
impl Drop for WindowsInstanceGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(windows)]
fn acquire_instance(root: &Path) -> Result<WindowsInstanceGuard> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let path = root.join(".yana-ai/os/giamthi-resident.instance");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .with_context(|| {
            format!(
                "resident Giám Thị instance evidence already exists at {}; Windows requires human review after an unclean crash",
                path.display()
            )
        })?;
    writeln!(file, "pid={}", std::process::id())?;
    file.sync_all()?;
    Ok(WindowsInstanceGuard(path))
}

#[cfg(not(any(unix, windows)))]
fn acquire_instance(_root: &Path) -> Result<()> {
    anyhow::bail!("resident Giám Thị is supported on macOS, Linux, and Windows")
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("yana-resident-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".claude/state")).unwrap();
        root
    }

    #[test]
    fn definition_targets_real_resident_subcommand_and_normalizes_interval() {
        let root = root();
        let definition = definition_for(&root, PathBuf::from("/tmp/yana rt"), 1).unwrap();
        let canonical_root = root.canonicalize().unwrap();
        assert_eq!(definition.program, PathBuf::from("/tmp/yana rt"));
        assert_eq!(
            definition.args,
            [
                "os",
                "service",
                "run",
                "--dir",
                canonical_root.to_str().unwrap(),
                "--interval-secs",
                "5"
            ]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn any_halt_state_is_fail_closed_and_never_removed() {
        let root = root();
        let halt = root.join(HALT_RELATIVE_PATH);
        std::fs::create_dir(&halt).unwrap();
        assert!(halt_is_present(&root));
        assert!(halt.is_dir());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn state_preflight_refuses_symlink_components() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!("yana-resident-link-{}", Uuid::new_v4()));
        let outside =
            std::env::temp_dir().join(format!("yana-resident-outside-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join(".yana-ai")).unwrap();
        assert!(ensure_real_directory(&root, &[".yana-ai", "os"]).is_err());
        assert!(!outside.join("os").exists());
        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn only_one_resident_instance_can_hold_the_project_lock() {
        let root = root();
        std::fs::write(
            root.join(yana_rt::flock_v1::PROTOCOL_FILE),
            yana_rt::flock_v1::PROTOCOL_VERSION,
        )
        .unwrap();
        let first = acquire_instance(&root).unwrap();
        assert!(acquire_instance(&root).is_err());
        drop(first);
        assert!(acquire_instance(&root).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
}
