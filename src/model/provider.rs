//! Model plane's provider abstraction (Phase 6 of the host-native-os
//! program) — moved from `chat::provider` verbatim, with `ModelId`/
//! `ProviderId` added as the two identity types the program brief asked
//! for that did not already exist. `chat::provider` now re-exports
//! everything below so every pre-existing internal caller
//! (`chat::provider::ask_once`, `crate::chat::try_select_provider`, etc.)
//! keeps resolving unchanged — this is the "compatibility
//! re-exports/adapters" the phase brief asked for, not a rewrite.
//!
//! `ChatMessage`/`ChatUsage`/`Role`/`ask_once`/`build_agent`/
//! `read_error_body`/`read_sse_stream` moved along with `ChatProvider`
//! rather than staying behind in `chat::` because the trait's own method
//! signatures reference them directly (`stream_chat` takes
//! `&[ChatMessage]`, returns `ChatUsage`) — splitting them across two
//! modules would be an artificial boundary, not a real one.
//! `ToolSpec`/`StreamOutcome` stay owned by `chat::tool_types` and are
//! referenced from here instead: tool-calling is a chat-turn feature, not
//! an intrinsic "what is this model" fact, so that ownership does not
//! flip.

use super::tool::{StreamOutcome, ToolCallRecord, ToolResultRecord, ToolSpec};
use anyhow::Result;
use std::io::{BufRead, BufReader, Read};
use std::time::Duration;

/// Opaque provider identifier (e.g. "anthropic", "ollama"). A thin
/// newtype rather than a bare `String` so model-plane code that only
/// deals in identity (not free-form provider metadata) can't accidentally
/// be handed a model name or vice versa. `ProviderSummary`/`ModelInfo`
/// keep their existing raw `String` fields unchanged — both are already
/// `#[derive(Serialize)]` API surface with an established JSON shape;
/// wrapping them now would be exactly the "rewrite unnecessarily" this
/// phase was told not to do. New model-plane code (e.g. `runtime.rs`)
/// uses this type instead.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize)]
pub struct ProviderId(pub String);

impl std::fmt::Display for ProviderId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<&str> for ProviderId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

/// Opaque model identifier, same rationale as `ProviderId`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize)]
pub struct ModelId(pub String);

impl std::fmt::Display for ModelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<&str> for ModelId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeKind {
    Local,
    Remote,
}

impl RuntimeKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Local => "LOCAL",
            Self::Remote => "REMOTE",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelInfo {
    pub id: String,
    pub context_length: Option<u64>,
    pub size_bytes: Option<u64>,
    pub quantization: Option<String>,
}

impl ModelInfo {
    pub fn named(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            context_length: None,
            size_bytes: None,
            quantization: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderHealth {
    Checking,
    Ready,
    Unavailable(String),
}

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

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ImageAttachment {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
    /// Base64 image payloads attached to this turn. Kept on the canonical
    /// message type so every provider receives the same multimodal input;
    /// wire-format conversion remains provider-owned.
    pub images: Vec<ImageAttachment>,
    /// Set when this turn is the model proposing a tool call (always
    /// paired with `role: Assistant`). Additive field, not a new `Role`
    /// variant — see `Role`'s own doc comment for why.
    pub tool_call: Option<ToolCallRecord>,
    /// Set when this turn is a tool-execution result being reported back
    /// (always paired with `role: User` — matches both providers' own
    /// wire convention of addressing tool results back as a user-facing
    /// turn). See `history.rs`'s module doc for the full reasoning.
    pub tool_result: Option<ToolResultRecord>,
}

impl ChatMessage {
    /// Plain-text turn constructor — the common case at every existing
    /// call site, now that the struct has two more fields to fill in.
    pub fn text(role: Role, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
            images: Vec::new(),
            tool_call: None,
            tool_result: None,
        }
    }

    pub fn with_images(mut self, images: Vec<ImageAttachment>) -> Self {
        self.images = images;
        self
    }
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

/// `Send + Sync` required because `chat/mod.rs` shares one provider
/// instance across turns via `Arc<dyn ChatProvider>`, calling
/// `stream_chat` from a spawned worker thread per turn (needed so the
/// render loop stays responsive to Ctrl-C/redraws while a response
/// streams in). Both existing implementations satisfy this trivially —
/// neither has any interior mutability.
pub trait ChatProvider: Send + Sync {
    fn name(&self) -> &str;
    fn default_model(&self) -> &str;
    /// False only for Ollama (loopback, no auth required).
    fn requires_key(&self) -> bool;
    /// Env var name to read the API key from. Empty string when
    /// `requires_key()` is false.
    fn env_var(&self) -> &str;
    fn runtime_kind(&self) -> RuntimeKind {
        RuntimeKind::Remote
    }
    /// Whether this provider honors an OpenAI-style `tools:` request and
    /// can emit `StreamOutcome::ToolCalls`. Defaults `true`, preserving
    /// every existing provider's current behavior exactly — none of them
    /// distinguish today (AD-25). A provider that legitimately can't do
    /// function-calling overrides this to `false`; callers then degrade to
    /// a chat-only turn (`tools: &[]`) instead of sending a catalog the
    /// provider will silently ignore.
    fn supports_tool_calling(&self) -> bool {
        true
    }
    fn supports_vision(&self) -> bool {
        false
    }
    fn list_models(&self, _api_key: Option<&str>) -> Result<Vec<ModelInfo>> {
        Ok(vec![ModelInfo::named(self.default_model())])
    }
    fn health(&self, api_key: Option<&str>) -> ProviderHealth {
        match self.list_models(api_key) {
            Ok(_) => ProviderHealth::Ready,
            Err(error) => ProviderHealth::Unavailable(error.to_string()),
        }
    }

    /// Blocking call. Streams text chunks via `on_chunk` as they arrive;
    /// returns final usage plus what the turn produced once the stream
    /// completes (or an error). `tools` is the catalog offered to the
    /// model this turn — pass `&[]` for a plain-text-only call (that's
    /// also what every implementation must treat as "never emit
    /// `StreamOutcome::ToolCalls`," since a provider has nothing to call
    /// if it was offered nothing). Error messages may contain upstream
    /// detail — callers decide whether to print it in full (--verbose) or
    /// collapse it to a generic class.
    fn stream_chat(
        &self,
        api_key: Option<&str>,
        model: &str,
        system: Option<&str>,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)>;
}

/// One-shot, non-interactive LLM call — no TUI, no history file, no
/// streaming channel. Collects the full response into a `String` and
/// returns it once the stream completes. Every existing call site for
/// `stream_chat` lives inside the interactive TUI loop (`chat/tui/turn.rs`,
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

    #[test]
    fn provider_id_and_model_id_display_their_inner_string() {
        assert_eq!(ProviderId::from("anthropic").to_string(), "anthropic");
        assert_eq!(ModelId::from("claude").to_string(), "claude");
    }
}
