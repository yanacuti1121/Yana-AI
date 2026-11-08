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

use crate::chat::{anthropic::AnthropicProvider, gemini::GeminiProvider, openai_compat};
use crate::model::provider::ChatProvider;
use std::sync::Arc;

type ProviderFactory = fn() -> Arc<dyn ChatProvider>;

struct ProviderRegistration {
    name: &'static str,
    aliases: &'static [&'static str],
    factory: ProviderFactory,
}

fn anthropic() -> Arc<dyn ChatProvider> {
    Arc::new(AnthropicProvider)
}

fn openai() -> Arc<dyn ChatProvider> {
    Arc::new(openai_compat::openai())
}

fn gemini() -> Arc<dyn ChatProvider> {
    Arc::new(GeminiProvider)
}

macro_rules! openai_compat_factory {
    ($name:ident) => {
        fn $name() -> Arc<dyn ChatProvider> {
            Arc::new(openai_compat::$name())
        }
    };
}

openai_compat_factory!(groq);
openai_compat_factory!(deepseek);
openai_compat_factory!(openrouter);
openai_compat_factory!(xai);
openai_compat_factory!(novita);
openai_compat_factory!(nvidia);
openai_compat_factory!(minimax);
openai_compat_factory!(glm);
openai_compat_factory!(huggingface);
openai_compat_factory!(nine_router);
openai_compat_factory!(mistral);
openai_compat_factory!(together);
openai_compat_factory!(fireworks);
openai_compat_factory!(deepinfra);
openai_compat_factory!(cerebras);
openai_compat_factory!(sambanova);
openai_compat_factory!(perplexity);
openai_compat_factory!(qwen);
openai_compat_factory!(cohere);
openai_compat_factory!(ai21);
openai_compat_factory!(ernie);
openai_compat_factory!(vllm);
openai_compat_factory!(jan);

fn kimi() -> Arc<dyn ChatProvider> {
    Arc::new(openai_compat::kimi())
}

fn ollama() -> Arc<dyn ChatProvider> {
    Arc::new(openai_compat::ollama())
}

fn lmstudio() -> Arc<dyn ChatProvider> {
    Arc::new(openai_compat::lm_studio())
}

fn llamacpp() -> Arc<dyn ChatProvider> {
    Arc::new(openai_compat::llama_cpp())
}

fn turbofieldfare() -> Arc<dyn ChatProvider> {
    Arc::new(openai_compat::turbofieldfare())
}

fn airllm() -> Arc<dyn ChatProvider> {
    Arc::new(openai_compat::airllm())
}

const PROVIDERS: &[ProviderRegistration] = &[
    ProviderRegistration {
        name: "anthropic",
        aliases: &["claude"],
        factory: anthropic,
    },
    ProviderRegistration {
        name: "openai",
        aliases: &[],
        factory: openai,
    },
    ProviderRegistration {
        name: "gemini",
        aliases: &["google"],
        factory: gemini,
    },
    ProviderRegistration {
        name: "groq",
        aliases: &[],
        factory: groq,
    },
    ProviderRegistration {
        name: "deepseek",
        aliases: &[],
        factory: deepseek,
    },
    ProviderRegistration {
        name: "openrouter",
        aliases: &[],
        factory: openrouter,
    },
    ProviderRegistration {
        name: "xai",
        aliases: &["grok"],
        factory: xai,
    },
    ProviderRegistration {
        name: "novita",
        aliases: &[],
        factory: novita,
    },
    ProviderRegistration {
        name: "nvidia",
        aliases: &[],
        factory: nvidia,
    },
    ProviderRegistration {
        name: "minimax",
        aliases: &[],
        factory: minimax,
    },
    ProviderRegistration {
        name: "glm",
        aliases: &["zhipu"],
        factory: glm,
    },
    ProviderRegistration {
        name: "huggingface",
        aliases: &["hf"],
        factory: huggingface,
    },
    ProviderRegistration {
        name: "9router",
        aliases: &["nine-router"],
        factory: nine_router,
    },
    ProviderRegistration {
        name: "kimi",
        aliases: &["moonshot"],
        factory: kimi,
    },
    ProviderRegistration {
        name: "mistral",
        aliases: &[],
        factory: mistral,
    },
    ProviderRegistration {
        name: "together",
        aliases: &["togetherai"],
        factory: together,
    },
    ProviderRegistration {
        name: "fireworks",
        aliases: &[],
        factory: fireworks,
    },
    ProviderRegistration {
        name: "deepinfra",
        aliases: &[],
        factory: deepinfra,
    },
    ProviderRegistration {
        name: "cerebras",
        aliases: &[],
        factory: cerebras,
    },
    ProviderRegistration {
        name: "sambanova",
        aliases: &[],
        factory: sambanova,
    },
    ProviderRegistration {
        name: "perplexity",
        aliases: &[],
        factory: perplexity,
    },
    ProviderRegistration {
        name: "qwen",
        aliases: &["dashscope"],
        factory: qwen,
    },
    ProviderRegistration {
        name: "cohere",
        aliases: &[],
        factory: cohere,
    },
    ProviderRegistration {
        name: "ai21",
        aliases: &[],
        factory: ai21,
    },
    ProviderRegistration {
        name: "ernie",
        aliases: &["qianfan"],
        factory: ernie,
    },
    ProviderRegistration {
        name: "ollama",
        aliases: &[],
        factory: ollama,
    },
    ProviderRegistration {
        name: "lmstudio",
        aliases: &["lm-studio"],
        factory: lmstudio,
    },
    ProviderRegistration {
        name: "llamacpp",
        aliases: &["llama.cpp", "llama-cpp"],
        factory: llamacpp,
    },
    ProviderRegistration {
        name: "turbofieldfare",
        aliases: &[],
        factory: turbofieldfare,
    },
    ProviderRegistration {
        name: "airllm",
        aliases: &[],
        factory: airllm,
    },
    ProviderRegistration {
        name: "vllm",
        aliases: &[],
        factory: vllm,
    },
    ProviderRegistration {
        name: "jan",
        aliases: &[],
        factory: jan,
    },
];

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
    PROVIDERS
        .iter()
        .map(|registration| {
            let provider = (registration.factory)();
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
    let normalized = name.trim().to_ascii_lowercase();
    PROVIDERS
        .iter()
        .find(|registration| {
            registration.name == normalized
                || registration
                    .aliases
                    .iter()
                    .any(|alias| *alias == normalized)
        })
        .map(|registration| (registration.factory)())
        .ok_or_else(|| {
            let known = PROVIDERS
                .iter()
                .map(|registration| registration.name)
                .collect::<Vec<_>>()
                .join(" | ");
            format!("unknown provider '{name}' — use {known}")
        })
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
                "gemini",
                "groq",
                "deepseek",
                "openrouter",
                "xai",
                "novita",
                "nvidia",
                "minimax",
                "glm",
                "huggingface",
                "9router",
                "kimi",
                "mistral",
                "together",
                "fireworks",
                "deepinfra",
                "cerebras",
                "sambanova",
                "perplexity",
                "qwen",
                "cohere",
                "ai21",
                "ernie",
                "ollama",
                "lmstudio",
                "llamacpp",
                "turbofieldfare",
                "airllm",
                "vllm",
                "jan"
            ]
        );
    }

    #[test]
    fn studio_openai_compatible_providers_are_selectable() {
        // These were listed in Yana Studio's catalog but rejected as "unknown provider" before.
        for name in [
            "mistral", "together", "fireworks", "deepinfra", "cerebras", "sambanova", "perplexity", "qwen",
            "cohere", "ai21", "ernie", "vllm", "jan",
        ] {
            let provider = try_select_provider(name).unwrap_or_else(|error| panic!("{name}: {error}"));
            assert_eq!(provider.name(), name);
        }
        assert_eq!(try_select_provider("dashscope").unwrap().name(), "qwen");
        assert_eq!(try_select_provider("qianfan").unwrap().name(), "ernie");
    }

    #[test]
    fn new_cloud_providers_need_a_key_and_local_ones_do_not() {
        for name in [
            "mistral", "together", "fireworks", "deepinfra", "cerebras", "sambanova", "perplexity", "qwen",
            "cohere", "ai21", "ernie",
        ] {
            let provider = try_select_provider(name).unwrap();
            assert!(provider.requires_key(), "{name} should require a key");
            assert!(!provider.env_var().is_empty(), "{name} should name its key variable");
        }
        for name in ["vllm", "jan"] {
            assert!(!try_select_provider(name).unwrap().requires_key(), "{name} is a keyless local server");
        }
    }

    #[test]
    fn decommissioned_or_account_specific_providers_stay_unknown() {
        for name in ["hyperbolic", "anyscale", "octoai", "bedrock", "azure", "cloudflare", "replicate", "lepton"] {
            assert!(try_select_provider(name).is_err(), "{name} should not be selectable");
        }
    }

    #[test]
    fn unknown_provider_name_is_a_named_error_not_a_panic() {
        assert!(try_select_provider("nonexistent").is_err());
    }

    #[test]
    fn aliases_select_the_canonical_provider() {
        assert_eq!(try_select_provider("claude").unwrap().name(), "anthropic");
        assert_eq!(try_select_provider("LM-STUDIO").unwrap().name(), "lmstudio");
        assert_eq!(try_select_provider("llama.cpp").unwrap().name(), "llamacpp");
    }

    #[test]
    fn registration_name_matches_factory_identity() {
        for registration in PROVIDERS {
            assert_eq!(registration.name, (registration.factory)().name());
        }
    }
}
