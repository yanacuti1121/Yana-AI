//! Dependency-free host and Yana runtime health snapshots.
//!
//! Collection is deliberately best-effort: unsupported GPU telemetry is
//! represented as unavailable evidence, never a fabricated zero. The latest
//! snapshot is replaced atomically and contains no prompts or credentials.

use super::platform::run;
use super::state;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const SNAPSHOT_RELATIVE_PATH: &str = ".yana-ai/os/system-health.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemHealthSnapshot {
    pub schema_version: u32,
    pub captured_at: String,
    pub platform: String,
    pub hostname: Option<String>,
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    pub disk: DiskSnapshot,
    pub gpus: Vec<GpuSnapshot>,
    pub yana: YanaSnapshot,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CpuSnapshot {
    pub logical_cores: usize,
    pub utilization_percent: Option<f64>,
    pub load_average_1m: Option<f64>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemorySnapshot {
    pub total_bytes: Option<u64>,
    pub used_bytes: Option<u64>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiskSnapshot {
    pub total_bytes: Option<u64>,
    pub available_bytes: Option<u64>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GpuSnapshot {
    pub name: String,
    pub vendor: Option<String>,
    pub utilization_percent: Option<f64>,
    pub memory_total_bytes: Option<u64>,
    pub memory_used_bytes: Option<u64>,
    pub source: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct YanaSnapshot {
    pub runtime_binary: String,
    pub protocol_marker: String,
    pub management_state: String,
    pub managed_agents: Option<usize>,
    pub running_agents: Option<usize>,
}

pub fn collect(root: &Path) -> SystemHealthSnapshot {
    let mut warnings = Vec::new();
    let cpu = collect_cpu(&mut warnings);
    let memory = collect_memory(&mut warnings);
    let disk = collect_disk(root, &mut warnings);
    let gpus = collect_gpus(&mut warnings);
    let yana = collect_yana(root);
    SystemHealthSnapshot {
        schema_version: 1,
        captured_at: state::now(),
        platform: std::env::consts::OS.to_string(),
        hostname: run("hostname", &[])
            .ok()
            .filter(|output| output.success)
            .map(|output| output.stdout.trim().to_string())
            .filter(|value| !value.is_empty()),
        cpu,
        memory,
        disk,
        gpus,
        yana,
        warnings,
    }
}

fn collect_yana(root: &Path) -> YanaSnapshot {
    let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
    let protocol_marker = match fs::read_to_string(&marker) {
        Ok(value) if value.trim() == yana_rt::flock_v1::PROTOCOL_VERSION => "active".into(),
        Ok(value) => format!("mismatch ({})", value.trim()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "missing".into(),
        Err(error) => format!("unreadable ({error})"),
    };
    let (management_state, managed_agents, running_agents) = match state::load(root) {
        Ok(current) => {
            let running = current
                .agents
                .iter()
                .filter(|agent| agent.status == state::AgentStatus::Running)
                .count();
            ("ready".into(), Some(current.agents.len()), Some(running))
        }
        Err(error) => (format!("unavailable ({error})"), None, None),
    };
    YanaSnapshot {
        runtime_binary: std::env::current_exe()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| "unavailable".into()),
        protocol_marker,
        management_state,
        managed_agents,
        running_agents,
    }
}

#[cfg(target_os = "linux")]
use super::platform::linux::telemetry::collect_cpu;
#[cfg(target_os = "macos")]
use super::platform::macos::telemetry::collect_cpu;
#[cfg(target_os = "windows")]
use super::platform::windows::telemetry::collect_cpu;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_cpu(warnings: &mut Vec<String>) -> CpuSnapshot {
    warnings.push("CPU telemetry is unsupported on this platform".into());
    CpuSnapshot {
        logical_cores: std::thread::available_parallelism().map_or(1, usize::from),
        utilization_percent: None,
        load_average_1m: None,
        source: "unsupported".into(),
    }
}

#[cfg(target_os = "linux")]
use super::platform::linux::telemetry::collect_memory;
#[cfg(target_os = "macos")]
use super::platform::macos::telemetry::collect_memory;
#[cfg(target_os = "windows")]
use super::platform::windows::telemetry::collect_memory;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
    warnings.push("memory telemetry is unsupported on this platform".into());
    MemorySnapshot {
        total_bytes: None,
        used_bytes: None,
        source: "unsupported".into(),
    }
}

#[cfg(target_os = "linux")]
use super::platform::linux::telemetry::collect_disk;
#[cfg(target_os = "macos")]
use super::platform::macos::telemetry::collect_disk;
#[cfg(target_os = "windows")]
use super::platform::windows::telemetry::collect_disk;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_disk(root: &Path, warnings: &mut Vec<String>) -> DiskSnapshot {
    let _ = root;
    warnings.push("disk telemetry is unsupported on this platform".into());
    DiskSnapshot {
        total_bytes: None,
        available_bytes: None,
        source: "unsupported".into(),
    }
}

#[cfg(target_os = "linux")]
use super::platform::linux::telemetry::collect_gpus;
#[cfg(target_os = "macos")]
use super::platform::macos::telemetry::collect_gpus;
#[cfg(target_os = "windows")]
use super::platform::windows::telemetry::collect_gpus;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_gpus(warnings: &mut Vec<String>) -> Vec<GpuSnapshot> {
    if let Some(gpus) = super::platform::nvidia_gpus() {
        return gpus;
    }
    warnings.push("GPU inventory unavailable; no supported native adapter was detected".into());
    Vec::new()
}

pub fn snapshot_path(root: &Path) -> PathBuf {
    root.join(SNAPSHOT_RELATIVE_PATH)
}

pub fn persist(root: &Path, snapshot: &SystemHealthSnapshot) -> Result<()> {
    let directory = root.join(".yana-ai/os");
    ensure_real_directory(root, &directory)?;
    let path = snapshot_path(root);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => bail!(
            "system health snapshot must be a regular file: {}",
            path.display()
        ),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).context("inspecting system health snapshot"),
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = directory.join(format!(
        ".system-health.{}.{}.tmp",
        std::process::id(),
        nonce
    ));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(&temporary)?;
    let result = (|| -> Result<()> {
        serde_json::to_writer_pretty(&mut file, snapshot)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        #[cfg(target_os = "windows")]
        if path.exists() {
            fs::remove_file(&path)?;
        }
        fs::rename(&temporary, &path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn ensure_real_directory(root: &Path, directory: &Path) -> Result<()> {
    let yana = root.join(".yana-ai");
    for path in [&yana, directory] {
        if path.exists() {
            let metadata = fs::symlink_metadata(path)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                bail!(
                    "monitor directory must be a real directory: {}",
                    path.display()
                );
            }
        } else {
            fs::create_dir_all(path)?;
        }
        #[cfg(unix)]
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

pub fn load(root: &Path) -> Result<SystemHealthSnapshot> {
    let path = snapshot_path(root);
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = options.open(&path).with_context(|| {
        format!(
            "no system health snapshot at {}; run `yana-rt os monitor sample --dir {}`",
            path.display(),
            root.display()
        )
    })?;
    if !file.metadata()?.is_file() {
        bail!(
            "system health snapshot must be a regular file: {}",
            path.display()
        );
    }
    let mut text = String::new();
    file.read_to_string(&mut text)?;
    serde_json::from_str(&text)
        .with_context(|| format!("invalid system health snapshot {}", path.display()))
}

pub fn print(snapshot: &SystemHealthSnapshot, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(snapshot)?);
        return Ok(());
    }
    println!(
        "Yana system health — {} on {}",
        snapshot.captured_at, snapshot.platform
    );
    println!(
        "  CPU       {} cores · {}% · load {}",
        snapshot.cpu.logical_cores,
        display_percent(snapshot.cpu.utilization_percent),
        display_number(snapshot.cpu.load_average_1m)
    );
    println!(
        "  Memory    {} / {}",
        display_bytes(snapshot.memory.used_bytes),
        display_bytes(snapshot.memory.total_bytes)
    );
    println!(
        "  Disk      {} available / {}",
        display_bytes(snapshot.disk.available_bytes),
        display_bytes(snapshot.disk.total_bytes)
    );
    if snapshot.gpus.is_empty() {
        println!("  GPU       — unavailable");
    }
    for gpu in &snapshot.gpus {
        println!(
            "  GPU       {} · {}% · {}",
            gpu.name,
            display_percent(gpu.utilization_percent),
            gpu.status
        );
    }
    println!(
        "  Yana      protocol {} · state {} · agents {}/{}",
        snapshot.yana.protocol_marker,
        snapshot.yana.management_state,
        snapshot
            .yana
            .running_agents
            .map_or_else(|| "—".into(), |v| v.to_string()),
        snapshot
            .yana
            .managed_agents
            .map_or_else(|| "—".into(), |v| v.to_string())
    );
    for warning in &snapshot.warnings {
        println!("  WARN      {warning}");
    }
    Ok(())
}

fn display_percent(value: Option<f64>) -> String {
    value.map_or_else(|| "—".into(), |v| format!("{v:.1}"))
}
fn display_number(value: Option<f64>) -> String {
    value.map_or_else(|| "—".into(), |v| format!("{v:.2}"))
}
fn display_bytes(value: Option<u64>) -> String {
    value.map_or_else(
        || "—".into(),
        |v| format!("{:.1} GiB", v as f64 / 1024f64.powi(3)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // Platform-specific parsing (`/proc/stat`, `vm_stat`, `df`,
    // `system_profiler` JSON) is tested where it now lives:
    // `platform::linux::telemetry`, `platform::macos::telemetry`,
    // `platform::windows::telemetry`. This module keeps only the
    // orchestration-level test — snapshot collection, persistence, and
    // the symlink-rejection guarantee — which doesn't move with the
    // per-OS extraction.

    #[test]
    fn snapshot_round_trip_is_private_and_rejects_symlink() {
        let root = tempfile::tempdir().unwrap();
        let snapshot = collect(root.path());
        persist(root.path(), &snapshot).unwrap();
        assert_eq!(load(root.path()).unwrap().schema_version, 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::{symlink, PermissionsExt};
            assert_eq!(
                fs::metadata(snapshot_path(root.path()))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
            fs::remove_file(snapshot_path(root.path())).unwrap();
            let outside = root.path().join("outside");
            fs::write(&outside, "safe").unwrap();
            symlink(&outside, snapshot_path(root.path())).unwrap();
            assert!(persist(root.path(), &snapshot).is_err());
            assert_eq!(fs::read_to_string(outside).unwrap(), "safe");
        }
    }
}
