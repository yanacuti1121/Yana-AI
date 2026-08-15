//! Normalized compute topology — CPU/memory/accelerator shape and the
//! subset of platform capabilities relevant to placement decisions.
//!
//! Deliberately thin: this module never probes the OS itself. It derives
//! `ResourceTopology` from `platform::backend().host_profile()` (Phase
//! 3), which already owns "how do I ask this specific OS for its CPU
//! topology" — duplicating that here would be exactly the kind of
//! lowest-common-denominator, ask-twice logic this program's brief rules
//! out.

use crate::os::platform::capabilities::Support;
use crate::os::platform::contract::TelemetryBackend;
use crate::os::platform::profile::{AcceleratorKind, HostProfile, MemoryModelKind};
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceTopology {
    pub schema_version: u32,
    pub os: String,
    pub arch: String,
    pub cpu_logical_cores: usize,
    pub cpu_physical_cores: Option<usize>,
    pub memory_total_bytes: Option<u64>,
    pub memory_model: MemoryModelKind,
    pub accelerators: Vec<AcceleratorTopology>,
    /// Only the platform capabilities that a placement decision actually
    /// needs to consult — not the full `PlatformCapabilities` fingerprint
    /// `os host capabilities` already exposes. Isolation support gates
    /// whether a workload with a containment requirement can be placed at
    /// all; accelerator telemetry support gates whether accelerator
    /// pressure (see `pressure.rs`) can be trusted or is structurally
    /// `Unknown` on this host.
    pub process_containment: Support,
    pub accelerator_telemetry: Support,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceleratorTopology {
    pub name: String,
    pub kind: AcceleratorKind,
    pub memory_model: MemoryModelKind,
    pub dedicated_memory_bytes: Option<u64>,
    pub telemetry_available: bool,
}

/// Collects a fresh `HostProfile` via the live platform backend and
/// derives topology from it.
pub fn collect() -> Result<ResourceTopology> {
    let profile = crate::os::platform::backend().host_profile()?;
    Ok(derive(&profile))
}

fn derive(profile: &HostProfile) -> ResourceTopology {
    ResourceTopology {
        schema_version: 1,
        os: profile.os.clone(),
        arch: profile.arch.clone(),
        cpu_logical_cores: profile.cpu.logical_cores,
        cpu_physical_cores: profile.cpu.physical_cores,
        memory_total_bytes: profile.memory.total_bytes,
        memory_model: profile.memory.model,
        accelerators: profile
            .accelerators
            .iter()
            .map(|accelerator| AcceleratorTopology {
                name: accelerator.name.clone(),
                kind: accelerator.kind,
                memory_model: accelerator.memory_model,
                dedicated_memory_bytes: accelerator.dedicated_memory_bytes,
                telemetry_available: accelerator.telemetry.is_supported(),
            })
            .collect(),
        process_containment: profile.capabilities.process_containment,
        accelerator_telemetry: profile.capabilities.accelerator_telemetry,
    }
}

pub fn print(topology: &ResourceTopology, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(topology)?);
        return Ok(());
    }
    println!("Resource topology — {} on {}", topology.os, topology.arch);
    println!(
        "  CPU           {} logical{}",
        topology.cpu_logical_cores,
        topology
            .cpu_physical_cores
            .map_or_else(String::new, |v| format!(" / {v} physical"))
    );
    println!(
        "  Memory        {} · {:?}",
        topology.memory_total_bytes.map_or_else(
            || "—".into(),
            |v| format!("{:.1} GiB", v as f64 / 1024f64.powi(3))
        ),
        topology.memory_model
    );
    if topology.accelerators.is_empty() {
        println!("  Accelerators  — none detected");
    }
    for accelerator in &topology.accelerators {
        println!(
            "  Accelerator   {} · {:?} memory · telemetry {}",
            accelerator.name, accelerator.memory_model, accelerator.telemetry_available
        );
    }
    println!(
        "  Isolation     {:?}    Accelerator telemetry (host-wide)  {:?}",
        topology.process_containment, topology.accelerator_telemetry
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::platform::capabilities::PlatformCapabilities;
    use crate::os::platform::profile::{AcceleratorInfo, CpuProfile, MemoryProfile};

    fn sample_profile() -> HostProfile {
        HostProfile {
            schema_version: 1,
            os: "macos".into(),
            arch: "aarch64".into(),
            cpu: CpuProfile {
                logical_cores: 10,
                physical_cores: Some(10),
                vendor: Some("Apple M4".into()),
            },
            memory: MemoryProfile {
                total_bytes: Some(16 * 1024u64.pow(3)),
                model: MemoryModelKind::Unified,
            },
            accelerators: vec![AcceleratorInfo {
                kind: AcceleratorKind::Gpu,
                vendor: Some("Apple".into()),
                name: "Apple M4".into(),
                backend: Some("metal".into()),
                memory_model: MemoryModelKind::Unified,
                dedicated_memory_bytes: None,
                telemetry: Support::Unsupported,
            }],
            capabilities: PlatformCapabilities {
                native_service_manager: Support::Supported,
                filesystem_events: Support::Supported,
                secure_secret_storage: Support::Supported,
                process_containment: Support::Supported,
                native_notifications: Support::Supported,
                accelerator_telemetry: Support::Unknown,
            },
        }
    }

    #[test]
    fn derives_topology_without_reprobing_the_host() {
        let topology = derive(&sample_profile());
        assert_eq!(topology.cpu_logical_cores, 10);
        assert_eq!(topology.cpu_physical_cores, Some(10));
        assert_eq!(topology.memory_model, MemoryModelKind::Unified);
        assert_eq!(topology.accelerators.len(), 1);
        assert!(!topology.accelerators[0].telemetry_available);
    }

    #[test]
    fn only_placement_relevant_capabilities_survive_into_topology() {
        let topology = derive(&sample_profile());
        assert_eq!(topology.process_containment, Support::Supported);
        assert_eq!(topology.accelerator_telemetry, Support::Unknown);
    }

    #[test]
    fn missing_cpu_topology_stays_none_not_a_guessed_number() {
        let mut profile = sample_profile();
        profile.cpu.physical_cores = None;
        let topology = derive(&profile);
        assert_eq!(topology.cpu_physical_cores, None);
    }
}
