//! Dependency-free host and Yana runtime health snapshots.
//!
//! Collection is deliberately best-effort: unsupported GPU telemetry is
//! represented as unavailable evidence, never a fabricated zero. The latest
//! snapshot is replaced atomically and contains no prompts or credentials.

use super::state;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const SNAPSHOT_RELATIVE_PATH: &str = ".yana-ai/os/system-health.json";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(4);

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

struct Output {
    stdout: String,
    success: bool,
}

fn run(program: &str, args: &[&str]) -> Result<Output> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("starting {program}"))?;
    let deadline = Instant::now() + COMMAND_TIMEOUT;
    loop {
        if child.try_wait()?.is_some() {
            let output = child.wait_with_output()?;
            return Ok(Output {
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                success: output.status.success(),
            });
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            bail!("{program} timed out after {}s", COMMAND_TIMEOUT.as_secs());
        }
        thread::sleep(Duration::from_millis(20));
    }
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
fn collect_cpu(warnings: &mut Vec<String>) -> CpuSnapshot {
    let logical_cores = std::thread::available_parallelism().map_or(1, usize::from);
    let first = fs::read_to_string("/proc/stat")
        .ok()
        .and_then(|text| parse_proc_cpu(&text));
    thread::sleep(Duration::from_millis(100));
    let second = fs::read_to_string("/proc/stat")
        .ok()
        .and_then(|text| parse_proc_cpu(&text));
    let utilization_percent = first.zip(second).and_then(|(a, b)| cpu_delta(a, b));
    if utilization_percent.is_none() {
        warnings.push("Linux CPU utilization unavailable from /proc/stat".into());
    }
    let load_average_1m = fs::read_to_string("/proc/loadavg")
        .ok()
        .and_then(|text| text.split_whitespace().next()?.parse().ok());
    CpuSnapshot {
        logical_cores,
        utilization_percent,
        load_average_1m,
        source: "/proc".into(),
    }
}

#[cfg(target_os = "macos")]
fn collect_cpu(warnings: &mut Vec<String>) -> CpuSnapshot {
    let logical_cores = run("sysctl", &["-n", "hw.logicalcpu"])
        .ok()
        .filter(|output| output.success)
        .and_then(|output| output.stdout.trim().parse().ok())
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(1, usize::from));
    let utilization_percent = run("ps", &["-A", "-o", "%cpu="])
        .ok()
        .filter(|output| output.success)
        .map(|output| {
            output
                .stdout
                .lines()
                .filter_map(|line| line.trim().parse::<f64>().ok())
                .sum::<f64>()
                / logical_cores.max(1) as f64
        })
        .map(|value| value.clamp(0.0, 100.0));
    if utilization_percent.is_none() {
        warnings.push("macOS CPU utilization unavailable from ps".into());
    }
    let load_average_1m = run("sysctl", &["-n", "vm.loadavg"])
        .ok()
        .and_then(|output| {
            output
                .stdout
                .trim_matches(|character| character == '{' || character == '}')
                .split_whitespace()
                .next()?
                .parse()
                .ok()
        });
    CpuSnapshot {
        logical_cores,
        utilization_percent,
        load_average_1m,
        source: "sysctl+ps".into(),
    }
}

#[cfg(target_os = "windows")]
fn collect_cpu(warnings: &mut Vec<String>) -> CpuSnapshot {
    let logical_cores = std::thread::available_parallelism().map_or(1, usize::from);
    let utilization_percent = powershell_json("(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average | ConvertTo-Json -Compress")
        .and_then(|value| value.as_f64());
    if utilization_percent.is_none() {
        warnings.push("Windows CPU utilization unavailable from CIM".into());
    }
    CpuSnapshot {
        logical_cores,
        utilization_percent,
        load_average_1m: None,
        source: "Win32_Processor".into(),
    }
}

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
fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
    match fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|text| parse_proc_meminfo(&text))
    {
        Some((total, available)) => MemorySnapshot {
            total_bytes: Some(total),
            used_bytes: Some(total.saturating_sub(available)),
            source: "/proc/meminfo".into(),
        },
        None => {
            warnings.push("Linux memory telemetry unavailable from /proc/meminfo".into());
            MemorySnapshot {
                total_bytes: None,
                used_bytes: None,
                source: "/proc/meminfo".into(),
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
    let total = run("sysctl", &["-n", "hw.memsize"])
        .ok()
        .filter(|o| o.success)
        .and_then(|o| o.stdout.trim().parse::<u64>().ok());
    let vm = run("vm_stat", &[])
        .ok()
        .filter(|o| o.success)
        .and_then(|o| parse_vm_stat(&o.stdout));
    let total = total.or_else(|| vm.map(|value| value.0));
    let used = vm.map(|value| value.1);
    if total.is_none() || used.is_none() {
        warnings.push("macOS memory telemetry is incomplete".into());
    }
    MemorySnapshot {
        total_bytes: total,
        used_bytes: used,
        source: "sysctl+vm_stat".into(),
    }
}

#[cfg(target_os = "windows")]
fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
    let value = powershell_json("$o=Get-CimInstance Win32_OperatingSystem; @{total=[uint64]$o.TotalVisibleMemorySize*1024;free=[uint64]$o.FreePhysicalMemory*1024}|ConvertTo-Json -Compress");
    let total = value
        .as_ref()
        .and_then(|v| v.get("total"))
        .and_then(Value::as_u64);
    let free = value
        .as_ref()
        .and_then(|v| v.get("free"))
        .and_then(Value::as_u64);
    if total.is_none() || free.is_none() {
        warnings.push("Windows memory telemetry unavailable from CIM".into());
    }
    MemorySnapshot {
        total_bytes: total,
        used_bytes: total.zip(free).map(|(t, f)| t.saturating_sub(f)),
        source: "Win32_OperatingSystem".into(),
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
    warnings.push("memory telemetry is unsupported on this platform".into());
    MemorySnapshot {
        total_bytes: None,
        used_bytes: None,
        source: "unsupported".into(),
    }
}

fn collect_disk(root: &Path, warnings: &mut Vec<String>) -> DiskSnapshot {
    #[cfg(unix)]
    {
        let root_text = root.to_string_lossy();
        if let Ok(output) = run("df", &["-kP", &root_text]) {
            if output.success {
                if let Some((total, available)) = parse_df(&output.stdout) {
                    return DiskSnapshot {
                        total_bytes: Some(total),
                        available_bytes: Some(available),
                        source: "df".into(),
                    };
                }
            }
        }
        warnings.push("disk telemetry unavailable from df".into());
        DiskSnapshot {
            total_bytes: None,
            available_bytes: None,
            source: "df".into(),
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Resolve the drive from `root` itself, not the spawned powershell.exe
        // process's own ambient working directory (Get-Location) -- the two
        // can differ whenever the caller passes --dir pointing somewhere else,
        // which silently queried the wrong volume before this fix.
        let root_literal = root.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$drive=[System.IO.Path]::GetPathRoot('{root_literal}').TrimEnd('\\'); $d=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='$drive'\"; @{{total=[uint64]$d.Size;free=[uint64]$d.FreeSpace}}|ConvertTo-Json -Compress"
        );
        let value = powershell_json(&script);
        let total = value
            .as_ref()
            .and_then(|v| v.get("total"))
            .and_then(Value::as_u64);
        let available = value
            .as_ref()
            .and_then(|v| v.get("free"))
            .and_then(Value::as_u64);
        if total.is_none() || available.is_none() {
            warnings.push("Windows disk telemetry unavailable from CIM".into());
        }
        DiskSnapshot {
            total_bytes: total,
            available_bytes: available,
            source: "Win32_LogicalDisk".into(),
        }
    }
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        let _ = root;
        warnings.push("disk telemetry is unsupported on this platform".into());
        DiskSnapshot {
            total_bytes: None,
            available_bytes: None,
            source: "unsupported".into(),
        }
    }
}

fn collect_gpus(warnings: &mut Vec<String>) -> Vec<GpuSnapshot> {
    if let Some(gpus) = nvidia_gpus() {
        return gpus;
    }
    let gpus = platform_gpus();
    if gpus.is_empty() {
        warnings.push("GPU inventory unavailable; no supported native adapter was detected".into());
    }
    gpus
}

fn nvidia_gpus() -> Option<Vec<GpuSnapshot>> {
    let output = run(
        "nvidia-smi",
        &[
            "--query-gpu=name,utilization.gpu,memory.total,memory.used",
            "--format=csv,noheader,nounits",
        ],
    )
    .ok()?;
    if !output.success {
        return None;
    }
    let gpus = output
        .stdout
        .lines()
        .filter_map(|line| {
            let fields: Vec<_> = line.split(',').map(str::trim).collect();
            if fields.len() != 4 {
                return None;
            }
            Some(GpuSnapshot {
                name: fields[0].into(),
                vendor: Some("NVIDIA".into()),
                utilization_percent: fields[1].parse().ok(),
                memory_total_bytes: fields[2].parse::<u64>().ok().map(|mib| mib * 1024 * 1024),
                memory_used_bytes: fields[3].parse::<u64>().ok().map(|mib| mib * 1024 * 1024),
                source: "nvidia-smi".into(),
                status: "ready".into(),
            })
        })
        .collect::<Vec<_>>();
    (!gpus.is_empty()).then_some(gpus)
}

#[cfg(target_os = "macos")]
fn platform_gpus() -> Vec<GpuSnapshot> {
    let output = match run("system_profiler", &["SPDisplaysDataType", "-json"]) {
        Ok(o) if o.success => o,
        _ => return Vec::new(),
    };
    parse_macos_gpus(&output.stdout)
}

#[cfg(target_os = "linux")]
fn platform_gpus() -> Vec<GpuSnapshot> {
    let mut gpus = Vec::new();
    let Ok(entries) = fs::read_dir("/sys/class/drm") else {
        return gpus;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("card") || name.contains('-') {
            continue;
        }
        let vendor = fs::read_to_string(entry.path().join("device/vendor"))
            .ok()
            .map(|v| pci_vendor(v.trim()).into());
        let device = fs::read_to_string(entry.path().join("device/device"))
            .ok()
            .map(|v| v.trim().to_string())
            .unwrap_or_else(|| "unknown".into());
        gpus.push(GpuSnapshot {
            name: format!("{name} ({device})"),
            vendor,
            utilization_percent: None,
            memory_total_bytes: None,
            memory_used_bytes: None,
            source: "sysfs-drm".into(),
            status: "inventory-only".into(),
        });
    }
    gpus
}

#[cfg(target_os = "windows")]
fn platform_gpus() -> Vec<GpuSnapshot> {
    let Some(value) = powershell_json("@(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,AdapterCompatibility)|ConvertTo-Json -Compress") else { return Vec::new(); };
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            Some(GpuSnapshot {
                name: item.get("Name")?.as_str()?.into(),
                vendor: item
                    .get("AdapterCompatibility")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                utilization_percent: None,
                memory_total_bytes: item.get("AdapterRAM").and_then(Value::as_u64),
                memory_used_bytes: None,
                source: "Win32_VideoController".into(),
                status: "inventory-only".into(),
            })
        })
        .collect()
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn platform_gpus() -> Vec<GpuSnapshot> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn powershell_json(script: &str) -> Option<Value> {
    let output = run(
        "powershell.exe",
        &["-NoProfile", "-NonInteractive", "-Command", script],
    )
    .ok()?;
    output
        .success
        .then(|| serde_json::from_str(&output.stdout).ok())
        .flatten()
}

#[cfg(any(test, target_os = "linux"))]
fn parse_proc_cpu(text: &str) -> Option<(u64, u64)> {
    let line = text.lines().find(|line| line.starts_with("cpu "))?;
    let values: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|v| v.parse().ok())
        .collect();
    if values.len() < 4 {
        return None;
    }
    let idle = values[3] + values.get(4).copied().unwrap_or(0);
    Some((values.iter().sum(), idle))
}

#[cfg(any(test, target_os = "linux"))]
fn cpu_delta(first: (u64, u64), second: (u64, u64)) -> Option<f64> {
    let total = second.0.checked_sub(first.0)?;
    let idle = second.1.checked_sub(first.1)?;
    (total > 0).then(|| ((total - idle) as f64 / total as f64) * 100.0)
}

#[cfg(any(test, target_os = "linux"))]
fn parse_proc_meminfo(text: &str) -> Option<(u64, u64)> {
    let value = |key: &str| {
        text.lines()
            .find(|line| line.starts_with(key))?
            .split_whitespace()
            .nth(1)?
            .parse::<u64>()
            .ok()
            .map(|kb| kb * 1024)
    };
    Some((value("MemTotal:")?, value("MemAvailable:")?))
}

#[cfg(any(test, target_os = "macos"))]
fn parse_vm_stat(text: &str) -> Option<(u64, u64)> {
    let page_size = text
        .lines()
        .next()?
        .split_whitespace()
        .find_map(|word| word.trim_end_matches('.').parse::<u64>().ok())?;
    let pages = |name: &str| {
        text.lines()
            .find(|line| line.starts_with(name))?
            .split(':')
            .nth(1)?
            .trim()
            .trim_end_matches('.')
            .parse::<u64>()
            .ok()
    };
    let free = pages("Pages free")?;
    let speculative = pages("Pages speculative").unwrap_or(0);
    let active = pages("Pages active")?;
    let inactive = pages("Pages inactive").unwrap_or(0);
    let wired = pages("Pages wired down")?;
    let compressed = pages("Pages occupied by compressor").unwrap_or(0);
    let total_pages = free + speculative + active + inactive + wired + compressed;
    let used_pages = total_pages.saturating_sub(free + speculative);
    Some((total_pages * page_size, used_pages * page_size))
}

fn parse_df(text: &str) -> Option<(u64, u64)> {
    let fields: Vec<_> = text.lines().last()?.split_whitespace().collect();
    if fields.len() < 6 {
        return None;
    }
    Some((
        fields[1].parse::<u64>().ok()? * 1024,
        fields[3].parse::<u64>().ok()? * 1024,
    ))
}

#[cfg(any(test, target_os = "macos"))]
fn parse_macos_gpus(text: &str) -> Vec<GpuSnapshot> {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    value
        .get("SPDisplaysDataType")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let name = item.get("sppci_model")?.as_str()?.to_string();
            let memory = item
                .get("spdisplays_vram")
                .and_then(Value::as_str)
                .and_then(parse_human_bytes);
            Some(GpuSnapshot {
                name,
                vendor: item
                    .get("spdisplays_vendor")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                utilization_percent: None,
                memory_total_bytes: memory,
                memory_used_bytes: None,
                source: "system_profiler".into(),
                status: "inventory-only".into(),
            })
        })
        .collect()
}

#[cfg(any(test, target_os = "macos"))]
fn parse_human_bytes(text: &str) -> Option<u64> {
    let mut fields = text.split_whitespace();
    let value = fields.next()?.parse::<f64>().ok()?;
    let multiplier = match fields.next()?.to_ascii_uppercase().as_str() {
        "MB" => 1024u64.pow(2),
        "GB" => 1024u64.pow(3),
        _ => return None,
    };
    Some((value * multiplier as f64) as u64)
}

#[cfg(target_os = "linux")]
fn pci_vendor(id: &str) -> &'static str {
    match id.trim_start_matches("0x") {
        "10de" => "NVIDIA",
        "1002" => "AMD",
        "8086" => "Intel",
        _ => "Unknown",
    }
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

    #[test]
    fn parses_linux_cpu_and_memory() {
        let first = parse_proc_cpu("cpu  10 1 5 84 0 0 0 0\n").unwrap();
        let second = parse_proc_cpu("cpu  20 1 10 169 0 0 0 0\n").unwrap();
        assert!((cpu_delta(first, second).unwrap() - 15.0).abs() < f64::EPSILON);
        assert_eq!(
            parse_proc_meminfo("MemTotal: 1000 kB\nMemAvailable: 250 kB\n"),
            Some((1_024_000, 256_000))
        );
    }

    #[test]
    fn parses_disk_and_macos_gpu_without_fake_usage() {
        assert_eq!(parse_df("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 100 40 60 40% /\n"), Some((102_400, 61_440)));
        let gpus = parse_macos_gpus(
            r#"{"SPDisplaysDataType":[{"sppci_model":"Apple M4","spdisplays_vendor":"Apple","spdisplays_vram":"16 GB"}]}"#,
        );
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].memory_total_bytes, Some(16 * 1024u64.pow(3)));
        assert_eq!(gpus[0].utilization_percent, None);
    }

    #[test]
    fn vm_stat_provides_a_sandbox_safe_total_memory_fallback() {
        let value = parse_vm_stat(
            "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 10.\nPages active: 20.\nPages inactive: 30.\nPages speculative: 5.\nPages wired down: 10.\nPages occupied by compressor: 5.\n",
        )
        .unwrap();
        assert_eq!(value, (80 * 16_384, 65 * 16_384));
    }

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
