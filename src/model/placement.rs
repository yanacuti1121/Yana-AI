//! Model placement (Phase 7 of the host-native-os program).
//!
//! Answers "given this workload's requirements and this candidate
//! model/provider, should it run here?" Structural gates (privacy,
//! offline, distinct-provider, cost) are checked first — each is a hard,
//! resource-independent yes/no. Once those pass, the model's derived
//! resource footprint (`model::requirements::derive`, Phase 6) is handed
//! straight to `os::resource::placement::place()` (Phase 5) — this module
//! does not reimplement CPU/memory/pressure/reservation reasoning, it
//! only translates a model-shaped question into the shape Phase 5's
//! primitives already answer.
//!
//! Deliberately does NOT ask an LLM which model to select — every
//! decision here is deterministic policy/runtime logic over data already
//! in hand.

use super::provider::{ModelInfo, ProviderId, RuntimeKind};
use super::requirements;
use crate::os::resource::placement::{self, PlacementVerdict as ResourceVerdict};
use crate::os::resource::pressure::{PressureLevel, ResourcePressure};
use crate::os::resource::reservation::Reservation;
use crate::os::resource::topology::ResourceTopology;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrivacyRequirement {
    /// No constraint — local or remote both acceptable.
    None,
    /// Local is preferred when available, but a remote candidate is not
    /// rejected outright — the caller's policy decides whether to retry
    /// with a local candidate or accept this one.
    PreferLocal,
    /// Local only. A remote candidate is a hard Reject, not a Defer —
    /// retrying does not change what the content requires.
    RequireLocal,
}

#[derive(Debug, Clone)]
pub struct WorkloadRequest {
    pub privacy: PrivacyRequirement,
    pub offline: bool,
    pub max_cost_usd: Option<f64>,
    /// Set when the caller needs a reviewer distinct from whoever
    /// executed the work (e.g. an independent code-review pass) — the
    /// candidate must not be this same provider.
    pub distinct_from: Option<ProviderId>,
}

pub struct ModelCandidate<'a> {
    pub provider_id: ProviderId,
    pub runtime_kind: RuntimeKind,
    pub model: &'a ModelInfo,
    /// `None` when cost is not estimable for this candidate (e.g. a local
    /// runtime with no per-token pricing) — absence of an estimate is not
    /// evidence the candidate is free, so `max_cost_usd` in
    /// `WorkloadRequest` is simply not enforced when this is `None`,
    /// never treated as "$0 estimated."
    pub estimated_cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelPlacementVerdict {
    Place,
    Defer,
    Reject,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelPlacementDecision {
    pub verdict: ModelPlacementVerdict,
    pub reasons: Vec<String>,
}

/// Local candidates whose host is at or above this pressure level are
/// deferred rather than placed — a policy default, not a hard-coded
/// physical limit; see `os::resource::placement`'s own `max_pressure`
/// field for the underlying mechanism.
const DEFAULT_MAX_PRESSURE: PressureLevel = PressureLevel::Elevated;

pub fn place_model(
    request: &WorkloadRequest,
    candidate: &ModelCandidate,
    topology: &ResourceTopology,
    pressure: &ResourcePressure,
    active_reservations: &[Reservation],
) -> ModelPlacementDecision {
    let mut reasons = Vec::new();

    for gate in [
        check_privacy,
        check_offline,
        check_distinct_provider,
        check_cost,
    ] {
        if let Some(verdict) = gate(request, candidate, &mut reasons) {
            return ModelPlacementDecision { verdict, reasons };
        }
    }

    if candidate.runtime_kind == RuntimeKind::Remote {
        reasons.push(
            "resource: remote candidate has no local footprint, resource checks skipped".into(),
        );
        return ModelPlacementDecision {
            verdict: ModelPlacementVerdict::Place,
            reasons,
        };
    }

    let model_requirements = requirements::derive(candidate.model, candidate.runtime_kind);
    let resource_requirements = placement::PlacementRequirements {
        cpu_cores: None,
        memory_bytes: model_requirements.approx_memory_bytes,
        requires_accelerator: model_requirements.requires_accelerator,
        // Deliberately NOT the model's size: that would demand the
        // accelerator itself report that many DEDICATED bytes, which a
        // unified-memory accelerator (Apple Silicon, and any host where
        // the accelerator legitimately borrows system RAM) structurally
        // never reports — it would reject every large model on exactly
        // the hosts best suited to run them. Overall memory sufficiency
        // is already covered by `memory_bytes` above, checked against
        // total system memory; this field only gates "must a dedicated
        // pool of at least N bytes exist," a stronger and usually wrong
        // claim for this program's actual accelerator inventory.
        accelerator_memory_bytes: None,
        requires_isolation: false,
        max_pressure: Some(DEFAULT_MAX_PRESSURE),
    };
    let resource_decision = placement::place(
        &resource_requirements,
        topology,
        pressure,
        active_reservations,
    );
    reasons.extend(
        resource_decision
            .reasons
            .into_iter()
            .map(|reason| format!("resource: {reason}")),
    );
    let verdict = match resource_decision.verdict {
        ResourceVerdict::Place => ModelPlacementVerdict::Place,
        ResourceVerdict::Defer => ModelPlacementVerdict::Defer,
        ResourceVerdict::Reject => ModelPlacementVerdict::Reject,
    };
    ModelPlacementDecision { verdict, reasons }
}

fn check_privacy(
    request: &WorkloadRequest,
    candidate: &ModelCandidate,
    reasons: &mut Vec<String>,
) -> Option<ModelPlacementVerdict> {
    match request.privacy {
        PrivacyRequirement::None => None,
        PrivacyRequirement::PreferLocal if candidate.runtime_kind == RuntimeKind::Remote => {
            reasons.push("privacy: local preferred but not required; candidate is remote".into());
            None
        }
        PrivacyRequirement::PreferLocal => {
            reasons.push("privacy: local preferred and satisfied".into());
            None
        }
        PrivacyRequirement::RequireLocal if candidate.runtime_kind == RuntimeKind::Remote => {
            reasons.push("privacy: local required, candidate is remote".into());
            Some(ModelPlacementVerdict::Reject)
        }
        PrivacyRequirement::RequireLocal => {
            reasons.push("privacy: local required and satisfied".into());
            None
        }
    }
}

fn check_offline(
    request: &WorkloadRequest,
    candidate: &ModelCandidate,
    reasons: &mut Vec<String>,
) -> Option<ModelPlacementVerdict> {
    if request.offline && candidate.runtime_kind == RuntimeKind::Remote {
        reasons.push("offline: requested, candidate is remote".into());
        return Some(ModelPlacementVerdict::Reject);
    }
    None
}

fn check_distinct_provider(
    request: &WorkloadRequest,
    candidate: &ModelCandidate,
    reasons: &mut Vec<String>,
) -> Option<ModelPlacementVerdict> {
    let executor = request.distinct_from.as_ref()?;
    if executor == &candidate.provider_id {
        reasons.push(format!(
            "distinct-provider: reviewer must differ from executor '{executor}', candidate is the same"
        ));
        return Some(ModelPlacementVerdict::Reject);
    }
    reasons.push(format!(
        "distinct-provider: candidate differs from executor '{executor}'"
    ));
    None
}

fn check_cost(
    request: &WorkloadRequest,
    candidate: &ModelCandidate,
    reasons: &mut Vec<String>,
) -> Option<ModelPlacementVerdict> {
    let max = request.max_cost_usd?;
    let Some(estimated) = candidate.estimated_cost_usd else {
        reasons.push("cost: no estimate available for this candidate, not enforced".into());
        return None;
    };
    if estimated > max {
        reasons.push(format!("cost: estimated ${estimated:.6} > max ${max:.6}"));
        return Some(ModelPlacementVerdict::Reject);
    }
    reasons.push(format!("cost: estimated ${estimated:.6} <= max ${max:.6}"));
    None
}

pub fn print(decision: &ModelPlacementDecision, json: bool) -> anyhow::Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(decision)?);
        return Ok(());
    }
    println!("Model placement verdict: {:?}", decision.verdict);
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

    fn local_candidate(size_bytes: Option<u64>) -> ModelInfo {
        ModelInfo {
            id: "small-local".into(),
            context_length: None,
            size_bytes,
            quantization: None,
        }
    }

    fn base_request() -> WorkloadRequest {
        WorkloadRequest {
            privacy: PrivacyRequirement::None,
            offline: false,
            max_cost_usd: None,
            distinct_from: None,
        }
    }

    #[test]
    fn require_local_rejects_a_remote_candidate() {
        let model = ModelInfo::named("claude");
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("anthropic"),
            runtime_kind: RuntimeKind::Remote,
            model: &model,
            estimated_cost_usd: None,
        };
        let request = WorkloadRequest {
            privacy: PrivacyRequirement::RequireLocal,
            ..base_request()
        };
        let decision = place_model(
            &request,
            &candidate,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Reject);
    }

    #[test]
    fn offline_rejects_a_remote_candidate() {
        let model = ModelInfo::named("claude");
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("anthropic"),
            runtime_kind: RuntimeKind::Remote,
            model: &model,
            estimated_cost_usd: None,
        };
        let request = WorkloadRequest {
            offline: true,
            ..base_request()
        };
        let decision = place_model(
            &request,
            &candidate,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Reject);
    }

    #[test]
    fn distinct_from_rejects_the_same_provider_as_executor() {
        let model = ModelInfo::named("claude");
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("anthropic"),
            runtime_kind: RuntimeKind::Remote,
            model: &model,
            estimated_cost_usd: None,
        };
        let request = WorkloadRequest {
            distinct_from: Some(ProviderId::from("anthropic")),
            ..base_request()
        };
        let decision = place_model(
            &request,
            &candidate,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Reject);
    }

    #[test]
    fn distinct_from_allows_a_different_provider() {
        let model = ModelInfo::named("gpt");
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("openai"),
            runtime_kind: RuntimeKind::Remote,
            model: &model,
            estimated_cost_usd: None,
        };
        let request = WorkloadRequest {
            distinct_from: Some(ProviderId::from("anthropic")),
            ..base_request()
        };
        let decision = place_model(
            &request,
            &candidate,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Place);
    }

    #[test]
    fn cost_over_budget_rejects() {
        let model = ModelInfo::named("claude-opus");
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("anthropic"),
            runtime_kind: RuntimeKind::Remote,
            model: &model,
            estimated_cost_usd: Some(5.0),
        };
        let request = WorkloadRequest {
            max_cost_usd: Some(1.0),
            ..base_request()
        };
        let decision = place_model(
            &request,
            &candidate,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Reject);
    }

    #[test]
    fn missing_cost_estimate_is_not_enforced_as_free() {
        let model = ModelInfo::named("mystery");
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("anthropic"),
            runtime_kind: RuntimeKind::Remote,
            model: &model,
            estimated_cost_usd: None,
        };
        let request = WorkloadRequest {
            max_cost_usd: Some(1.0),
            ..base_request()
        };
        let decision = place_model(
            &request,
            &candidate,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Place);
    }

    #[test]
    fn remote_candidate_skips_resource_checks_entirely() {
        let model = ModelInfo::named("claude");
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("anthropic"),
            runtime_kind: RuntimeKind::Remote,
            model: &model,
            estimated_cost_usd: None,
        };
        // Critical pressure would defer a LOCAL candidate but must not
        // affect a remote one at all.
        let decision = place_model(
            &base_request(),
            &candidate,
            &topology(),
            &pressure(PressureLevel::Critical),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Place);
    }

    #[test]
    fn critical_pressure_defers_a_large_local_model() {
        let model = local_candidate(Some(8 * 1024 * 1024 * 1024));
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("ollama"),
            runtime_kind: RuntimeKind::Local,
            model: &model,
            estimated_cost_usd: None,
        };
        let decision = place_model(
            &base_request(),
            &candidate,
            &topology(),
            &pressure(PressureLevel::Critical),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Defer);
    }

    #[test]
    fn small_local_model_places_under_normal_pressure() {
        let model = local_candidate(Some(1024 * 1024 * 1024));
        let candidate = ModelCandidate {
            provider_id: ProviderId::from("ollama"),
            runtime_kind: RuntimeKind::Local,
            model: &model,
            estimated_cost_usd: None,
        };
        let decision = place_model(
            &base_request(),
            &candidate,
            &topology(),
            &pressure(PressureLevel::Normal),
            &[],
        );
        assert_eq!(decision.verdict, ModelPlacementVerdict::Place);
    }
}
