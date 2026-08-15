//! Model resource requirements (Phase 6 of the host-native-os program).
//!
//! Derives a rough resource footprint from data providers already report
//! (`ModelInfo::size_bytes`) — never invents new provider-reported data,
//! never probes anything. This is the bridge Phase 7 (Model Placement)
//! needs: its `src/model/placement.rs` maps this struct's fields onto
//! `os::resource::placement::PlacementRequirements` (Phase 5) to decide
//! whether a given host can run a given model.

use super::provider::{ModelInfo, RuntimeKind};

/// A local model whose reported size is at or above this is assumed to
/// benefit from accelerator (GPU/NPU) placement — a coarse, documented
/// heuristic, not a measurement. Below this, CPU inference is assumed
/// viable. `None` (size unreported) never defaults to `true`: an unknown
/// size is not evidence a model is large.
const ACCELERATOR_RECOMMENDED_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ModelRequirements {
    /// Rough local memory footprint. `None` for remote models (no local
    /// footprint at all) or when a local provider did not report a size —
    /// never a guessed number.
    pub approx_memory_bytes: Option<u64>,
    pub requires_accelerator: bool,
}

pub fn derive(model: &ModelInfo, runtime_kind: RuntimeKind) -> ModelRequirements {
    match runtime_kind {
        RuntimeKind::Remote => ModelRequirements {
            approx_memory_bytes: None,
            requires_accelerator: false,
        },
        RuntimeKind::Local => {
            let approx_memory_bytes = model.size_bytes;
            let requires_accelerator = approx_memory_bytes
                .map(|bytes| bytes >= ACCELERATOR_RECOMMENDED_BYTES)
                .unwrap_or(false);
            ModelRequirements {
                approx_memory_bytes,
                requires_accelerator,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_models_have_no_local_footprint() {
        let model = ModelInfo {
            id: "claude".into(),
            context_length: None,
            size_bytes: Some(999),
            quantization: None,
        };
        let requirements = derive(&model, RuntimeKind::Remote);
        assert_eq!(requirements.approx_memory_bytes, None);
        assert!(!requirements.requires_accelerator);
    }

    #[test]
    fn large_local_model_recommends_an_accelerator() {
        let model = ModelInfo {
            id: "big-local-model".into(),
            context_length: None,
            size_bytes: Some(8 * 1024 * 1024 * 1024),
            quantization: None,
        };
        let requirements = derive(&model, RuntimeKind::Local);
        assert_eq!(
            requirements.approx_memory_bytes,
            Some(8 * 1024 * 1024 * 1024)
        );
        assert!(requirements.requires_accelerator);
    }

    #[test]
    fn small_local_model_does_not_require_an_accelerator() {
        let model = ModelInfo {
            id: "small-local-model".into(),
            context_length: None,
            size_bytes: Some(1024 * 1024 * 1024),
            quantization: None,
        };
        let requirements = derive(&model, RuntimeKind::Local);
        assert!(!requirements.requires_accelerator);
    }

    #[test]
    fn unknown_local_size_never_guesses_accelerator_need() {
        let model = ModelInfo::named("mystery-model");
        let requirements = derive(&model, RuntimeKind::Local);
        assert_eq!(requirements.approx_memory_bytes, None);
        assert!(!requirements.requires_accelerator);
    }
}
