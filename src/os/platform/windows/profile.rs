//! Windows `HostProfile` assembly — `TelemetryBackend`/`AcceleratorBackend`
//! wired to Phase 2's `telemetry.rs` collectors plus one extra
//! `Get-CimInstance Win32_Processor` call `SystemHealthSnapshot` never
//! needed (physical core count, CPU name string).

#[cfg(target_os = "windows")]
use super::super::capabilities::{PlatformCapabilities, Support};
#[cfg(target_os = "windows")]
use super::super::contract::{AcceleratorBackend, TelemetryBackend};
#[cfg(target_os = "windows")]
use super::super::profile::{
    AcceleratorInfo, AcceleratorKind, CpuProfile, HostProfile, MemoryModelKind, MemoryProfile,
};
#[cfg(target_os = "windows")]
use super::telemetry::powershell_json;
#[cfg(target_os = "windows")]
use anyhow::Result;
#[cfg(target_os = "windows")]
use serde_json::Value;

#[cfg(target_os = "windows")]
pub struct Backend;

#[cfg(target_os = "windows")]
impl TelemetryBackend for Backend {
    fn host_profile(&self) -> Result<HostProfile> {
        Ok(HostProfile {
            schema_version: 1,
            os: std::env::consts::OS.into(),
            arch: std::env::consts::ARCH.into(),
            cpu: cpu_profile(),
            memory: memory_profile(),
            accelerators: accelerator_info(),
            capabilities: capabilities(),
        })
    }
}

#[cfg(target_os = "windows")]
impl AcceleratorBackend for Backend {
    fn accelerators(&self) -> Result<Vec<AcceleratorInfo>> {
        Ok(accelerator_info())
    }
}

#[cfg(target_os = "windows")]
fn cpu_profile() -> CpuProfile {
    let logical_cores = std::thread::available_parallelism().map_or(1, usize::from);
    let value = powershell_json("@{cores=(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum;name=(Get-CimInstance Win32_Processor | Select-Object -First 1).Name}|ConvertTo-Json -Compress");
    let physical_cores = value
        .as_ref()
        .and_then(|v| v.get("cores"))
        .and_then(Value::as_u64)
        .map(|v| v as usize);
    let vendor = value
        .as_ref()
        .and_then(|v| v.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    CpuProfile {
        logical_cores,
        physical_cores,
        vendor,
    }
}

#[cfg(target_os = "windows")]
fn memory_profile() -> MemoryProfile {
    let total_bytes = super::telemetry::collect_memory(&mut Vec::new()).total_bytes;
    // No cheap, reliable native signal on Windows for shared vs. dedicated
    // GPU memory (would need a DXGI adapter-memory-bus query, not
    // implemented) — stays Unknown rather than guessed.
    MemoryProfile {
        total_bytes,
        model: MemoryModelKind::Unknown,
    }
}

#[cfg(target_os = "windows")]
fn accelerator_info() -> Vec<AcceleratorInfo> {
    super::telemetry::collect_gpus(&mut Vec::new())
        .into_iter()
        .map(|gpu| {
            let is_nvidia = gpu.source == "nvidia-smi";
            let memory_model = if is_nvidia {
                MemoryModelKind::Dedicated
            } else {
                MemoryModelKind::Unknown
            };
            let dedicated_memory_bytes = (memory_model == MemoryModelKind::Dedicated)
                .then_some(gpu.memory_total_bytes)
                .flatten();
            AcceleratorInfo {
                kind: AcceleratorKind::Gpu,
                vendor: gpu.vendor,
                name: gpu.name,
                backend: is_nvidia.then(|| "cuda".to_string()),
                memory_model,
                dedicated_memory_bytes,
                telemetry: if gpu.status == "ready" {
                    Support::Supported
                } else {
                    Support::Unsupported
                },
            }
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn capabilities() -> PlatformCapabilities {
    PlatformCapabilities {
        native_service_manager: Support::Supported,
        filesystem_events: Support::Supported,
        secure_secret_storage: Support::Supported,
        process_containment: Support::Supported,
        native_notifications: Support::Supported,
        accelerator_telemetry: Support::Unknown,
    }
}
