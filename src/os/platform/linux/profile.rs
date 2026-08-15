//! Linux `HostProfile` assembly — `TelemetryBackend`/`AcceleratorBackend`
//! wired to Phase 2's `telemetry.rs` collectors plus two `/proc/cpuinfo`
//! probes `SystemHealthSnapshot` never needed (physical core count, CPU
//! vendor string).
//!
//! `native_service_manager` is the one capability flag with a real, cheap
//! probe on Linux: `/run/systemd/system` existing is the standard,
//! documented signal that systemd is the running init (the same check
//! glibc's own `sd_booted()` performs) — and `os::service`'s systemd
//! integration specifically targets a `systemd --user` instance, which in
//! practice requires systemd-as-init. Everything else below has no cheap,
//! reliable probe implemented yet and stays `Support::Unknown` rather
//! than guessed.

#[cfg(any(test, target_os = "linux"))]
use super::super::capabilities::{PlatformCapabilities, Support};
#[cfg(target_os = "linux")]
use super::super::contract::{AcceleratorBackend, TelemetryBackend};
#[cfg(any(test, target_os = "linux"))]
use super::super::profile::{
    AcceleratorInfo, AcceleratorKind, CpuProfile, HostProfile, MemoryModelKind, MemoryProfile,
};
#[cfg(target_os = "linux")]
use anyhow::Result;

#[cfg(target_os = "linux")]
pub struct Backend;

#[cfg(target_os = "linux")]
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

#[cfg(target_os = "linux")]
impl AcceleratorBackend for Backend {
    fn accelerators(&self) -> Result<Vec<AcceleratorInfo>> {
        Ok(accelerator_info())
    }
}

#[cfg(target_os = "linux")]
fn cpu_profile() -> CpuProfile {
    let logical_cores = std::thread::available_parallelism().map_or(1, usize::from);
    let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").ok();
    let physical_cores = cpuinfo.as_deref().and_then(parse_physical_cores);
    let vendor = cpuinfo.as_deref().and_then(parse_vendor);
    CpuProfile {
        logical_cores,
        physical_cores,
        vendor,
    }
}

#[cfg(any(test, target_os = "linux"))]
fn parse_physical_cores(text: &str) -> Option<usize> {
    let mut pairs = std::collections::BTreeSet::new();
    let mut physical_id = None;
    let mut core_id = None;
    let field = |line: &str, key: &str| {
        line.strip_prefix(key)
            .and_then(|rest| rest.split(':').nth(1))
            .map(|value| value.trim().to_string())
    };
    for line in text.lines() {
        if let Some(value) = field(line, "physical id") {
            physical_id = Some(value);
        } else if let Some(value) = field(line, "core id") {
            core_id = Some(value);
        } else if line.trim().is_empty() {
            if let (Some(p), Some(c)) = (physical_id.take(), core_id.take()) {
                pairs.insert((p, c));
            }
        }
    }
    if let (Some(p), Some(c)) = (physical_id, core_id) {
        pairs.insert((p, c));
    }
    (!pairs.is_empty()).then_some(pairs.len())
}

#[cfg(any(test, target_os = "linux"))]
fn parse_vendor(text: &str) -> Option<String> {
    let value = |key: &str| {
        text.lines()
            .find(|line| line.starts_with(key))?
            .split(':')
            .nth(1)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    };
    value("vendor_id").or_else(|| value("model name"))
}

#[cfg(target_os = "linux")]
fn memory_profile() -> MemoryProfile {
    let total_bytes = super::telemetry::collect_memory(&mut Vec::new()).total_bytes;
    // No cheap, reliable native signal on Linux for whether a GPU shares
    // system RAM (integrated) or carries its own pool (discrete) beyond
    // what accelerator_info() already infers per-accelerator from the
    // NVIDIA-only nvidia-smi path — the host-level model stays Unknown.
    MemoryProfile {
        total_bytes,
        model: MemoryModelKind::Unknown,
    }
}

#[cfg(target_os = "linux")]
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

#[cfg(target_os = "linux")]
fn capabilities() -> PlatformCapabilities {
    let systemd_is_init = std::path::Path::new("/run/systemd/system").is_dir();
    PlatformCapabilities {
        native_service_manager: if systemd_is_init {
            Support::Supported
        } else {
            Support::Unsupported
        },
        filesystem_events: Support::Unknown,
        secure_secret_storage: Support::Unknown,
        process_containment: Support::Unknown,
        native_notifications: Support::Unknown,
        accelerator_telemetry: Support::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_unique_physical_core_pairs_and_collapses_hyperthreads() {
        let cpuinfo = "processor\t: 0\nphysical id\t: 0\ncore id\t: 0\n\n\
processor\t: 1\nphysical id\t: 0\ncore id\t: 1\n\n\
processor\t: 2\nphysical id\t: 0\ncore id\t: 0\n\n\
processor\t: 3\nphysical id\t: 0\ncore id\t: 1\n";
        assert_eq!(parse_physical_cores(cpuinfo), Some(2));
    }

    #[test]
    fn missing_physical_or_core_id_fields_stay_none_not_a_guess() {
        assert_eq!(
            parse_physical_cores("processor\t: 0\nmodel name\t: ARM\n"),
            None
        );
    }

    #[test]
    fn vendor_prefers_vendor_id_falls_back_to_model_name() {
        assert_eq!(
            parse_vendor("processor\t: 0\nvendor_id\t: GenuineIntel\n"),
            Some("GenuineIntel".into())
        );
        assert_eq!(
            parse_vendor("processor\t: 0\nmodel name\t: ARM Cortex-A72\n"),
            Some("ARM Cortex-A72".into())
        );
    }
}
