//! HostProfile — the normalized, truthful description of the machine Yana
//! is running on.
//!
//! Every field that could not be reliably determined is `None` (or
//! `Support::Unknown` for capability flags) — never a fabricated value.
//! `src/os/monitor.rs` already follows this discipline for its
//! `SystemHealthSnapshot` (e.g. `utilization_percent: Option<f64>`, a
//! warning pushed instead of a synthesized zero); `HostProfile` is the
//! same discipline applied to static host description rather than a
//! point-in-time sample.

use super::capabilities::PlatformCapabilities;
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostProfile {
    pub schema_version: u32,
    /// `std::env::consts::OS` — "macos" | "linux" | "windows" | ...
    pub os: String,
    /// `std::env::consts::ARCH` — "aarch64" | "x86_64" | ...
    pub arch: String,
    pub cpu: CpuProfile,
    pub memory: MemoryProfile,
    pub accelerators: Vec<AcceleratorInfo>,
    pub capabilities: PlatformCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuProfile {
    pub logical_cores: usize,
    pub physical_cores: Option<usize>,
    pub vendor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryProfile {
    pub total_bytes: Option<u64>,
    /// Whether accelerators on this host share system RAM (Apple Silicon's
    /// unified memory) or carry their own dedicated pool — a real
    /// distinction for model-placement decisions in a later phase, not
    /// cosmetic. `Unknown` when the host/accelerator combination wasn't
    /// identifiable, never guessed.
    pub model: MemoryModelKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryModelKind {
    /// CPU and accelerator(s) share one physical memory pool (Apple Silicon).
    Unified,
    /// Accelerator carries its own separate physical memory (discrete GPU).
    Dedicated,
    /// Accelerator has no memory of its own, borrows host RAM on demand
    /// (some integrated GPUs).
    Shared,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcceleratorKind {
    Gpu,
    Npu,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceleratorInfo {
    pub kind: AcceleratorKind,
    pub vendor: Option<String>,
    pub name: String,
    /// Compute backend this accelerator is reachable through, where known
    /// (e.g. "metal", "cuda", "rocm", "directml") — not a claim that Yana
    /// itself can drive that backend, just what was observed.
    pub backend: Option<String>,
    pub memory_model: MemoryModelKind,
    pub dedicated_memory_bytes: Option<u64>,
    /// Whether *utilization* telemetry (not just inventory presence) is
    /// available for this accelerator — matches `monitor.rs`'s existing
    /// `GpuSnapshot::status` distinction between "ready" (has live
    /// utilization) and "inventory-only".
    pub telemetry: super::capabilities::Support,
}

pub fn print(profile: &HostProfile, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(profile)?);
        return Ok(());
    }
    println!("Yana host profile — {} on {}", profile.os, profile.arch);
    println!(
        "  CPU           {} logical{} · {}",
        profile.cpu.logical_cores,
        profile
            .cpu
            .physical_cores
            .map_or_else(String::new, |v| format!(" / {v} physical")),
        profile.cpu.vendor.as_deref().unwrap_or("—")
    );
    println!(
        "  Memory        {} · {:?}",
        profile.memory.total_bytes.map_or_else(
            || "—".into(),
            |v| format!("{:.1} GiB", v as f64 / 1024f64.powi(3))
        ),
        profile.memory.model
    );
    if profile.accelerators.is_empty() {
        println!("  Accelerators  — none detected");
    }
    for accelerator in &profile.accelerators {
        println!(
            "  Accelerator   {} · {:?} · {:?} memory · telemetry {:?}",
            accelerator.name, accelerator.kind, accelerator.memory_model, accelerator.telemetry
        );
    }
    print_capabilities(&profile.capabilities, false)
}

pub fn print_capabilities(capabilities: &PlatformCapabilities, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(capabilities)?);
        return Ok(());
    }
    println!("  Capabilities");
    println!(
        "    native service manager   {:?}",
        capabilities.native_service_manager
    );
    println!(
        "    filesystem events        {:?}",
        capabilities.filesystem_events
    );
    println!(
        "    secure secret storage    {:?}",
        capabilities.secure_secret_storage
    );
    println!(
        "    process containment      {:?}",
        capabilities.process_containment
    );
    println!(
        "    native notifications     {:?}",
        capabilities.native_notifications
    );
    println!(
        "    accelerator telemetry    {:?}",
        capabilities.accelerator_telemetry
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::capabilities::Support;
    use super::*;

    fn sample_profile() -> HostProfile {
        HostProfile {
            schema_version: 1,
            os: "macos".into(),
            arch: "aarch64".into(),
            cpu: CpuProfile {
                logical_cores: 10,
                physical_cores: None,
                vendor: Some("Apple".into()),
            },
            memory: MemoryProfile {
                total_bytes: Some(16 * 1024u64.pow(3)),
                model: MemoryModelKind::Unified,
            },
            accelerators: vec![AcceleratorInfo {
                kind: AcceleratorKind::Gpu,
                vendor: Some("Apple".into()),
                name: "Apple M-series GPU".into(),
                backend: Some("metal".into()),
                memory_model: MemoryModelKind::Unified,
                dedicated_memory_bytes: None,
                telemetry: Support::Unknown,
            }],
            capabilities: PlatformCapabilities {
                native_service_manager: Support::Supported,
                filesystem_events: Support::Unknown,
                secure_secret_storage: Support::Unknown,
                process_containment: Support::Unknown,
                native_notifications: Support::Unknown,
                accelerator_telemetry: Support::Unknown,
            },
        }
    }

    #[test]
    fn unified_memory_accelerator_has_no_dedicated_bytes_by_construction() {
        // Not an enforced invariant (dedicated_memory_bytes is a plain
        // Option), but the sample documents the expected shape: a unified-
        // memory accelerator reports None here, not a fabricated share of
        // total system RAM.
        let profile = sample_profile();
        assert_eq!(
            profile.accelerators[0].memory_model,
            MemoryModelKind::Unified
        );
        assert_eq!(profile.accelerators[0].dedicated_memory_bytes, None);
    }

    #[test]
    fn profile_round_trips_through_json_without_losing_unknown_states() {
        let profile = sample_profile();
        let text = serde_json::to_string_pretty(&profile).unwrap();
        let round_tripped: HostProfile = serde_json::from_str(&text).unwrap();
        assert_eq!(round_tripped.accelerators[0].telemetry, Support::Unknown);
        assert_eq!(
            round_tripped.capabilities.secure_secret_storage,
            Support::Unknown
        );
        assert_eq!(round_tripped.memory.model, MemoryModelKind::Unified);
    }

    #[test]
    fn unavailable_cpu_topology_stays_none_not_a_guessed_number() {
        let profile = sample_profile();
        assert_eq!(profile.cpu.physical_cores, None);
    }
}
