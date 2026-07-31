//! Anthropic Messages API provider. Genuinely different wire shape from
//! the OpenAI-compatible backends — `x-api-key` + `anthropic-version`
//! headers, a top-level `system` field separate from `messages`, and
//! usage split across two SSE event types — so it gets its own
//! implementation rather than being forced into the OpenAI-compat shape.

use super::provider::{read_error_body, read_sse_stream, ChatMessage, ChatProvider, ChatUsage, Role};
use super::tool_types::{StreamOutcome, ToolCallAccumulator, ToolSpec};
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
        tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        let key = api_key.context(
            "ANTHROPIC_API_KEY not set — export it, or run with --provider ollama for a local model",
        )?;

        let msgs = build_anthropic_messages(messages);

        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": MAX_TOKENS,
            "stream": true,
            "messages": msgs,
        });
        if let Some(sys) = system {
            body["system"] = serde_json::Value::String(sys.to_string());
        }
        if !tools.is_empty() {
            body["tools"] = serde_json::Value::Array(
                tools
                    .iter()
                    .map(|t| {
                        serde_json::json!({
                            "name": t.name,
                            "description": t.description,
                            "input_schema": t.parameters_schema,
                        })
                    })
                    .collect(),
            );
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
        let mut accumulator = ToolCallAccumulator::new();
        let mut is_tool_call = false;
        let reader = resp.into_body().into_reader();
        read_sse_stream(reader, |payload| {
            let event: serde_json::Value =
                serde_json::from_str(payload).unwrap_or(serde_json::Value::Null);
            let index = event.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            match event.get("type").and_then(|t| t.as_str()) {
                Some("content_block_delta") => {
                    if let Some(text) = event.pointer("/delta/text").and_then(|v| v.as_str()) {
                        on_chunk(text)?;
                    }
                    if let Some(frag) =
                        event.pointer("/delta/partial_json").and_then(|v| v.as_str())
                    {
                        accumulator.append_args(index, frag);
                    }
                }
                // A tool_use block's id/name arrive once, here, at the
                // start of that content block — argument JSON streams in
                // afterward via content_block_delta's partial_json above.
                Some("content_block_start") => {
                    if event.pointer("/content_block/type").and_then(|v| v.as_str())
                        == Some("tool_use")
                    {
                        let id = event
                            .pointer("/content_block/id")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string();
                        let name = event
                            .pointer("/content_block/name")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string();
                        accumulator.start(index, id, name);
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
                // field exists on this event at all. `stop_reason` here is
                // also the authoritative "did the model want to call a
                // tool" signal — not `content_block_stop`, which fires per
                // block and carries no reason of its own.
                Some("message_delta") => {
                    if let Some(u) = event.get("usage") {
                        usage.merge(ChatUsage {
                            input_tokens: 0,
                            output_tokens: u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                        });
                    }
                    if event.pointer("/delta/stop_reason").and_then(|v| v.as_str())
                        == Some("tool_use")
                    {
                        is_tool_call = true;
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

        let outcome = if is_tool_call {
            StreamOutcome::ToolCalls(accumulator.finish())
        } else {
            StreamOutcome::Text
        };
        Ok((usage, outcome))
    }
}

/// Anthropic's own wire shape for tool-call/tool-result turns: a `tool_use`
/// block nests inside an assistant-role message; a `tool_result` block
/// nests inside a user-role message addressed back. `ChatMessage.role` is
/// already set correctly for both cases by whoever constructed it (see
/// `history.rs`'s module doc) — this function only decides the `content`
/// shape, never the `role`.
fn build_anthropic_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    messages
        .iter()
        .map(|m| {
            let role = match m.role {
                Role::User => "user",
                Role::Assistant => "assistant",
            };
            if let Some(tc) = &m.tool_call {
                let input: serde_json::Value =
                    serde_json::from_str(&tc.arguments_json).unwrap_or(serde_json::json!({}));
                serde_json::json!({
                    "role": role,
                    "content": [{"type": "tool_use", "id": tc.id, "name": tc.name, "input": input}],
                })
            } else if let Some(tr) = &m.tool_result {
                serde_json::json!({
                    "role": role,
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tr.call_id,
                        "content": tr.output,
                        "is_error": tr.is_error,
                    }],
                })
            } else {
                serde_json::json!({ "role": role, "content": m.content })
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::tool_types::{ToolCallRecord, ToolResultRecord};

    #[test]
    fn plain_text_message_unchanged_shape() {
        let msgs = [ChatMessage::text(Role::User, "hi")];
        let built = build_anthropic_messages(&msgs);
        assert_eq!(built[0]["role"], "user");
        assert_eq!(built[0]["content"], "hi");
    }

    #[test]
    fn tool_call_message_nests_tool_use_block() {
        let mut m = ChatMessage::text(Role::Assistant, "");
        m.tool_call = Some(ToolCallRecord {
            id: "call_1".to_string(),
            name: "read_file".to_string(),
            arguments_json: "{\"path\":\"x\"}".to_string(),
        });
        let built = build_anthropic_messages(std::slice::from_ref(&m));
        assert_eq!(built[0]["role"], "assistant");
        assert_eq!(built[0]["content"][0]["type"], "tool_use");
        assert_eq!(built[0]["content"][0]["id"], "call_1");
        assert_eq!(built[0]["content"][0]["input"]["path"], "x");
    }

    #[test]
    fn tool_result_message_nests_tool_result_block() {
        let mut m = ChatMessage::text(Role::User, "");
        m.tool_result = Some(ToolResultRecord {
            call_id: "call_1".to_string(),
            output: "file contents".to_string(),
            is_error: false,
            denied: false,
        });
        let built = build_anthropic_messages(std::slice::from_ref(&m));
        assert_eq!(built[0]["role"], "user");
        assert_eq!(built[0]["content"][0]["type"], "tool_result");
        assert_eq!(built[0]["content"][0]["tool_use_id"], "call_1");
        assert_eq!(built[0]["content"][0]["content"], "file contents");
    }
}
