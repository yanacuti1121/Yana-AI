//! Provider catalog and selection (Phase 6 of the host-native-os
//! program) — moved from `chat::mod.rs`, where `provider_catalog()`/
//! `try_select_provider()`/`ProviderSummary` used to live.
//!
//! This is the fix for a real, pre-existing architectural inversion: two
//! `os::` modules (`os::credential`, `os::agent`) already called
//! `crate::chat::provider_catalog()`/`crate::chat::try_select_provider()`
//! from OUTSIDE `chat::` — meaning the system/runtime layer depended on
//! the chat UI layer just to learn which providers exist. `model::` is a
//! peer of both `os::` and `chat::`, so provider enumeration/selection now
//! lives at the layer that actually owns it. `chat::mod.rs` re-exports
//! these three items unchanged so its own internal callers
//! (`chat/tui/tabs.rs`, `chat/tui/model_command.rs`) need no edits.
//!
//! Deliberately does NOT move `chat::anthropic`/`chat::openai_compat`
//! (the actual HTTP wire-format implementations) — those stay put per the
//! phase brief's "do NOT rewrite provider implementations unnecessarily."
//! This module was bumped from `mod` to `pub(crate) mod` in `chat/mod.rs`
//! specifically so this file (a sibling of `chat` under the crate root)
//! can still construct them.

use crate::chat::{anthropic::AnthropicProvider, openai_compat};
use crate::model::provider::ChatProvider;
use std::sync::Arc;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub(crate) struct ProviderSummary {
    pub name: String,
    pub runtime: String,
    pub requires_key: bool,
    pub env_var: Option<String>,
}

/// Canonical provider catalog shared by chat and management surfaces.
/// Constructing providers is side-effect free; this never probes a server
/// or reads a credential value.
pub(crate) fn provider_catalog() -> Vec<ProviderSummary> {
    [
        "anthropic",
        "openai",
        "kimi",
        "ollama",
        "lmstudio",
        "llamacpp",
        "turbofieldfare",
    ]
    .into_iter()
    .map(|name| {
        let provider = try_select_provider(name).expect("catalog provider must be selectable");
        ProviderSummary {
            name: provider.name().to_string(),
            runtime: provider.runtime_kind().label().to_string(),
            requires_key: provider.requires_key(),
            env_var: provider
                .requires_key()
                .then(|| provider.env_var().to_string()),
        }
    })
    .collect()
}

/// Non-exiting core: used both by startup (which wraps it with
/// exit-on-error, safe since it always runs before any `TerminalGuard`
/// exists) and by the in-session `/model` command (`chat/tui.rs`), which
/// must NEVER call `std::process::exit()` — that would skip the render
/// loop's Drop-based terminal cleanup on the way out.
pub(crate) fn try_select_provider(name: &str) -> Result<Arc<dyn ChatProvider>, String> {
    match name {
        "anthropic" => Ok(Arc::new(AnthropicProvider)),
        "openai" => Ok(Arc::new(openai_compat::openai())),
        "ollama" => Ok(Arc::new(openai_compat::ollama())),
        "lmstudio" => Ok(Arc::new(openai_compat::lm_studio())),
        "llamacpp" => Ok(Arc::new(openai_compat::llama_cpp())),
        "kimi" => Ok(Arc::new(openai_compat::kimi())),
        "turbofieldfare" => Ok(Arc::new(openai_compat::turbofieldfare())),
        other => Err(format!(
            "unknown provider '{other}' — use ollama | lmstudio | llamacpp | turbofieldfare | anthropic | openai | kimi"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_matches_every_selectable_provider() {
        let names: Vec<String> = provider_catalog()
            .into_iter()
            .map(|item| item.name)
            .collect();
        assert_eq!(
            names,
            [
                "anthropic",
                "openai",
                "kimi",
                "ollama",
                "lmstudio",
                "llamacpp",
                "turbofieldfare"
            ]
        );
    }

    #[test]
    fn unknown_provider_name_is_a_named_error_not_a_panic() {
        assert!(try_select_provider("nonexistent").is_err());
    }
}
