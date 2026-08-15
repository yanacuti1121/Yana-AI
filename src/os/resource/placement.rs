//! Generic compute placement primitives.
//!
//! This module answers one narrow question: "given what this host has
//! (`topology`), what it's doing right now (`pressure`), and what's
//! already promised (`reservation`s), can a workload with these
//! `PlacementRequirements` run here?" It does NOT choose an LLM, a
//! provider, or a runtime — that is model placement, a later phase of
//! this program, layered on top of these primitives once it exists.
//! Everything here is provider/model agnostic on purpose.

use super::pressure::{PressureLevel, ResourcePressure};
use super::reservation::Reservation;
use super::topology::ResourceTopology;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlacementRequirements {
    pub cpu_cores: Option<usize>,
    pub memory_bytes: Option<u64>,
    pub requires_accelerator: bool,
    pub accelerator_memory_bytes: Option<u64>,
    pub requires_isolation: bool,
    /// The caller's tolerance for current host load. `None` means the
    /// caller does not care about pressure at all.
    pub max_pressure: Option<PressureLevel>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementVerdict {
    /// All checked requirements are satisfied by present evidence.
    Place,
    /// A transient condition (pressure, momentary capacity) blocks
    /// placement now but might not later — worth retrying.
    Defer,
    /// A structural requirement cannot be met by this host at all —
    /// retrying will not help.
    Reject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementDecision {
    pub verdict: PlacementVerdict,
    /// Every check performed, in order, whether it passed or failed —
    /// this is the "explainable" half of "deterministic explainable
    /// placement decision."
    pub reasons: Vec<String>,
}

pub fn place(
    requirements: &PlacementRequirements,
    topology: &ResourceTopology,
    pressure: &ResourcePressure,
    active_reservations: &[Reservation],
) -> PlacementDecision {
    let mut reasons = Vec::new();
    let mut verdict = PlacementVerdict::Place;

    check_isolation(requirements, topology, &mut reasons, &mut verdict);
    check_accelerator(requirements, topology, &mut reasons, &mut verdict);
    check_cpu(
        requirements,
        topology,
        active_reservations,
        &mut reasons,
        &mut verdict,
    );
    check_memory(
        requirements,
        topology,
        active_reservations,
        &mut reasons,
        &mut verdict,
    );
    check_pressure(requirements, pressure, &mut reasons, &mut verdict);

    PlacementDecision { verdict, reasons }
}

fn escalate(current: &mut PlacementVerdict, to: PlacementVerdict) {
    // Reject always wins; Defer only overrides Place; Place never
    // downgrades an existing Defer/Reject.
    let rank = |v: PlacementVerdict| match v {
        PlacementVerdict::Place => 0,
        PlacementVerdict::Defer => 1,
        PlacementVerdict::Reject => 2,
    };
    if rank(to) > rank(*current) {
        *current = to;
    }
}

fn check_isolation(
    requirements: &PlacementRequirements,
    topology: &ResourceTopology,
    reasons: &mut Vec<String>,
    verdict: &mut PlacementVerdict,
) {
    if !requirements.requires_isolation {
        return;
    }
    if topology.process_containment.is_supported() {
        reasons.push("isolation: required and supported on this host".into());
    } else {
        reasons.push(format!(
            "isolation: required but process containment is {:?} on this host",
            topology.process_containment
        ));
        escalate(verdict, PlacementVerdict::Reject);
    }
}

fn check_accelerator(
    requirements: &PlacementRequirements,
    topology: &ResourceTopology,
    reasons: &mut Vec<String>,
    verdict: &mut PlacementVerdict,
) {
    if !requirements.requires_accelerator {
        return;
    }
    if topology.accelerators.is_empty() {
        reasons.push("accelerator: required but none present on this host".into());
        escalate(verdict, PlacementVerdict::Reject);
        return;
    }
    let Some(required_memory) = requirements.accelerator_memory_bytes else {
        reasons.push("accelerator: required, present, no memory floor requested".into());
        return;
    };
    let candidate = topology
        .accelerators
        .iter()
        .find(|accelerator| accelerator.dedicated_memory_bytes.unwrap_or(0) >= required_memory);
    match candidate {
        Some(accelerator) => reasons.push(format!(
            "accelerator: '{}' meets required {required_memory} byte floor",
            accelerator.name
        )),
        None => {
            reasons.push(format!(
                "accelerator: no present accelerator meets required {required_memory} byte floor"
            ));
            escalate(verdict, PlacementVerdict::Reject);
        }
    }
}

fn check_cpu(
    requirements: &PlacementRequirements,
    topology: &ResourceTopology,
    active_reservations: &[Reservation],
    reasons: &mut Vec<String>,
    verdict: &mut PlacementVerdict,
) {
    let Some(requested) = requirements.cpu_cores else {
        return;
    };
    let reserved: usize = active_reservations.iter().filter_map(|r| r.cpu_cores).sum();
    let available = topology.cpu_logical_cores.saturating_sub(reserved);
    if requested <= available {
        reasons.push(format!(
            "cpu: {requested} requested <= {available} available"
        ));
    } else {
        reasons.push(format!(
            "cpu: {requested} requested > {available} available ({reserved} already reserved of {})",
            topology.cpu_logical_cores
        ));
        escalate(verdict, PlacementVerdict::Reject);
    }
}

fn check_memory(
    requirements: &PlacementRequirements,
    topology: &ResourceTopology,
    active_reservations: &[Reservation],
    reasons: &mut Vec<String>,
    verdict: &mut PlacementVerdict,
) {
    let Some(requested) = requirements.memory_bytes else {
        return;
    };
    let Some(total) = topology.memory_total_bytes else {
        // Unknown ceiling is not evidence of a conflict — see
        // reservation.rs's identical reasoning. Noted, not blocking.
        reasons.push("memory: capacity unknown on this host, requirement not enforced".into());
        return;
    };
    let reserved: u64 = active_reservations
        .iter()
        .filter_map(|r| r.memory_bytes)
        .sum();
    let available = total.saturating_sub(reserved);
    if requested <= available {
        reasons.push(format!(
            "memory: {requested} bytes requested <= {available} bytes available"
        ));
    } else {
        reasons.push(format!(
            "memory: {requested} bytes requested > {available} bytes available"
        ));
        escalate(verdict, PlacementVerdict::Reject);
    }
}

fn check_pressure(
    requirements: &PlacementRequirements,
    pressure: &ResourcePressure,
    reasons: &mut Vec<String>,
    verdict: &mut PlacementVerdict,
) {
    let Some(tolerance) = requirements.max_pressure else {
        return;
    };
    if pressure.overall == PressureLevel::Unknown {
        // Cannot prove pressure is within tolerance, but absence of a
        // reading is not evidence of exceeding it either — Defer, not
        // Reject: this may resolve as soon as telemetry becomes available.
        reasons.push("pressure: unknown, cannot verify tolerance".into());
        escalate(verdict, PlacementVerdict::Defer);
        return;
    }
    if pressure.overall <= tolerance {
        reasons.push(format!(
            "pressure: {:?} within tolerance {:?}",
            pressure.overall, tolerance
        ));
    } else {
        reasons.push(format!(
            "pressure: {:?} exceeds tolerance {:?}",
            pressure.overall, tolerance
        ));
        escalate(verdict, PlacementVerdict::Defer);
    }
}

pub fn print(decision: &PlacementDecision, json: bool) -> anyhow::Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(decision)?);
        return Ok(());
    }
    println!("Placement verdict: {:?}", decision.verdict);
    for reason in &decision.reasons {
        println!("  - {reason}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::platform::capabilities::Support;
    use crate::os::platform::profile::{AcceleratorKind, MemoryModelKind};
    use crate::os::resource::topology::AcceleratorTopology;

    fn topology() -> ResourceTopology {
        ResourceTopology {
            schema_version: 1,
            os: "macos".into(),
            arch: "aarch64".into(),
            cpu_logical_cores: 10,
            cpu_physical_cores: Some(10),
            memory_total_bytes: Some(16 * 1024u64.pow(3)),
            memory_model: MemoryModelKind::Unified,
            accelerators: vec![AcceleratorTopology {
                name: "Apple M4".into(),
                kind: AcceleratorKind::Gpu,
                memory_model: MemoryModelKind::Unified,
                dedicated_memory_bytes: None,
                telemetry_available: false,
            }],
            process_containment: Support::Supported,
            accelerator_telemetry: Support::Unknown,
        }
    }

    fn pressure(overall: PressureLevel) -> ResourcePressure {
        ResourcePressure {
            schema_version: 1,
            captured_at: "2026-01-01T00:00:00Z".into(),
            cpu: overall,
            cpu_utilization_percent: None,
            memory: overall,
            memory_used_percent: None,
            accelerators: Vec::new(),
            overall,
        }
    }

    #[test]
    fn plain_requirements_with_available_capacity_places() {
        let requirements = PlacementRequirements {
            cpu_cores: Some(4),
            ..Default::default()
        };
        let decision = place(
            &requirements,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, PlacementVerdict::Place);
    }

    #[test]
    fn insufficient_cpu_rejects_not_defers() {
        let requirements = PlacementRequirements {
            cpu_cores: Some(20),
            ..Default::default()
        };
        let decision = place(
            &requirements,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, PlacementVerdict::Reject);
    }

    #[test]
    fn requiring_isolation_on_an_unsupporting_host_rejects() {
        let mut host = topology();
        host.process_containment = Support::Unsupported;
        let requirements = PlacementRequirements {
            requires_isolation: true,
            ..Default::default()
        };
        let decision = place(&requirements, &host, &pressure(PressureLevel::Normal), &[]);
        assert_eq!(decision.verdict, PlacementVerdict::Reject);
    }

    #[test]
    fn excess_pressure_defers_not_rejects() {
        let requirements = PlacementRequirements {
            max_pressure: Some(PressureLevel::Normal),
            ..Default::default()
        };
        let decision = place(
            &requirements,
            &topology(),
            &pressure(PressureLevel::Critical),
            &[],
        );
        assert_eq!(decision.verdict, PlacementVerdict::Defer);
    }

    #[test]
    fn unknown_pressure_defers_rather_than_silently_placing_or_rejecting() {
        let requirements = PlacementRequirements {
            max_pressure: Some(PressureLevel::Normal),
            ..Default::default()
        };
        let decision = place(
            &requirements,
            &topology(),
            &pressure(PressureLevel::Unknown),
            &[],
        );
        assert_eq!(decision.verdict, PlacementVerdict::Defer);
    }

    #[test]
    fn reject_outranks_defer_when_both_apply() {
        let requirements = PlacementRequirements {
            cpu_cores: Some(20),
            max_pressure: Some(PressureLevel::Normal),
            ..Default::default()
        };
        let decision = place(
            &requirements,
            &topology(),
            &pressure(PressureLevel::Critical),
            &[],
        );
        assert_eq!(decision.verdict, PlacementVerdict::Reject);
    }

    #[test]
    fn accelerator_memory_floor_checks_dedicated_bytes() {
        let mut host = topology();
        host.accelerators[0].dedicated_memory_bytes = Some(8 * 1024u64.pow(3));
        let requirements = PlacementRequirements {
            requires_accelerator: true,
            accelerator_memory_bytes: Some(16 * 1024u64.pow(3)),
            ..Default::default()
        };
        let decision = place(&requirements, &host, &pressure(PressureLevel::Normal), &[]);
        assert_eq!(decision.verdict, PlacementVerdict::Reject);
    }

    #[test]
    fn active_reservations_reduce_available_cpu() {
        let reservation = Reservation {
            id: "r1".into(),
            actor: "agent-1".into(),
            cpu_cores: Some(8),
            memory_bytes: None,
            accelerator_name: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            expires_at: None,
            reason: "test".into(),
        };
        let requirements = PlacementRequirements {
            cpu_cores: Some(4),
            ..Default::default()
        };
        let decision = place(
            &requirements,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[reservation],
        );
        assert_eq!(decision.verdict, PlacementVerdict::Reject);
    }
}
