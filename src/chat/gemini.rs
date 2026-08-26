//! Google Gemini streaming provider.
//!
//! Gemini uses a distinct request/response shape, so it stays separate from
//! `openai_compat` while still implementing the canonical `ChatProvider`.

use super::provider::{
    read_error_body, read_sse_stream, ChatMessage, ChatProvider, ChatUsage, ModelInfo, Role,
};
use super::tool_types::{StreamOutcome, ToolSpec};
use anyhow::{Context, Result};

const DEFAULT_MODEL: &str = "gemini-2.0-flash";
const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

pub struct GeminiProvider;

impl ChatProvider for GeminiProvider {
    fn name(&self) -> &str {
        "gemini"
    }

    fn default_model(&self) -> &str {
        DEFAULT_MODEL
    }

    fn requires_key(&self) -> bool {
        true
    }

    fn env_var(&self) -> &str {
        "GEMINI_API_KEY"
    }

    fn supports_tool_calling(&self) -> bool {
        false
    }

    fn supports_vision(&self) -> bool {
        true
    }

    fn list_models(&self, _api_key: Option<&str>) -> Result<Vec<ModelInfo>> {
        Ok(vec![ModelInfo::named(DEFAULT_MODEL)])
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
        let key = api_key.context("GEMINI_API_KEY not set")?;
        if !tools.is_empty() {
            anyhow::bail!("gemini adapter does not expose tool calling yet")
        }

        let model = canonical_model_id(model)?;
        let url = format!("{GEMINI_BASE}/{model}:streamGenerateContent?alt=sse");
        let mut body = serde_json::json!({
            "contents": build_gemini_messages(messages),
            "generationConfig": { "maxOutputTokens": 2048 },
        });
        if let Some(system) = system.filter(|value| !value.is_empty()) {
            body["systemInstruction"] = serde_json::json!({
                "parts": [{ "text": system }]
            });
        }

        let agent = super::provider::build_agent();
        let mut response = agent
            .post(&url)
            .header("content-type", "application/json")
            .header("x-goog-api-key", key)
            .send_json(&body)
            .map_err(|error| anyhow::anyhow!("gemini request failed: {error}"))?;
        if !response.status().is_success() {
            let detail = read_error_body(&mut response);
            anyhow::bail!("gemini error ({}): {detail}", response.status().as_u16());
        }

        let mut usage = ChatUsage::default();
        read_sse_stream(response.into_body().into_reader(), |payload| {
            let event: serde_json::Value =
                serde_json::from_str(payload).context("invalid Gemini stream event")?;
            if let Some(parts) = event
                .pointer("/candidates/0/content/parts")
                .and_then(serde_json::Value::as_array)
            {
                for part in parts {
                    if let Some(text) = part.get("text").and_then(serde_json::Value::as_str) {
                        on_chunk(text)?;
                    }
                }
            }
            if let Some(metadata) = event.get("usageMetadata") {
                usage.merge(ChatUsage {
                    input_tokens: metadata
                        .get("promptTokenCount")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(0),
                    output_tokens: metadata
                        .get("candidatesTokenCount")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(0),
                });
            }
            Ok(())
        })?;
        Ok((usage, StreamOutcome::Text))
    }
}

fn canonical_model_id(model: &str) -> Result<&str> {
    let model = model.strip_prefix("models/").unwrap_or(model);
    if model.is_empty()
        || model.len() > 101
        || !model
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        anyhow::bail!("invalid Gemini model id")
    }
    Ok(model)
}

fn build_gemini_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    messages
        .iter()
        .map(|message| {
            let role = match message.role {
                Role::User => "user",
                Role::Assistant => "model",
            };
            let mut parts = message
                .images
                .iter()
                .map(|image| {
                    serde_json::json!({
                        "inlineData": {
                            "mimeType": image.mime_type,
                            "data": image.data,
                        }
                    })
                })
                .collect::<Vec<_>>();
            if !message.content.is_empty() {
                parts.push(serde_json::json!({ "text": message.content }));
            }
            serde_json::json!({ "role": role, "parts": parts })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::provider::ImageAttachment;

    #[test]
    fn model_id_is_path_neutral() {
        assert_eq!(
            canonical_model_id("models/gemini-2.0-flash").unwrap(),
            "gemini-2.0-flash"
        );
        assert!(canonical_model_id("../escape").is_err());
        assert!(canonical_model_id("gemini?key=secret").is_err());
    }

    #[test]
    fn multimodal_message_uses_inline_data() {
        let message =
            ChatMessage::text(Role::User, "describe").with_images(vec![ImageAttachment {
                mime_type: "image/webp".to_string(),
                data: "aGVsbG8=".to_string(),
            }]);
        let built = build_gemini_messages(&[message]);
        assert_eq!(built[0]["role"], "user");
        assert_eq!(built[0]["parts"][0]["inlineData"]["mimeType"], "image/webp");
        assert_eq!(built[0]["parts"][1]["text"], "describe");
    }
}
