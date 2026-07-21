//! Shared chat-provider types: message/role/usage, the `ChatProvider`
//! trait, the shared HTTP agent, and the SSE-line reader every provider
//! implementation uses (the `data: {...}\n\n` framing is identical across
//! Anthropic and OpenAI-compatible backends — only the per-event JSON
//! field extraction differs, which is why this lives here once instead of
//! being duplicated per provider).

use anyhow::Result;
use std::io::{BufRead, BufReader, Read};
use std::time::Duration;

/// Deliberately has no `System` variant. The system prompt is its own
/// separate parameter on `ChatProvider::stream_chat`, never part of the
/// message array — a message loaded from a `--resume` history file
/// therefore cannot deserialize into a system-role turn even if the file
/// were hand-edited (never trust a stored/imported message's role as
/// "system" — see rule 71 plan's decision-4 write-up).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ChatUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

impl ChatUsage {
    /// Overwrite only nonzero fields. Needed because Anthropic splits usage
    /// across two SSE events: `message_start` carries `input_tokens`
    /// (`output_tokens` is a zero placeholder at that point), and
    /// `message_delta` carries the real final `output_tokens` with no
    /// `input_tokens` field at all — a plain overwrite would let the second
    /// event zero out the first event's input count.
    pub fn merge(&mut self, other: ChatUsage) {
        if other.input_tokens > 0 {
            self.input_tokens = other.input_tokens;
        }
        if other.output_tokens > 0 {
            self.output_tokens = other.output_tokens;
        }
    }
}

/// `Send + Sync` required because `mod.rs` shares one provider instance
/// across turns via `Arc<dyn ChatProvider>`, calling `stream_chat` from a
/// spawned worker thread per turn (needed so the render loop stays
/// responsive to Ctrl-C/redraws while a response streams in). Both
/// existing implementations satisfy this trivially — neither has any
/// interior mutability.
pub trait ChatProvider: Send + Sync {
    fn name(&self) -> &str;
    fn default_model(&self) -> &str;
    /// False only for Ollama (loopback, no auth required).
    fn requires_key(&self) -> bool;
    /// Env var name to read the API key from. Empty string when
    /// `requires_key()` is false.
    fn env_var(&self) -> &str;

    /// Blocking call. Streams text chunks via `on_chunk` as they arrive;
    /// returns final usage once the stream completes (or an error). Error
    /// messages may contain upstream detail — callers decide whether to
    /// print it in full (--verbose) or collapse it to a generic class.
    fn stream_chat(
        &self,
        api_key: Option<&str>,
        model: &str,
        system: Option<&str>,
        messages: &[ChatMessage],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<ChatUsage>;
}

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
    let messages = [ChatMessage { role: Role::User, content: user_message.to_string() }];
    let mut full = String::new();
    provider.stream_chat(api_key, model, Some(system), &messages, &mut |chunk| {
        full.push_str(chunk);
        Ok(())
    })?;
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
