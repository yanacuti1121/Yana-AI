//! Per-turn generation settings the IDE can ask for: the reply's token limit and the sampling temperature.
//!
//! `yana-rt chat --headless` is one process per turn, so the validated values live in a process-wide slot that the
//! provider request builders read. That keeps the `ChatProvider` trait (about twenty implementors) unchanged. The
//! interactive terminal never sets the slot, so its requests are byte-for-byte what they were.
//!
//! Reasoning effort is deliberately not here: whether and how a model accepts it differs per provider and model, and
//! sending it to one that does not is an API error. It stays "not available yet" until it can be checked per model.

use serde_json::Value;
use std::sync::OnceLock;

/// Upper bound the IDE may request. Providers cap lower on their own; this only rejects absurd values early.
pub const MAX_ALLOWED_TOKENS: u32 = 32_000;
/// Highest temperature any supported provider accepts (OpenAI-compatible APIs go to 2.0).
pub const MAX_TEMPERATURE: f64 = 2.0;
/// Anthropic accepts 0.0 to 1.0 only; a higher request is capped here instead of failing the whole turn.
const ANTHROPIC_MAX_TEMPERATURE: f64 = 1.0;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct GenerationOptions {
    pub max_tokens: Option<u32>,
    pub temperature: Option<f64>,
}

impl GenerationOptions {
    /// Validates what arrived in the stdin JSON. A wrong value is an error, never silently replaced by a default.
    pub fn parse(max_tokens: Option<i64>, temperature: Option<f64>) -> Result<Self, String> {
        let max_tokens = match max_tokens {
            None => None,
            Some(n) if (1..=i64::from(MAX_ALLOWED_TOKENS)).contains(&n) => Some(n as u32),
            Some(_) => return Err(format!("max_tokens must be a whole number from 1 to {MAX_ALLOWED_TOKENS}")),
        };
        let temperature = match temperature {
            None => None,
            Some(t) if t.is_finite() && (0.0..=MAX_TEMPERATURE).contains(&t) => Some(t),
            Some(_) => return Err(format!("temperature must be a number from 0 to {MAX_TEMPERATURE}")),
        };
        Ok(Self { max_tokens, temperature })
    }
}

static ACTIVE: OnceLock<GenerationOptions> = OnceLock::new();

/// Sets the options for this process. Only the first call counts (one headless process runs one turn).
pub fn set_active(options: GenerationOptions) {
    let _ = ACTIVE.set(options);
}

pub fn active() -> GenerationOptions {
    ACTIVE.get().copied().unwrap_or_default()
}

/// Round to 2 decimals so the request body stays readable and the f64 to JSON conversion is stable.
fn temperature_json(value: f64) -> Value {
    serde_json::json!((value * 100.0).round() / 100.0)
}

/// Anthropic Messages API body: `max_tokens` is always present (the API requires it), `temperature` only when asked.
pub fn apply_anthropic(body: &mut Value, options: GenerationOptions) {
    if let Some(max_tokens) = options.max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }
    if let Some(temperature) = options.temperature {
        body["temperature"] = temperature_json(temperature.min(ANTHROPIC_MAX_TEMPERATURE));
    }
}

/// OpenAI-compatible chat completions body (also Ollama, Groq, and the custom endpoint).
pub fn apply_openai_compat(body: &mut Value, options: GenerationOptions) {
    if let Some(max_tokens) = options.max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }
    if let Some(temperature) = options.temperature {
        body["temperature"] = temperature_json(temperature);
    }
}

/// Gemini `generationConfig` object.
pub fn apply_gemini(config: &mut Value, options: GenerationOptions) {
    if let Some(max_tokens) = options.max_tokens {
        config["maxOutputTokens"] = serde_json::json!(max_tokens);
    }
    if let Some(temperature) = options.temperature {
        config["temperature"] = temperature_json(temperature);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn nothing_requested_changes_nothing() {
        let mut anthropic = json!({"max_tokens": 4096});
        let mut openai = json!({"model": "m"});
        let mut gemini = json!({"maxOutputTokens": 2048});
        apply_anthropic(&mut anthropic, GenerationOptions::default());
        apply_openai_compat(&mut openai, GenerationOptions::default());
        apply_gemini(&mut gemini, GenerationOptions::default());
        assert_eq!(anthropic, json!({"max_tokens": 4096}));
        assert_eq!(openai, json!({"model": "m"}));
        assert_eq!(gemini, json!({"maxOutputTokens": 2048}));
    }

    #[test]
    fn requested_values_reach_every_provider_shape() {
        let options = GenerationOptions::parse(Some(1500), Some(0.3)).unwrap();
        let mut anthropic = json!({"max_tokens": 4096});
        let mut openai = json!({});
        let mut gemini = json!({"maxOutputTokens": 2048});
        apply_anthropic(&mut anthropic, options);
        apply_openai_compat(&mut openai, options);
        apply_gemini(&mut gemini, options);
        assert_eq!(anthropic, json!({"max_tokens": 1500, "temperature": 0.3}));
        assert_eq!(openai, json!({"max_tokens": 1500, "temperature": 0.3}));
        assert_eq!(gemini, json!({"maxOutputTokens": 1500, "temperature": 0.3}));
    }

    #[test]
    fn anthropic_caps_temperature_at_one_while_others_keep_it() {
        let options = GenerationOptions::parse(None, Some(1.8)).unwrap();
        let mut anthropic = json!({});
        let mut openai = json!({});
        apply_anthropic(&mut anthropic, options);
        apply_openai_compat(&mut openai, options);
        assert_eq!(anthropic["temperature"], json!(1.0));
        assert_eq!(openai["temperature"], json!(1.8));
    }

    #[test]
    fn zero_temperature_is_a_real_value_not_unset() {
        let options = GenerationOptions::parse(None, Some(0.0)).unwrap();
        let mut body = json!({});
        apply_openai_compat(&mut body, options);
        assert_eq!(body["temperature"], json!(0.0));
    }

    #[test]
    fn bad_values_are_refused_not_replaced() {
        for bad in [0, -1, 32_001, i64::MAX] {
            assert!(GenerationOptions::parse(Some(bad), None).is_err(), "max_tokens {bad}");
        }
        for bad in [-0.1, 2.01, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(GenerationOptions::parse(None, Some(bad)).is_err(), "temperature {bad}");
        }
        assert!(GenerationOptions::parse(Some(1), Some(0.0)).is_ok());
        assert!(GenerationOptions::parse(Some(32_000), Some(2.0)).is_ok());
    }

    #[test]
    fn the_process_slot_defaults_to_nothing_requested() {
        // Other tests never call `set_active`, so this process keeps the default.
        assert_eq!(active(), GenerationOptions::default());
    }
}
