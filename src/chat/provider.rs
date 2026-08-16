//! Chat-provider HTTP helpers and compatibility re-exports.
//!
//! Provider/message/tool contracts are owned by `crate::runtime`; this module
//! keeps existing chat call sites stable while the clients migrate to the
//! canonical turn engine.

use super::tool_types::StreamOutcome;
pub(crate) use crate::runtime::provider::{
    ChatMessage, ChatProvider, ChatUsage, ModelInfo, ProviderHealth, Role, RuntimeKind,
};
use anyhow::Result;
use std::io::{BufRead, BufReader, Read};
use std::time::Duration;

/// One-shot, non-interactive LLM call — no TUI, no history file, no
/// streaming channel. Collects the full response into a `String` and
/// returns it once the stream completes. Every existing call site for
/// `stream_chat` lives inside the interactive TUI loop (`tui/turn.rs`,
/// spawned on a worker thread, feeding an `mpsc` channel the render loop
/// drains) — this is the first caller that just wants one answer to one
/// question and doesn't need any of that plumbing (used by `yana-rt eval
/// judge`, see `task.rs`).
pub fn ask_once(
    provider: &dyn ChatProvider,
    api_key: Option<&str>,
    model: &str,
    system: &str,
    user_message: &str,
) -> Result<String> {
    let messages = [ChatMessage::text(Role::User, user_message)];
    let mut full = String::new();
    let (_, outcome) =
        provider.stream_chat(api_key, model, Some(system), &messages, &[], &mut |chunk| {
            full.push_str(chunk);
            Ok(())
        })?;
    // `tools: &[]` above means a well-behaved provider never returns
    // `ToolCalls` — but "never silently drop a tool call" outranks "this
    // should never happen in practice" (see plan's tool-poisoning-defense
    // note), so a violation here is a loud error, not a silent String.
    if matches!(outcome, StreamOutcome::ToolCalls(_)) {
        anyhow::bail!("provider proposed a tool call in a non-tool-aware context (ask_once)");
    }
    Ok(full)
}

/// Shared HTTP agent for all providers. Neither existing `ureq` call site
/// in this crate (`design/mod.rs`, `filescan/mod.rs`) sets an explicit
/// timeout — a real gap for a one-shot request, and a genuine hang risk
/// for a long-lived streaming chat connection, so this deliberately
/// deviates from that precedent. `timeout_recv_body` reads (per ureq's own
/// doc comment) as a total deadline for the whole body-receive phase, not
/// a per-chunk idle timer, so it's set generously as a backstop —
/// `timeout_connect`/`timeout_recv_response` are the real fast-fail path
/// for a dead endpoint or an unreachable local Ollama daemon.
///
/// `http_status_as_error(false)` so 4xx/5xx responses come back as `Ok`
/// instead of losing the error body inside an opaque `Err` (matches the
/// "never dump raw upstream error bodies straight to the user, but do
/// capture them for --verbose" requirement — the collapsing decision is
/// made by the caller in `chat/mod.rs`, not here).
pub fn build_agent() -> ureq::Agent {
    let config = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(10)))
        .timeout_recv_response(Some(Duration::from_secs(30)))
        .timeout_recv_body(Some(Duration::from_secs(300)))
        .http_status_as_error(false)
        .build();
    ureq::Agent::new_with_config(config)
}

/// Read a small, bounded prefix of a non-2xx response body for error
/// reporting. Bounded so a misbehaving upstream can't make a single failed
/// request print megabytes of garbage.
pub fn read_error_body(resp: &mut ureq::http::Response<ureq::Body>) -> String {
    let mut buf = [0u8; 2048];
    let n = resp.body_mut().as_reader().read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).to_string()
}

/// Read Server-Sent-Events lines from `reader`, calling `on_data` with the
/// payload of every `data: ...` line. Blank lines, other SSE framing
/// (`event:`, `id:`, comments), and the terminal `data: [DONE]` marker are
/// consumed here so callers only ever see real event payloads. Stops at
/// EOF or the `[DONE]` marker, whichever comes first.
pub fn read_sse_stream<R: Read>(
    reader: R,
    mut on_data: impl FnMut(&str) -> Result<()>,
) -> Result<()> {
    let buf = BufReader::new(reader);
    for line in buf.lines() {
        let line = line?;
        let Some(payload) = line
            .strip_prefix("data: ")
            .or_else(|| line.strip_prefix("data:"))
        else {
            continue;
        };
        let payload = payload.trim();
        if payload.is_empty() {
            continue;
        }
        if payload == "[DONE]" {
            break;
        }
        on_data(payload)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct UnavailableProvider;

    impl ChatProvider for UnavailableProvider {
        fn name(&self) -> &str {
            "offline"
        }
        fn default_model(&self) -> &str {
            "none"
        }
        fn requires_key(&self) -> bool {
            false
        }
        fn env_var(&self) -> &str {
            ""
        }
        fn list_models(&self, _api_key: Option<&str>) -> Result<Vec<ModelInfo>> {
            anyhow::bail!("backend unavailable")
        }
        fn stream_chat(
            &self,
            _api_key: Option<&str>,
            _model: &str,
            _system: Option<&str>,
            _messages: &[ChatMessage],
            _tools: &[ToolSpec],
            _on_chunk: &mut dyn FnMut(&str) -> Result<()>,
        ) -> Result<(ChatUsage, StreamOutcome)> {
            anyhow::bail!("backend unavailable")
        }
    }

    #[test]
    fn unavailable_provider_health_is_actionable() {
        assert_eq!(
            UnavailableProvider.health(None),
            ProviderHealth::Unavailable("backend unavailable".to_string())
        );
    }
}
