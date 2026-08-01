//! Generic OpenAI-compatible chat provider. Covers OpenAI itself *and*
//! Ollama — `tools/yana-web/server.js`'s already-shipped `PROVIDERS` table
//! targets Ollama's OpenAI-compatible `/v1/chat/completions` endpoint (not
//! its native `/api/chat` NDJSON one) with an identical request/response
//! shape to the real `openai` entry, so one generic, config-driven struct
//! covers both here too — adding another OpenAI-shape backend later
//! (Groq, OpenRouter, DeepSeek, ...) is then a new constructor function,
//! not new code.

use super::provider::{read_error_body, read_sse_stream, ChatMessage, ChatProvider, ChatUsage, Role};
use super::tool_types::{StreamOutcome, ToolCallAccumulator, ToolSpec};
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
        tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
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
        msgs.extend(build_openai_messages(messages));

        let mut body = serde_json::json!({
            "model": model,
            "stream": true,
            "messages": msgs,
            // Without this, the final SSE chunk never carries usage —
            // real token counts (not the char_count/4 heuristic used
            // elsewhere in this repo) depend on it.
            "stream_options": { "include_usage": true },
        });
        if !tools.is_empty() {
            body["tools"] = serde_json::Value::Array(
                tools
                    .iter()
                    .map(|t| {
                        serde_json::json!({
                            "type": "function",
                            "function": {
                                "name": t.name,
                                "description": t.description,
                                "parameters": t.parameters_schema,
                            },
                        })
                    })
                    .collect(),
            );
        }

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
        let mut accumulator = ToolCallAccumulator::new();
        let mut is_tool_call = false;
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
            if let Some(calls) = event
                .pointer("/choices/0/delta/tool_calls")
                .and_then(|v| v.as_array())
            {
                for call in calls {
                    // `index` is required on every fragment; id/name are
                    // only present on the first fragment for that index —
                    // `accumulator.start` tolerates being skipped or
                    // called with empty id/name on later fragments.
                    let index = call.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    let id = call.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                    let name = call
                        .pointer("/function/name")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    if !id.is_empty() || !name.is_empty() {
                        accumulator.start(index, id.to_string(), name.to_string());
                    }
                    if let Some(frag) = call.pointer("/function/arguments").and_then(|v| v.as_str())
                    {
                        accumulator.append_args(index, frag);
                    }
                }
            }
            if event.pointer("/choices/0/finish_reason").and_then(|v| v.as_str())
                == Some("tool_calls")
            {
                is_tool_call = true;
            }
            if let Some(u) = event.get("usage") {
                usage.merge(ChatUsage {
                    input_tokens: u.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    output_tokens: u.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                });
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

/// OpenAI-compatible wire shape for tool-call/tool-result turns: an
/// assistant-role message carries a `tool_calls` array; a result is a
/// separate `role: "tool"` message addressed back via `tool_call_id` —
/// structurally different from Anthropic's nested-content-block approach
/// (see `anthropic.rs::build_anthropic_messages`). `ChatMessage.role` is
/// already `User` for tool-result turns (see `history.rs`'s module doc);
/// this function remaps that specific case to `"tool"` on the wire, since
/// that's this provider family's own convention for the same turn.
fn build_openai_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    messages
        .iter()
        .map(|m| {
            if let Some(tc) = &m.tool_call {
                serde_json::json!({
                    "role": "assistant",
                    "content": serde_json::Value::Null,
                    "tool_calls": [{
                        "id": tc.id,
                        "type": "function",
                        "function": { "name": tc.name, "arguments": tc.arguments_json },
                    }],
                })
            } else if let Some(tr) = &m.tool_result {
                serde_json::json!({
                    "role": "tool",
                    "tool_call_id": tr.call_id,
                    "content": tr.output,
                })
            } else {
                let role = match m.role {
                    Role::User => "user",
                    Role::Assistant => "assistant",
                };
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
        let built = build_openai_messages(&msgs);
        assert_eq!(built[0]["role"], "user");
        assert_eq!(built[0]["content"], "hi");
    }

    #[test]
    fn tool_call_message_becomes_assistant_tool_calls_array() {
        let mut m = ChatMessage::text(Role::Assistant, "");
        m.tool_call = Some(ToolCallRecord {
            id: "call_1".to_string(),
            name: "read_file".to_string(),
            arguments_json: "{\"path\":\"x\"}".to_string(),
        });
        let built = build_openai_messages(std::slice::from_ref(&m));
        assert_eq!(built[0]["role"], "assistant");
        assert_eq!(built[0]["tool_calls"][0]["id"], "call_1");
        assert_eq!(built[0]["tool_calls"][0]["function"]["name"], "read_file");
    }

    #[test]
    fn tool_result_message_becomes_role_tool() {
        let mut m = ChatMessage::text(Role::User, "");
        m.tool_result = Some(ToolResultRecord {
            call_id: "call_1".to_string(),
            output: "file contents".to_string(),
            is_error: false,
            denied: false,
        });
        let built = build_openai_messages(std::slice::from_ref(&m));
        assert_eq!(built[0]["role"], "tool");
        assert_eq!(built[0]["tool_call_id"], "call_1");
        assert_eq!(built[0]["content"], "file contents");
    }
}
