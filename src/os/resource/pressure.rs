//! CURRENT host resource pressure — deliberately separate from
//! `topology` (what the host has) and `policy` (what limits are
//! configured). Pressure is a point-in-time reading, always fresh, never
//! cached: `os::monitor::collect()` already owns "how do I ask this OS
//! for live utilization," so this module reads through it instead of
//! re-probing.

use crate::os::monitor::SystemHealthSnapshot;
use anyhow::Result;
use serde::{Deserialize, Serialize};

/// Utilization below this stays `Normal`.
const ELEVATED_THRESHOLD_PERCENT: f64 = 70.0;
/// Utilization at or above this is `Critical`.
const CRITICAL_THRESHOLD_PERCENT: f64 = 90.0;

/// Ordered by declaration (`Unknown` < `Normal` < `Elevated` < `Critical`)
/// so `PartialOrd`/`Ord` give the exact severity ranking `worst_of` and
/// `placement.rs`'s pressure-tolerance check both rely on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PressureLevel {
    /// No utilization reading was available — never conflated with
    /// `Normal`; a caller that needs to know current load cannot trust
    /// this dimension right now.
    Unknown,
    Normal,
    Elevated,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceleratorPressure {
    pub name: String,
    pub level: PressureLevel,
    pub utilization_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcePressure {
    pub schema_version: u32,
    pub captured_at: String,
    pub cpu: PressureLevel,
    pub cpu_utilization_percent: Option<f64>,
    pub memory: PressureLevel,
    pub memory_used_percent: Option<f64>,
    pub accelerators: Vec<AcceleratorPressure>,
    /// Worst level among dimensions that actually produced a reading.
    /// `Unknown` only when EVERY dimension is `Unknown` — one real
    /// `Critical` reading must never be masked by two `Unknown` ones.
    pub overall: PressureLevel,
}

fn classify(utilization_percent: Option<f64>) -> PressureLevel {
    match utilization_percent {
        None => PressureLevel::Unknown,
        Some(value) if value >= CRITICAL_THRESHOLD_PERCENT => PressureLevel::Critical,
        Some(value) if value >= ELEVATED_THRESHOLD_PERCENT => PressureLevel::Elevated,
        Some(_) => PressureLevel::Normal,
    }
}

fn worst_of(levels: impl Iterator<Item = PressureLevel>) -> PressureLevel {
    levels.max().unwrap_or(PressureLevel::Unknown)
}

/// Collects a fresh point-in-time snapshot and derives pressure from it.
/// `root` is only used to locate the project's disk-mount check inside
/// `monitor::collect` — pressure itself reports CPU/memory/accelerator.
pub fn collect(root: &std::path::Path) -> ResourcePressure {
    derive(&crate::os::monitor::collect(root))
}

fn derive(snapshot: &SystemHealthSnapshot) -> ResourcePressure {
    let cpu = classify(snapshot.cpu.utilization_percent);
    let memory_used_percent = snapshot
        .memory
        .total_bytes
        .zip(snapshot.memory.used_bytes)
        .filter(|(total, _)| *total > 0)
        .map(|(total, used)| (used as f64 / total as f64) * 100.0);
    let memory = classify(memory_used_percent);
    let accelerators: Vec<AcceleratorPressure> = snapshot
        .gpus
        .iter()
        .map(|gpu| AcceleratorPressure {
            name: gpu.name.clone(),
            level: classify(gpu.utilization_percent),
            utilization_percent: gpu.utilization_percent,
        })
        .collect();
    let overall = worst_of(
        [cpu, memory]
            .into_iter()
            .chain(accelerators.iter().map(|a| a.level)),
    );
    ResourcePressure {
        schema_version: 1,
        captured_at: snapshot.captured_at.clone(),
        cpu,
        cpu_utilization_percent: snapshot.cpu.utilization_percent,
        memory,
        memory_used_percent,
        accelerators,
        overall,
    }
}

pub fn print(pressure: &ResourcePressure, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(pressure)?);
        return Ok(());
    }
    println!("Resource pressure — {}", pressure.captured_at);
    println!(
        "  CPU           {:?} ({})",
        pressure.cpu,
        pressure
            .cpu_utilization_percent
            .map_or_else(|| "—".into(), |v| format!("{v:.1}%"))
    );
    println!(
        "  Memory        {:?} ({})",
        pressure.memory,
        pressure
            .memory_used_percent
            .map_or_else(|| "—".into(), |v| format!("{v:.1}%"))
    );
    for accelerator in &pressure.accelerators {
        println!(
            "  Accelerator   {} {:?} ({})",
            accelerator.name,
            accelerator.level,
            accelerator
                .utilization_percent
                .map_or_else(|| "—".into(), |v| format!("{v:.1}%"))
        );
    }
    println!("  Overall       {:?}", pressure.overall);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::monitor::{
        CpuSnapshot, DiskSnapshot, GpuSnapshot, MemorySnapshot, YanaSnapshot,
    };

    fn snapshot(
        cpu_percent: Option<f64>,
        mem_total: Option<u64>,
        mem_used: Option<u64>,
    ) -> SystemHealthSnapshot {
        SystemHealthSnapshot {
            schema_version: 1,
            captured_at: "2026-01-01T00:00:00Z".into(),
            platform: "macos".into(),
            hostname: None,
            cpu: CpuSnapshot {
                logical_cores: 10,
                utilization_percent: cpu_percent,
                load_average_1m: None,
                source: "test".into(),
            },
            memory: MemorySnapshot {
                total_bytes: mem_total,
                used_bytes: mem_used,
                source: "test".into(),
            },
            disk: DiskSnapshot {
                total_bytes: None,
                available_bytes: None,
                source: "test".into(),
            },
            gpus: Vec::new(),
            yana: YanaSnapshot {
                runtime_binary: "test".into(),
                protocol_marker: "test".into(),
                management_state: "test".into(),
                managed_agents: None,
                running_agents: None,
            },
            warnings: Vec::new(),
        }
    }

    #[test]
    fn classifies_the_three_deterministic_bands() {
        assert_eq!(classify(Some(10.0)), PressureLevel::Normal);
        assert_eq!(classify(Some(70.0)), PressureLevel::Elevated);
        assert_eq!(classify(Some(90.0)), PressureLevel::Critical);
        assert_eq!(classify(Some(99.9)), PressureLevel::Critical);
    }

    #[test]
    fn missing_utilization_stays_unknown_not_normal() {
        assert_eq!(classify(None), PressureLevel::Unknown);
        let pressure = derive(&snapshot(None, None, None));
        assert_eq!(pressure.cpu, PressureLevel::Unknown);
        assert_eq!(pressure.memory, PressureLevel::Unknown);
        assert_eq!(pressure.overall, PressureLevel::Unknown);
    }

    #[test]
    fn one_real_critical_reading_is_never_masked_by_unknown_dimensions() {
        let pressure = derive(&snapshot(Some(95.0), None, None));
        assert_eq!(pressure.cpu, PressureLevel::Critical);
        assert_eq!(pressure.memory, PressureLevel::Unknown);
        assert_eq!(pressure.overall, PressureLevel::Critical);
    }

    #[test]
    fn memory_percent_is_derived_from_used_over_total() {
        let pressure = derive(&snapshot(None, Some(1000), Some(950)));
        assert_eq!(pressure.memory, PressureLevel::Critical);
        assert!((pressure.memory_used_percent.unwrap() - 95.0).abs() < 0.01);
    }

    #[test]
    fn accelerator_pressure_contributes_to_overall() {
        let mut snap = snapshot(Some(10.0), Some(1000), Some(100));
        snap.gpus.push(GpuSnapshot {
            name: "Test GPU".into(),
            vendor: None,
            utilization_percent: Some(92.0),
            memory_total_bytes: None,
            memory_used_bytes: None,
            source: "test".into(),
            status: "ready".into(),
        });
        let pressure = derive(&snap);
        assert_eq!(pressure.accelerators[0].level, PressureLevel::Critical);
        assert_eq!(pressure.overall, PressureLevel::Critical);
    }
}
