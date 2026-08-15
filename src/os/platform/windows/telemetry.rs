//! Windows host telemetry mechanisms — extracted from `os::monitor`
//! (Phase 2 of the host-native-os program) with zero behavior change.
//! Same `Get-CimInstance`-via-`powershell.exe` calls, same parsing, same
//! fallback semantics (unavailable telemetry stays `None` + a warning,
//! never a fabricated value).

#[cfg(target_os = "windows")]
use super::super::run;
#[cfg(target_os = "windows")]
use crate::os::monitor::{CpuSnapshot, DiskSnapshot, GpuSnapshot, MemorySnapshot};
#[cfg(target_os = "windows")]
use serde_json::Value;
#[cfg(target_os = "windows")]
use std::path::Path;

#[cfg(target_os = "windows")]
pub fn collect_cpu(warnings: &mut Vec<String>) -> CpuSnapshot {
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

#[cfg(target_os = "windows")]
pub fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
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

#[cfg(target_os = "windows")]
pub fn collect_disk(root: &Path, warnings: &mut Vec<String>) -> DiskSnapshot {
    // Resolve the drive from `root` itself, not the spawned powershell.exe
    // process's own ambient working directory (Get-Location) -- the two
    // can differ whenever the caller passes --dir pointing somewhere else,
    // which silently queried the wrong volume before this fix. `root` also
    // arrives via state::project_root()'s canonicalize(), which on Windows
    // prepends the \\?\ extended-length prefix; GetPathRoot() on a prefixed
    // path returns "\\?\D:\" (not "D:\"), so that prefix must be stripped
    // before deriving the drive letter or the WMI filter never matches.
    let root_literal = root.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"$p='{root_literal}'; if ($p.StartsWith('\\?\')) {{ $p = $p.Substring(4) }}; $drive=[System.IO.Path]::GetPathRoot($p).TrimEnd('\'); $d=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'"; @{{total=[uint64]$d.Size;free=[uint64]$d.FreeSpace}}|ConvertTo-Json -Compress"#
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

#[cfg(target_os = "windows")]
pub fn collect_gpus(warnings: &mut Vec<String>) -> Vec<GpuSnapshot> {
    if let Some(gpus) = super::super::nvidia_gpus() {
        return gpus;
    }
    let gpus = platform_gpus();
    if gpus.is_empty() {
        warnings.push("GPU inventory unavailable; no supported native adapter was detected".into());
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

#[cfg(target_os = "windows")]
pub(super) fn powershell_json(script: &str) -> Option<Value> {
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
