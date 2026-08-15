//! macOS `HostProfile` assembly — `TelemetryBackend`/`AcceleratorBackend`
//! wired to Phase 2's `telemetry.rs` collectors plus a few static probes
//! `SystemHealthSnapshot` never needed (physical core count, CPU vendor
//! string, unified-memory determination).
//!
//! Capability flags below are only ever `Support::Supported` when the
//! underlying OS mechanism is a documented, version-independent guarantee
//! (launchd, FSEvents, Keychain, and sandbox-exec are present on every
//! supported macOS release — that is a fact about the OS, not a probe
//! result). Anything that genuinely depends on what happens to be
//! installed on this particular host (e.g. whether a GPU vendor tool
//! exposes live utilization) stays `Support::Unknown` until a real
//! per-call probe exists — never guessed.

#[cfg(target_os = "macos")]
use super::super::capabilities::PlatformCapabilities;
#[cfg(any(test, target_os = "macos"))]
use super::super::capabilities::Support;
#[cfg(target_os = "macos")]
use super::super::contract::{AcceleratorBackend, TelemetryBackend};
#[cfg(any(test, target_os = "macos"))]
use super::super::profile::{AcceleratorInfo, AcceleratorKind, MemoryModelKind};
#[cfg(target_os = "macos")]
use super::super::profile::{CpuProfile, HostProfile, MemoryProfile};
#[cfg(target_os = "macos")]
use super::super::run;
#[cfg(any(test, target_os = "macos"))]
use crate::os::monitor::GpuSnapshot;
#[cfg(target_os = "macos")]
use anyhow::Result;

#[cfg(target_os = "macos")]
pub struct Backend;

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
impl AcceleratorBackend for Backend {
    fn accelerators(&self) -> Result<Vec<AcceleratorInfo>> {
        Ok(accelerator_info())
    }
}

#[cfg(target_os = "macos")]
fn cpu_profile() -> CpuProfile {
    let logical_cores = run("sysctl", &["-n", "hw.logicalcpu"])
        .ok()
        .filter(|o| o.success)
        .and_then(|o| o.stdout.trim().parse().ok())
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(1, usize::from));
    let physical_cores = run("sysctl", &["-n", "hw.physicalcpu"])
        .ok()
        .filter(|o| o.success)
        .and_then(|o| o.stdout.trim().parse().ok());
    let vendor = run("sysctl", &["-n", "machdep.cpu.brand_string"])
        .ok()
        .filter(|o| o.success)
        .map(|o| o.stdout.trim().to_string())
        .filter(|value| !value.is_empty());
    CpuProfile {
        logical_cores,
        physical_cores,
        vendor,
    }
}

#[cfg(target_os = "macos")]
fn memory_profile() -> MemoryProfile {
    let total_bytes = run("sysctl", &["-n", "hw.memsize"])
        .ok()
        .filter(|o| o.success)
        .and_then(|o| o.stdout.trim().parse().ok());
    // Apple Silicon (arm64) guarantees unified CPU/GPU memory by hardware
    // design. Intel Macs may or may not carry a discrete GPU with its own
    // pool, and there is no cheap native probe here to tell the two apart
    // beyond what accelerator_info() already reports per-accelerator, so
    // the host-level model stays Unknown on Intel rather than guessed.
    let model = if std::env::consts::ARCH == "aarch64" {
        MemoryModelKind::Unified
    } else {
        MemoryModelKind::Unknown
    };
    MemoryProfile { total_bytes, model }
}

#[cfg(target_os = "macos")]
fn accelerator_info() -> Vec<AcceleratorInfo> {
    super::telemetry::collect_gpus(&mut Vec::new())
        .into_iter()
        .map(classify_gpu)
        .collect()
}

/// Pure classification, split out from `accelerator_info()` so it can be
/// unit-tested against a synthetic `GpuSnapshot` instead of only through a
/// live `system_profiler` call — this is exactly the function that had a
/// real, silent bug: `spdisplays_vendor` in `system_profiler
/// SPDisplaysDataType -json` is the raw SPI identifier
/// "sppci_vendor_Apple", not the plain string "Apple", so a first-draft
/// `== "Apple"` check never matched on real Apple Silicon hardware and
/// `memory_model`/`backend` silently fell back to `Unknown`/`None`. Found
/// by actually running `os host status` against this machine, not by
/// reading the code. `GpuSnapshot.vendor` (`telemetry.rs`) still passes
/// the raw value through unchanged, matching pre-existing `monitor.rs`
/// behavior; this function normalizes it, since "the normalized, truthful
/// description" is `HostProfile`'s entire job.
#[cfg(any(test, target_os = "macos"))]
fn classify_gpu(gpu: GpuSnapshot) -> AcceleratorInfo {
    let is_nvidia = gpu.source == "nvidia-smi";
    let is_apple = gpu.vendor.as_deref().is_some_and(|v| v.contains("Apple"));
    let memory_model = if is_apple {
        MemoryModelKind::Unified
    } else if is_nvidia {
        MemoryModelKind::Dedicated
    } else {
        MemoryModelKind::Unknown
    };
    let dedicated_memory_bytes = (memory_model == MemoryModelKind::Dedicated)
        .then_some(gpu.memory_total_bytes)
        .flatten();
    AcceleratorInfo {
        kind: AcceleratorKind::Gpu,
        vendor: if is_apple {
            Some("Apple".into())
        } else {
            gpu.vendor
        },
        name: gpu.name,
        backend: if is_apple {
            Some("metal".into())
        } else if is_nvidia {
            Some("cuda".into())
        } else {
            None
        },
        memory_model,
        dedicated_memory_bytes,
        telemetry: if gpu.status == "ready" {
            Support::Supported
        } else {
            Support::Unsupported
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_gpu(vendor: &str, source: &str, status: &str) -> GpuSnapshot {
        GpuSnapshot {
            name: "Test GPU".into(),
            vendor: Some(vendor.into()),
            utilization_percent: None,
            memory_total_bytes: Some(16 * 1024u64.pow(3)),
            memory_used_bytes: None,
            source: source.into(),
            status: status.into(),
        }
    }

    #[test]
    fn real_system_profiler_apple_vendor_string_is_recognized() {
        // Regression test for the exact string real hardware returns —
        // "sppci_vendor_Apple", not "Apple" — captured live from
        // `system_profiler SPDisplaysDataType -json` on this machine.
        let info = classify_gpu(sample_gpu(
            "sppci_vendor_Apple",
            "system_profiler",
            "inventory-only",
        ));
        assert_eq!(info.vendor.as_deref(), Some("Apple"));
        assert_eq!(info.memory_model, MemoryModelKind::Unified);
        assert_eq!(info.backend.as_deref(), Some("metal"));
        assert_eq!(info.dedicated_memory_bytes, None);
        assert_eq!(info.telemetry, Support::Unsupported);
    }

    #[test]
    fn nvidia_via_smi_is_dedicated_cuda_and_has_live_telemetry() {
        let info = classify_gpu(sample_gpu("NVIDIA", "nvidia-smi", "ready"));
        assert_eq!(info.memory_model, MemoryModelKind::Dedicated);
        assert_eq!(info.backend.as_deref(), Some("cuda"));
        assert_eq!(info.dedicated_memory_bytes, Some(16 * 1024u64.pow(3)));
        assert_eq!(info.telemetry, Support::Supported);
    }

    #[test]
    fn unrecognized_vendor_stays_unknown_not_guessed() {
        let info = classify_gpu(sample_gpu(
            "Intel(R) UHD",
            "system_profiler",
            "inventory-only",
        ));
        assert_eq!(info.memory_model, MemoryModelKind::Unknown);
        assert_eq!(info.backend, None);
        assert_eq!(info.dedicated_memory_bytes, None);
    }
}

#[cfg(target_os = "macos")]
fn capabilities() -> PlatformCapabilities {
    PlatformCapabilities {
        native_service_manager: Support::Supported,
        filesystem_events: Support::Supported,
        secure_secret_storage: Support::Supported,
        process_containment: Support::Supported,
        native_notifications: Support::Supported,
        // Whether telemetry is available for a *specific* accelerator is
        // already answered per-entry in accelerator_info(); this coarse
        // host-level flag would conflate "some accelerator has it" with
        // "all do," so it stays Unknown rather than picking one.
        accelerator_telemetry: Support::Unknown,
    }
}
