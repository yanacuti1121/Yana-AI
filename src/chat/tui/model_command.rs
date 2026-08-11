//! `App::handle_model_command` — split out of `tui.rs` (see that file's
//! module doc) purely for line-count budget; this is still logically part
//! of `App`'s own behavior, just declared in a submodule so it can reach
//! `App`'s private fields the same way `render.rs` does.

use super::App;
use crate::chat::provider::ModelInfo;

fn validate_model(models: &[ModelInfo], requested: &str) -> Result<(), String> {
    if models.iter().any(|candidate| candidate.id == requested) {
        Ok(())
    } else {
        Err(format!("model '{requested}' is not available"))
    }
}

impl App {
    /// `/model <provider> [model-name]` — validate and switch the active
    /// tab without restarting the workspace or touching other tabs.
    pub(super) fn handle_model_command(&mut self, args: &str) {
        let mut parts = args.split_whitespace();
        let Some(provider_name) = parts.next() else {
            self.status =
                "usage: /model <ollama|lmstudio|llamacpp|turbofieldfare|anthropic|openai|kimi> [model-name]"
                    .to_string();
            return;
        };

        let new_provider = match super::super::try_select_provider(provider_name) {
            Ok(p) => p,
            Err(msg) => {
                self.status = msg;
                return;
            }
        };

        let api_key = if new_provider.requires_key() {
            match std::env::var(new_provider.env_var()) {
                Ok(k) if !k.is_empty() => Some(k),
                _ => {
                    self.status = format!(
                        "{} not set — export it before switching to {}",
                        new_provider.env_var(),
                        new_provider.name()
                    );
                    return;
                }
            }
        } else {
            None
        };

        let model = parts
            .next()
            .map(|s| s.to_string())
            .unwrap_or_else(|| super::super::resolve_default_model(&new_provider));

        match new_provider.list_models(api_key.as_deref()) {
            Ok(models) if validate_model(&models, &model).is_err() => {
                self.status = format!(
                    "model '{model}' is not available from {} · run /models after switching provider",
                    new_provider.name()
                );
                return;
            }
            Err(error) => {
                self.status = format!("cannot validate {} / {model}: {error}", new_provider.name());
                return;
            }
            Ok(_) => {}
        }

        self.status = format!("switched active tab to {} / {model}", new_provider.name());
        self.provider = new_provider;
        self.model = model;
        self.api_key = api_key;
        self.provider_health = crate::chat::provider::ProviderHealth::Checking;
        self.health_rx = Some(Self::start_health_probe(
            self.provider.clone(),
            self.api_key.clone(),
            self.model.clone(),
        ));
        self.breaker = super::super::circuit_breaker::CircuitBreaker::new();
        self.metadata.provider = self.provider.name().to_string();
        self.metadata.model = self.model.clone();
        self.persist_workspace();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_validation_accepts_only_reported_ids() {
        let models = vec![ModelInfo::named("qwen3:14b"), ModelInfo::named("phi4")];
        assert!(validate_model(&models, "qwen3:14b").is_ok());
        assert_eq!(
            validate_model(&models, "missing").unwrap_err(),
            "model 'missing' is not available"
        );
    }
}
