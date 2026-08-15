//! Model/runtime lifecycle and health aggregation (Phase 6 of the
//! host-native-os program).
//!
//! Adds exactly one thing `provider.rs`/`catalog.rs` don't already give:
//! which SPECIFIC local runtime engine a provider talks to (Ollama vs LM
//! Studio vs llama.cpp vs TurboFieldfare) — `RuntimeKind::Local` alone
//! doesn't distinguish them, and Phase 15 (Unified OS Status) needs that
//! distinction for its "model runtimes" section. Everything else here
//! (`ProviderHealth`, `runtime_kind()`) is read from the existing
//! `ChatProvider` trait, not reimplemented.

use super::provider::{ChatProvider, ProviderHealth, ProviderId, RuntimeKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalRuntimeKind {
    Ollama,
    LmStudio,
    LlamaCpp,
    TurboFieldfare,
}

/// `None` for any remote provider name, or an unrecognized one — never a
/// guessed local engine.
pub fn local_runtime_kind(provider_name: &str) -> Option<LocalRuntimeKind> {
    match provider_name {
        "ollama" => Some(LocalRuntimeKind::Ollama),
        "lmstudio" => Some(LocalRuntimeKind::LmStudio),
        "llamacpp" => Some(LocalRuntimeKind::LlamaCpp),
        "turbofieldfare" => Some(LocalRuntimeKind::TurboFieldfare),
        _ => None,
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RuntimeStatus {
    pub provider_id: ProviderId,
    pub runtime_kind: RuntimeKind,
    pub local_runtime: Option<LocalRuntimeKind>,
    pub health: ProviderHealthReport,
}

/// `ProviderHealth` mirrored into a serializable shape — the original
/// enum has no `Serialize` impl (it lives in `model::provider` and is
/// also used internally where serialization isn't needed), so this is a
/// deliberate, narrow display-only projection rather than adding a derive
/// to a type this module doesn't own.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case", tag = "state", content = "detail")]
pub enum ProviderHealthReport {
    Checking,
    Ready,
    Unavailable(String),
}

impl From<ProviderHealth> for ProviderHealthReport {
    fn from(value: ProviderHealth) -> Self {
        match value {
            ProviderHealth::Checking => Self::Checking,
            ProviderHealth::Ready => Self::Ready,
            ProviderHealth::Unavailable(detail) => Self::Unavailable(detail),
        }
    }
}

pub fn probe(provider: &dyn ChatProvider, api_key: Option<&str>) -> RuntimeStatus {
    RuntimeStatus {
        provider_id: ProviderId::from(provider.name()),
        runtime_kind: provider.runtime_kind(),
        local_runtime: local_runtime_kind(provider.name()),
        health: provider.health(api_key).into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeProvider {
        name: &'static str,
        runtime_kind: RuntimeKind,
        healthy: bool,
    }

    impl ChatProvider for FakeProvider {
        fn name(&self) -> &str {
            self.name
        }
        fn default_model(&self) -> &str {
            "fake-model"
        }
        fn requires_key(&self) -> bool {
            false
        }
        fn env_var(&self) -> &str {
            ""
        }
        fn runtime_kind(&self) -> RuntimeKind {
            self.runtime_kind
        }
        fn list_models(
            &self,
            _api_key: Option<&str>,
        ) -> anyhow::Result<Vec<super::super::provider::ModelInfo>> {
            if self.healthy {
                Ok(vec![super::super::provider::ModelInfo::named(
                    self.default_model(),
                )])
            } else {
                anyhow::bail!("fake backend down")
            }
        }
        fn stream_chat(
            &self,
            _api_key: Option<&str>,
            _model: &str,
            _system: Option<&str>,
            _messages: &[super::super::provider::ChatMessage],
            _tools: &[crate::chat::tool_types::ToolSpec],
            _on_chunk: &mut dyn FnMut(&str) -> anyhow::Result<()>,
        ) -> anyhow::Result<(
            super::super::provider::ChatUsage,
            crate::chat::tool_types::StreamOutcome,
        )> {
            anyhow::bail!("not exercised in this test")
        }
    }

    #[test]
    fn recognizes_every_local_runtime_by_provider_name() {
        assert_eq!(local_runtime_kind("ollama"), Some(LocalRuntimeKind::Ollama));
        assert_eq!(
            local_runtime_kind("lmstudio"),
            Some(LocalRuntimeKind::LmStudio)
        );
        assert_eq!(
            local_runtime_kind("llamacpp"),
            Some(LocalRuntimeKind::LlamaCpp)
        );
        assert_eq!(
            local_runtime_kind("turbofieldfare"),
            Some(LocalRuntimeKind::TurboFieldfare)
        );
    }

    #[test]
    fn remote_and_unrecognized_names_have_no_local_runtime() {
        assert_eq!(local_runtime_kind("anthropic"), None);
        assert_eq!(local_runtime_kind("nonexistent"), None);
    }

    #[test]
    fn probe_aggregates_identity_kind_and_health() {
        let provider = FakeProvider {
            name: "ollama",
            runtime_kind: RuntimeKind::Local,
            healthy: true,
        };
        let status = probe(&provider, None);
        assert_eq!(status.provider_id, ProviderId::from("ollama"));
        assert_eq!(status.runtime_kind, RuntimeKind::Local);
        assert_eq!(status.local_runtime, Some(LocalRuntimeKind::Ollama));
        assert!(matches!(status.health, ProviderHealthReport::Ready));
    }

    #[test]
    fn probe_reports_unavailable_detail_on_a_down_backend() {
        let provider = FakeProvider {
            name: "llamacpp",
            runtime_kind: RuntimeKind::Local,
            healthy: false,
        };
        let status = probe(&provider, None);
        match status.health {
            ProviderHealthReport::Unavailable(detail) => {
                assert!(detail.contains("fake backend down"))
            }
            other => panic!("expected Unavailable, got {other:?}"),
        }
    }
}
