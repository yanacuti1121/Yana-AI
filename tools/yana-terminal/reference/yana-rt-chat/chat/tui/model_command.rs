//! `App::handle_model_command` — split out of `tui.rs` (see that file's
//! module doc) purely for line-count budget; this is still logically part
//! of `App`'s own behavior, just declared in a submodule so it can reach
//! `App`'s private fields the same way `render.rs` does.

use super::App;

impl App {
    /// `/model <provider> [model-name]` — switch provider/model without
    /// leaving the TUI. Confirmed behavior: always starts a fresh session
    /// (cleared history, new session_id, new breaker) rather than carrying
    /// the old conversation over to the new model — avoids cross-model
    /// context confusion at the cost of conversational continuity.
    pub(super) fn handle_model_command(&mut self, args: &str) {
        let mut parts = args.split_whitespace();
        let Some(provider_name) = parts.next() else {
            self.status = "usage: /model <anthropic|openai|ollama> [model-name]".to_string();
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
            .unwrap_or_else(|| new_provider.default_model().to_string());

        self.status = format!("switched to {} / {model} — new session", new_provider.name());
        self.provider = new_provider;
        self.model = model;
        self.api_key = api_key;
        self.history.clear();
        self.streaming_reply.clear();
        self.session_id = uuid::Uuid::new_v4().to_string();
        self.breaker = super::super::circuit_breaker::CircuitBreaker::new();
        self.scroll = u16::MAX;
        self.show_recent_sessions = false;
    }
}
