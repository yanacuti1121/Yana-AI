//! Anthropic Messages API provider. Genuinely different wire shape from
//! the OpenAI-compatible backends — `x-api-key` + `anthropic-version`
//! headers, a top-level `system` field separate from `messages`, and
//! usage split across two SSE event types — so it gets its own
//! implementation rather than being forced into the OpenAI-compat shape.

use super::provider::{read_error_body, read_sse_stream, ChatMessage, ChatProvider, ChatUsage, Role};
use anyhow::{Context, Result};

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";
// Hard cap so a runaway reply can't grow the request unbounded turn over
// turn; matches this crate's existing convention of bounding untrusted-size
// inputs (see fuzz-testing-constraints.md's DoS-prevention guard).
const MAX_TOKENS: u32 = 4096;

pub struct AnthropicProvider;

impl ChatProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }
    fn default_model(&self) -> &str {
        DEFAULT_MODEL
    }
    fn requires_key(&self) -> bool {
        true
    }
    fn env_var(&self) -> &str {
        "ANTHROPIC_API_KEY"
    }

    fn stream_chat(
        &self,
        api_key: Option<&str>,
        model: &str,
        system: Option<&str>,
        messages: &[ChatMessage],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<ChatUsage> {
        let key = api_key.context(
            "ANTHROPIC_API_KEY not set — export it, or run with --provider ollama for a local model",
        )?;

        let msgs: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| {
                serde_json::json!({
                    "role": match m.role { Role::User => "user", Role::Assistant => "assistant" },
                    "content": m.content,
                })
            })
            .collect();

        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": MAX_TOKENS,
            "stream": true,
            "messages": msgs,
        });
        if let Some(sys) = system {
            body["system"] = serde_json::Value::String(sys.to_string());
        }

        let agent = super::provider::build_agent();
        let mut resp = agent
            .post(ANTHROPIC_URL)
            .header("x-api-key", key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .send_json(&body)
            .map_err(|e| anyhow::anyhow!("anthropic request failed: {e}"))?;

        if !resp.status().is_success() {
            let detail = read_error_body(&mut resp);
            anyhow::bail!("anthropic error ({}): {detail}", resp.status().as_u16());
        }

        let mut usage = ChatUsage::default();
        let reader = resp.into_body().into_reader();
        read_sse_stream(reader, |payload| {
            let event: serde_json::Value =
                serde_json::from_str(payload).unwrap_or(serde_json::Value::Null);
            match event.get("type").and_then(|t| t.as_str()) {
                Some("content_block_delta") => {
                    if let Some(text) = event.pointer("/delta/text").and_then(|v| v.as_str()) {
                        on_chunk(text)?;
                    }
                }
                // input_tokens arrives here; output_tokens is a zero
                // placeholder at this point in the stream (see ChatUsage::merge).
                Some("message_start") => {
                    if let Some(u) = event.pointer("/message/usage") {
                        usage.merge(ChatUsage {
                            input_tokens: u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                            output_tokens: 0,
                        });
                    }
                }
                // real final output_tokens arrives here; no input_tokens
                // field exists on this event at all.
                Some("message_delta") => {
                    if let Some(u) = event.get("usage") {
                        usage.merge(ChatUsage {
                            input_tokens: 0,
                            output_tokens: u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                        });
                    }
                }
                Some("error") => {
                    let msg = event
                        .pointer("/error/message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown stream error");
                    anyhow::bail!("anthropic stream error: {msg}");
                }
                _ => {}
            }
            Ok(())
        })?;

        Ok(usage)
    }
}
