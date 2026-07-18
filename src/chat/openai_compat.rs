//! Generic OpenAI-compatible chat provider. Covers OpenAI itself *and*
//! Ollama — `tools/yana-web/server.js`'s already-shipped `PROVIDERS` table
//! targets Ollama's OpenAI-compatible `/v1/chat/completions` endpoint (not
//! its native `/api/chat` NDJSON one) with an identical request/response
//! shape to the real `openai` entry, so one generic, config-driven struct
//! covers both here too — adding another OpenAI-shape backend later
//! (Groq, OpenRouter, DeepSeek, ...) is then a new constructor function,
//! not new code.

use super::provider::{read_error_body, read_sse_stream, ChatMessage, ChatProvider, ChatUsage, Role};
use anyhow::{Context, Result};

pub struct OpenAiCompatProvider {
    pub provider_name: &'static str,
    /// Full request URL, e.g. "https://api.openai.com/v1/chat/completions"
    /// or "http://127.0.0.1:11434/v1/chat/completions".
    pub url: &'static str,
    pub default_model: &'static str,
    pub keyless: bool,
    pub env_var: &'static str,
}

pub fn openai() -> OpenAiCompatProvider {
    OpenAiCompatProvider {
        provider_name: "openai",
        url: "https://api.openai.com/v1/chat/completions",
        default_model: "gpt-4o-mini",
        keyless: false,
        env_var: "OPENAI_API_KEY",
    }
}

pub fn kimi() -> OpenAiCompatProvider {
    OpenAiCompatProvider {
        provider_name: "kimi",
        // Moonshot AI's Kimi K3 (2.8T params, launched 2026-07-16) — OpenAI-
        // compatible Chat Completions endpoint, confirmed against official
        // docs (platform.kimi.ai/docs/api/overview): base_url
        // https://api.moonshot.ai/v1, model id "kimi-k3".
        url: "https://api.moonshot.ai/v1/chat/completions",
        default_model: "kimi-k3",
        keyless: false,
        env_var: "MOONSHOT_API_KEY",
    }
}

pub fn ollama() -> OpenAiCompatProvider {
    OpenAiCompatProvider {
        provider_name: "ollama",
        // Loopback only — MVP does not accept a custom base-URL override
        // (see the plan's out-of-scope table: that would reopen the SSRF
        // surface design::check_host_not_private exists to guard).
        url: "http://127.0.0.1:11434/v1/chat/completions",
        default_model: "llama3.2",
        keyless: true,
        env_var: "",
    }
}

impl ChatProvider for OpenAiCompatProvider {
    fn name(&self) -> &str {
        self.provider_name
    }
    fn default_model(&self) -> &str {
        self.default_model
    }
    fn requires_key(&self) -> bool {
        !self.keyless
    }
    fn env_var(&self) -> &str {
        self.env_var
    }

    fn stream_chat(
        &self,
        api_key: Option<&str>,
        model: &str,
        system: Option<&str>,
        messages: &[ChatMessage],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<ChatUsage> {
        if self.requires_key() && api_key.is_none() {
            anyhow::bail!(
                "{} not set — export it, or run with --provider ollama for a local model",
                self.env_var
            );
        }

        let mut msgs: Vec<serde_json::Value> = Vec::with_capacity(messages.len() + 1);
        if let Some(sys) = system {
            msgs.push(serde_json::json!({ "role": "system", "content": sys }));
        }
        for m in messages {
            msgs.push(serde_json::json!({
                "role": match m.role { Role::User => "user", Role::Assistant => "assistant" },
                "content": m.content,
            }));
        }

        let body = serde_json::json!({
            "model": model,
            "stream": true,
            "messages": msgs,
            // Without this, the final SSE chunk never carries usage —
            // real token counts (not the char_count/4 heuristic used
            // elsewhere in this repo) depend on it.
            "stream_options": { "include_usage": true },
        });

        let agent = super::provider::build_agent();
        let mut req = agent.post(self.url).header("content-type", "application/json");
        if let Some(key) = api_key {
            req = req.header("Authorization", format!("Bearer {key}"));
        }
        let mut resp = req
            .send_json(&body)
            .map_err(|e| anyhow::anyhow!("{} request failed: {e}", self.provider_name))
            .with_context(|| {
                if self.provider_name == "ollama" {
                    "is the Ollama daemon running? (`ollama serve`)".to_string()
                } else {
                    String::new()
                }
            })?;

        if !resp.status().is_success() {
            let detail = read_error_body(&mut resp);
            anyhow::bail!("{} error ({}): {detail}", self.provider_name, resp.status().as_u16());
        }

        let mut usage = ChatUsage::default();
        let reader = resp.into_body().into_reader();
        read_sse_stream(reader, |payload| {
            let event: serde_json::Value =
                serde_json::from_str(payload).unwrap_or(serde_json::Value::Null);
            if let Some(text) = event
                .pointer("/choices/0/delta/content")
                .and_then(|v| v.as_str())
            {
                on_chunk(text)?;
            }
            if let Some(u) = event.get("usage") {
                usage.merge(ChatUsage {
                    input_tokens: u.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    output_tokens: u.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                });
            }
            Ok(())
        })?;

        Ok(usage)
    }
}
