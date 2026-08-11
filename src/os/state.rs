//! Versioned local state for the Yana OS management plane.

use anyhow::{bail, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

pub const SCHEMA_VERSION: u32 = 1;
const STATE_RELATIVE_PATH: &str = ".yana-ai/os/state.json";
const STATE_LOCK_IDENTITY: &str = "key:yana-os/state.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OsState {
    pub schema_version: u32,
    pub agents: Vec<ManagedAgent>,
    pub resource_policy: Option<ResourcePolicy>,
}

impl Default for OsState {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            agents: Vec::new(),
            resource_policy: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedAgent {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub owner: Option<String>,
    pub status: AgentStatus,
    pub created_at: String,
    pub updated_at: String,
    pub last_heartbeat: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, clap::ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Registered,
    Running,
    Stopped,
    Failed,
}

impl AgentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Registered => "registered",
            Self::Running => "running",
            Self::Stopped => "stopped",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResourcePolicy {
    pub max_active_agents: Option<usize>,
    pub max_tokens_per_request: Option<u64>,
    pub max_daily_cost_usd: Option<f64>,
    pub stale_after_secs: u64,
}

impl Default for ResourcePolicy {
    fn default() -> Self {
        Self {
            max_active_agents: None,
            max_tokens_per_request: None,
            max_daily_cost_usd: None,
            stale_after_secs: 300,
        }
    }
}

pub fn project_root(path: &Path) -> Result<PathBuf> {
    path.canonicalize()
        .with_context(|| format!("cannot resolve project root {}", path.display()))
}

pub fn state_path(root: &Path) -> PathBuf {
    root.join(STATE_RELATIVE_PATH)
}

fn validate_state(state: &OsState, path: &Path) -> Result<()> {
    if state.schema_version != SCHEMA_VERSION {
        bail!(
            "unsupported Yana OS state schema {} in {}; expected {}",
            state.schema_version,
            path.display(),
            SCHEMA_VERSION
        );
    }
    Ok(())
}

pub fn load(root: &Path) -> Result<OsState> {
    let path = state_path(root);
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = match options.open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            bail!(
                "Yana OS is not initialized at {}; run `yana-rt os init --dir {}`",
                path.display(),
                root.display()
            );
        }
        Err(error) => {
            return Err(error)
                .with_context(|| format!("cannot open Yana OS state {}", path.display()));
        }
    };
    if !file.metadata()?.file_type().is_file() {
        bail!("Yana OS state must be a regular file: {}", path.display());
    }
    let mut text = String::new();
    file.read_to_string(&mut text)
        .with_context(|| format!("cannot read Yana OS state {}", path.display()))?;
    let state: OsState = serde_json::from_str(&text)
        .with_context(|| format!("invalid Yana OS state {}", path.display()))?;
    validate_state(&state, &path)?;
    Ok(state)
}

fn ensure_private_directory(root: &Path) -> Result<PathBuf> {
    let yana_directory = root.join(".yana-ai");
    if yana_directory.exists() {
        let metadata = fs::symlink_metadata(&yana_directory)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            bail!(
                "Yana runtime directory must be a real directory: {}",
                yana_directory.display()
            );
        }
    } else {
        fs::create_dir(&yana_directory).with_context(|| {
            format!(
                "creating Yana runtime directory {}",
                yana_directory.display()
            )
        })?;
    }
    #[cfg(unix)]
    fs::set_permissions(&yana_directory, fs::Permissions::from_mode(0o700))?;
    let directory = root.join(".yana-ai/os");
    if directory.exists() {
        let metadata = fs::symlink_metadata(&directory)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            bail!(
                "Yana OS state directory must be a real directory: {}",
                directory.display()
            );
        }
    } else {
        fs::create_dir_all(&directory)
            .with_context(|| format!("creating Yana OS directory {}", directory.display()))?;
    }
    #[cfg(unix)]
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
    Ok(directory)
}

fn write_atomic(root: &Path, state: &OsState) -> Result<()> {
    validate_state(state, &state_path(root))?;
    let directory = ensure_private_directory(root)?;
    let path = state_path(root);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            bail!(
                "refusing to replace symlinked Yana OS state: {}",
                path.display()
            );
        }
        Ok(metadata) if !metadata.is_file() => {
            bail!("Yana OS state must be a regular file: {}", path.display());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).context("inspecting existing Yana OS state"),
    }
    let temporary = directory.join(format!(".state.{}.tmp", Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(&temporary)
        .with_context(|| format!("creating temporary state {}", temporary.display()))?;
    let result = (|| -> Result<()> {
        serde_json::to_writer_pretty(&mut file, state)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        fs::rename(&temporary, &path)
            .with_context(|| format!("replacing Yana OS state {}", path.display()))?;
        File::open(&directory)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn with_lock<T>(root: &Path, operation: impl FnOnce() -> Result<T>) -> Result<T> {
    let _guard = yana_rt::flock_v1::acquire(STATE_LOCK_IDENTITY, root, Duration::from_secs(10))?;
    operation()
}

pub fn initialize(root: &Path) -> Result<OsState> {
    with_lock(root, || {
        let path = state_path(root);
        if fs::symlink_metadata(&path).is_ok() {
            return load(root);
        }
        let state = OsState::default();
        write_atomic(root, &state)?;
        Ok(state)
    })
}

pub fn mutate<T>(root: &Path, operation: impl FnOnce(&mut OsState) -> Result<T>) -> Result<T> {
    with_lock(root, || {
        let mut state = load(root)?;
        let output = operation(&mut state)?;
        write_atomic(root, &state)?;
        Ok(output)
    })
}

pub fn now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("yana-os-state-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        root
    }

    #[test]
    fn initialize_and_mutate_round_trip() {
        let root = root();
        initialize(&root).unwrap();
        mutate(&root, |state| {
            state.resource_policy = Some(ResourcePolicy::default());
            Ok(())
        })
        .unwrap();
        assert!(load(&root).unwrap().resource_policy.is_some());
        let permissions = fs::metadata(state_path(&root)).unwrap().permissions();
        #[cfg(unix)]
        assert_eq!(permissions.mode() & 0o777, 0o600);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn corrupt_state_is_never_silently_replaced() {
        let root = root();
        let directory = root.join(".yana-ai/os");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("state.json"), "not json").unwrap();
        let error = initialize(&root).unwrap_err().to_string();
        assert!(error.contains("invalid Yana OS state"));
        assert_eq!(
            fs::read_to_string(directory.join("state.json")).unwrap(),
            "not json"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_runtime_directory_is_rejected() {
        use std::os::unix::fs::symlink;
        let root = root();
        let outside = std::env::temp_dir().join(format!("yana-os-outside-{}", Uuid::new_v4()));
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join(".yana-ai")).unwrap();
        let error = initialize(&root).unwrap_err().to_string();
        assert!(error.contains("real directory"));
        assert!(!outside.join("os/state.json").exists());
        fs::remove_file(root.join(".yana-ai")).unwrap();
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_state_file_is_rejected_without_touching_target() {
        use std::os::unix::fs::symlink;
        let root = root();
        let directory = root.join(".yana-ai/os");
        fs::create_dir_all(&directory).unwrap();
        let outside = std::env::temp_dir().join(format!("yana-os-state-target-{}", Uuid::new_v4()));
        fs::write(&outside, "do not replace").unwrap();
        symlink(&outside, directory.join("state.json")).unwrap();
        assert!(initialize(&root).is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "do not replace");
        fs::remove_dir_all(root).unwrap();
        fs::remove_file(outside).unwrap();
    }
}
