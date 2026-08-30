//! Machine-readable chat adapter for local GUI clients.
//!
//! This module owns only stdin/stdout framing. Inference and authority stay
//! inside the canonical [`crate::runtime::TurnEngine`]. API keys travel in
//! stdin JSON, never argv, so process listings cannot expose them.
//!
//! Authority Hardening item #5 (`ADR-015`): before this, `AwaitingApproval`
//! was an unreachable `bail!()` here (confirmed by reading this file
//! directly before this change — `TurnRequest` also never called
//! `.with_tools(...)`, so headless turns had zero capabilities and could
//! never actually reach this branch in practice). Both are fixed: real
//! tools now come from `crate::chat::tools::catalog` (the same catalog
//! Terminal uses, not a second one), the same `ChatCapabilityExecutor`
//! Terminal uses replaces the always-denying `NoTools`, and a mutating
//! capability's approval pause is persisted via
//! `runtime::PendingApprovalStore` instead of crashing the turn. See
//! `dispatch_resume` below for how a later process invocation completes
//! the pause.

use crate::model::provider::{ChatMessage, ImageAttachment, Role};
use crate::runtime::{
    resume_turn, CancellationToken, PendingApprovalStore, RuntimeEvent, TurnContext, TurnEngine,
    TurnOrigin, TurnOutcome, TurnRequest, YanaAuthorityChain,
};
use crate::session_context::SessionContext;
use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::json;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use uuid::Uuid;

const MAX_INPUT_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HeadlessTurnInput {
    task: String,
    #[serde(default)]
    system: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    images: Vec<HeadlessImageInput>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct HeadlessImageInput {
    mime_type: String,
    data: String,
}

pub(super) fn dispatch(provider_name: String, model: Option<String>) -> Result<()> {
    let provider =
        crate::model::catalog::try_select_provider(&provider_name).map_err(anyhow::Error::msg)?;
    let model = model.unwrap_or_else(|| provider.default_model().to_string());
    let input = read_input()?;
    let images = validate_images(input.images)?;
    if !images.is_empty() && !provider.supports_vision() {
        anyhow::bail!(
            "provider '{}' does not support image input",
            provider.name()
        )
    }
    let repo_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let session = SessionContext::new(
        validate_session_id(input.session_id.as_deref())?,
        repo_root,
        provider.name(),
        model.clone(),
        true,
    );
    let context = TurnContext::new(session.clone(), TurnOrigin::Desktop, true);
    let tools = crate::chat::tools::catalog(&session);
    let system = input.system.filter(|value| !value.is_empty());
    let api_key = input.api_key.filter(|value| !value.is_empty());
    let mut request = TurnRequest::new(
        context.clone(),
        model.clone(),
        vec![ChatMessage::text(Role::User, input.task).with_images(images)],
    )
    .with_tools(tools);
    if let Some(system) = system.clone() {
        request = request.with_system(system);
    }
    if let Some(api_key) = api_key.clone() {
        request = request.with_api_key(api_key);
    }

    let executor = Arc::new(crate::chat::tui::tool_dispatch::ChatCapabilityExecutor::new(
        session.sandboxed,
    ));
    let engine = TurnEngine::new(provider, Arc::new(YanaAuthorityChain), executor);
    let cancellation = CancellationToken::default();
    let mut output = io::BufWriter::new(io::stdout().lock());
    let mut approval_reason: Option<String> = None;
    let outcome = engine.run(request, &cancellation, &mut |event| {
        if let RuntimeEvent::HumanApprovalRequired { authority, reason, .. } = &event {
            approval_reason = Some(format!("{}: {reason}", authority.label()));
        }
        if let Err(error) = write_event(&mut output, event) {
            eprintln!("[chat/headless] stdout protocol write failed: {error}");
        }
    })?;
    match outcome {
        TurnOutcome::Completed { message, .. } => {
            write_json_line(
                &mut output,
                &json!({ "type": "completed", "message": message }),
            )?;
        }
        TurnOutcome::Cancelled { partial } => {
            write_json_line(
                &mut output,
                &json!({ "type": "cancelled", "partial": partial }),
            )?;
        }
        TurnOutcome::AwaitingApproval {
            call,
            continuation_messages,
            tool_rounds,
            ..
        } => {
            let store = PendingApprovalStore::for_root(&context.session.repo_root);
            let pending = store
                .create(
                    context,
                    model,
                    system,
                    continuation_messages,
                    tool_rounds,
                    call,
                    approval_reason.unwrap_or_else(|| "requires explicit human approval".to_string()),
                    30,
                )
                .context("cannot persist pending approval")?;
            write_json_line(
                &mut output,
                &json!({
                    "type": "awaiting_approval",
                    "approval_id": pending.approval_id,
                    "capability": pending.pending_call.name,
                    "reason": pending.authority_reason,
                    "expires_at": pending.expires_at.to_rfc3339(),
                }),
            )?;
        }
    }
    Ok(())
}

/// Completes a paused turn from a LATER process invocation — the actual
/// continuation half of item #5 for Desktop/packaged Web. Reads a
/// `HeadlessResumeInput` from stdin (mirrors `dispatch`'s own stdin/NDJSON
/// convention), resolves the recorded decision, and streams the rest of
/// the turn the same way `dispatch` does.
pub(super) fn dispatch_resume(provider_name: String) -> Result<()> {
    let provider =
        crate::model::catalog::try_select_provider(&provider_name).map_err(anyhow::Error::msg)?;
    let input = read_resume_input()?;
    let repo_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let store = PendingApprovalStore::for_root(&repo_root);
    let resolved = store
        .resolve(&input.approval_id, input.decision, input.decided_by)
        .context("cannot resolve pending approval")?;

    let session = SessionContext::new(
        resolved.context.session.session_id.clone(),
        repo_root,
        provider.name(),
        resolved.model.clone(),
        resolved.context.session.sandboxed,
    );
    let tools = crate::chat::tools::catalog(&session);
    let executor = Arc::new(crate::chat::tui::tool_dispatch::ChatCapabilityExecutor::new(
        session.sandboxed,
    ));
    let cancellation = CancellationToken::default();
    let mut output = io::BufWriter::new(io::stdout().lock());
    let mut approval_reason: Option<String> = None;
    let outcome = resume_turn(
        &resolved,
        provider,
        executor,
        tools,
        input.api_key.filter(|value| !value.is_empty()),
        &cancellation,
        &mut |event| {
            if let RuntimeEvent::HumanApprovalRequired { authority, reason, .. } = &event {
                approval_reason = Some(format!("{}: {reason}", authority.label()));
            }
            if let Err(error) = write_event(&mut output, event) {
                eprintln!("[chat/headless] stdout protocol write failed: {error}");
            }
        },
    )?;
    match outcome {
        TurnOutcome::Completed { message, .. } => {
            write_json_line(
                &mut output,
                &json!({ "type": "completed", "message": message }),
            )?;
        }
        TurnOutcome::Cancelled { partial } => {
            write_json_line(
                &mut output,
                &json!({ "type": "cancelled", "partial": partial }),
            )?;
        }
        TurnOutcome::AwaitingApproval {
            call,
            continuation_messages,
            tool_rounds,
            ..
        } => {
            // A second mutating call proposed within the same resumed
            // turn (e.g. the model asks for another approval-gated
            // capability right after the first) — pause again, the exact
            // same way the original dispatch does, rather than crash.
            let store = PendingApprovalStore::for_root(&resolved.context.session.repo_root);
            let pending = store
                .create(
                    resolved.context.clone(),
                    resolved.model.clone(),
                    resolved.system.clone(),
                    continuation_messages,
                    tool_rounds,
                    call,
                    approval_reason.unwrap_or_else(|| "requires explicit human approval".to_string()),
                    30,
                )
                .context("cannot persist pending approval")?;
            write_json_line(
                &mut output,
                &json!({
                    "type": "awaiting_approval",
                    "approval_id": pending.approval_id,
                    "capability": pending.pending_call.name,
                    "reason": pending.authority_reason,
                    "expires_at": pending.expires_at.to_rfc3339(),
                }),
            )?;
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HeadlessResumeInput {
    approval_id: String,
    decision: bool,
    decided_by: String,
    #[serde(default)]
    api_key: Option<String>,
}

fn read_resume_input() -> Result<HeadlessResumeInput> {
    let mut bytes = Vec::new();
    io::stdin()
        .lock()
        .take(MAX_INPUT_BYTES + 1)
        .read_to_end(&mut bytes)
        .context("cannot read headless resume JSON from stdin")?;
    if bytes.len() as u64 > MAX_INPUT_BYTES {
        anyhow::bail!("headless resume input exceeds 10 MiB")
    }
    let input: HeadlessResumeInput =
        serde_json::from_slice(&bytes).context("invalid headless resume JSON")?;
    if input.approval_id.trim().is_empty() {
        anyhow::bail!("headless resume approval_id must not be empty")
    }
    if input.decided_by.trim().is_empty() {
        anyhow::bail!("headless resume decided_by must not be empty")
    }
    Ok(input)
}

fn read_input() -> Result<HeadlessTurnInput> {
    let mut bytes = Vec::new();
    io::stdin()
        .lock()
        .take(MAX_INPUT_BYTES + 1)
        .read_to_end(&mut bytes)
        .context("cannot read headless turn JSON from stdin")?;
    if bytes.len() as u64 > MAX_INPUT_BYTES {
        anyhow::bail!("headless turn input exceeds 10 MiB")
    }
    let input: HeadlessTurnInput =
        serde_json::from_slice(&bytes).context("invalid headless turn JSON")?;
    if input.task.trim().is_empty() {
        anyhow::bail!("headless turn task must not be empty")
    }
    Ok(input)
}

fn validate_session_id(value: Option<&str>) -> Result<String> {
    match value {
        None | Some("") => Ok(Uuid::new_v4().to_string()),
        Some(value)
            if value.len() <= 128
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_')) =>
        {
            Ok(value.to_string())
        }
        Some(_) => anyhow::bail!("headless turn session_id must be 1-128 ASCII id characters"),
    }
}

fn validate_images(images: Vec<HeadlessImageInput>) -> Result<Vec<ImageAttachment>> {
    if images.len() > 8 {
        anyhow::bail!("headless turn accepts at most 8 images")
    }
    images
        .into_iter()
        .map(|image| {
            if !matches!(
                image.mime_type.as_str(),
                "image/jpeg" | "image/png" | "image/webp" | "image/gif"
            ) {
                anyhow::bail!(
                    "unsupported image MIME type '{}'; use JPEG, PNG, WebP, or GIF",
                    image.mime_type
                )
            }
            if image.data.is_empty() || image.data.len() > 8 * 1024 * 1024 {
                anyhow::bail!("image payload must be 1 byte to 8 MiB of base64 text")
            }
            if !image
                .data
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='))
                || image.data.len() % 4 != 0
                || !has_valid_base64_padding(&image.data)
            {
                anyhow::bail!("image payload is not canonical base64 text")
            }
            Ok(ImageAttachment {
                mime_type: image.mime_type,
                data: image.data,
            })
        })
        .collect()
}

fn has_valid_base64_padding(value: &str) -> bool {
    match value.find('=') {
        None => true,
        Some(index) => {
            let padding = value.len() - index;
            padding <= 2 && value[index..].bytes().all(|byte| byte == b'=')
        }
    }
}

/// Bounded, best-effort summary of a tool call for the `runtime_event`
/// Activity channel (STEP 3, canonical event propagation) — never the
/// full `arguments_json`. Only the two chat tools that exist today
/// (`read_file`'s `path`, `run_command`'s `command` — see
/// `chat/tui/tool_dispatch.rs`'s own arg-key usage, the single source
/// of truth for these key names) are given a readable form; anything
/// else falls back to the bare tool name.
const MAX_TOOL_SUMMARY_CHARS: usize = 160;

fn summarize_tool_call(call: &crate::model::tool::ToolCall) -> String {
    #[derive(Deserialize, Default)]
    struct Args {
        command: Option<String>,
        path: Option<String>,
    }
    let args: Args = serde_json::from_str(&call.arguments_json).unwrap_or_default();
    let raw = match call.name.as_str() {
        "run_command" => args.command.map(|c| format!("Running: {c}")),
        "read_file" => args.path.map(|p| format!("Reading: {p}")),
        _ => None,
    }
    .unwrap_or_else(|| call.name.clone());
    truncate_summary(&redact_secret_like(&raw))
}

/// Coarse, whole-string redaction: if the raw text looks like it might
/// reference a secret, hide the WHOLE string rather than attempt partial
/// masking that could miss a shape nobody anticipated (a command's
/// argument structure is arbitrary shell text, not a known schema).
/// Mirrors `audit-log.sh`'s own secret-masking keyword list
/// (`55-observability-telemetry-law.md`) for consistency with this
/// repo's one other real redaction mechanism, rather than inventing a
/// second, different keyword set.
const SECRET_LIKE_MARKERS: &[&str] = &[
    "SECRET", "TOKEN", "PASSWORD", "API_KEY", "APIKEY", "PRIVATE_KEY", "BEARER",
];

fn redact_secret_like(text: &str) -> String {
    let upper = text.to_uppercase();
    if SECRET_LIKE_MARKERS.iter().any(|marker| upper.contains(marker)) {
        "[redacted — may reference a secret]".to_string()
    } else {
        text.to_string()
    }
}

fn truncate_summary(text: &str) -> String {
    if text.chars().count() <= MAX_TOOL_SUMMARY_CHARS {
        return text.to_string();
    }
    let truncated: String = text.chars().take(MAX_TOOL_SUMMARY_CHARS).collect();
    format!("{truncated}…")
}

/// STEP 3 (canonical RuntimeEvent propagation): every `runtime_event`
/// payload below is intentionally a PROJECTION, not a raw dump —
/// `ToolCompleted` in particular never includes `ToolResultRecord::output`
/// (arbitrary command stdout/stderr or full file contents), only the
/// pass/fail outcome. The bounded terminal-context channel
/// (tools/yana-web/desktop-src/lib/terminal-context.mjs) is the one place
/// raw output travels; Activity events must not become a second,
/// unbounded copy of it. `call_id`/`result.call_id` is the SAME stable
/// identifier across the requested -> approved/denied -> started ->
/// completed lifecycle (`ToolCall.id` / `ToolResultRecord.call_id`,
/// `src/model/tool.rs`) — no synthetic correlation id needed.
///
/// Classified as NOT exposed here, deliberately (see STEP 3's own
/// classification table): `TurnStarted` (carries a full `TurnContext`,
/// redundant with the user's own message already visible), `MessageStarted`
/// (no activity value), `TurnResumed` (developer-only correlation detail),
/// `MessageCompleted` (would duplicate the full assistant reply through a
/// second channel — the existing `text_delta` stream is already the one
/// place that text travels).
fn write_event(output: &mut impl Write, event: RuntimeEvent) -> Result<()> {
    let payload = match event {
        RuntimeEvent::TextDelta(text) => Some(json!({ "type": "text_delta", "text": text })),
        RuntimeEvent::Metrics(usage) => Some(json!({
            "type": "metrics",
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
        })),
        RuntimeEvent::AuthorityDenied { authority, reason } => Some(json!({
            "type": "authority_denied",
            "authority": authority.label(),
            "reason": reason,
        })),
        RuntimeEvent::Cancelled { partial } => {
            Some(json!({ "type": "cancelled", "partial": partial }))
        }
        RuntimeEvent::Error { message } => Some(json!({ "type": "error", "message": message })),
        RuntimeEvent::ToolRequested(call) => Some(json!({
            "type": "runtime_event",
            "kind": "tool_requested",
            "call_id": call.id,
            "tool": call.name,
            "summary": summarize_tool_call(&call),
        })),
        RuntimeEvent::ToolApproved { call_id } => Some(json!({
            "type": "runtime_event",
            "kind": "tool_approved",
            "call_id": call_id,
        })),
        RuntimeEvent::ToolDenied { call_id, reason } => Some(json!({
            "type": "runtime_event",
            "kind": "tool_denied",
            "call_id": call_id,
            "reason": reason,
        })),
        RuntimeEvent::HumanApprovalRequired { call, authority, reason } => Some(json!({
            "type": "runtime_event",
            "kind": "human_approval_required",
            "call_id": call.id,
            "tool": call.name.clone(),
            "summary": summarize_tool_call(&call),
            "authority": authority.label(),
            "reason": reason,
        })),
        RuntimeEvent::ToolStarted { call_id } => Some(json!({
            "type": "runtime_event",
            "kind": "tool_started",
            "call_id": call_id,
        })),
        RuntimeEvent::ToolCompleted(result) => Some(json!({
            "type": "runtime_event",
            "kind": "tool_completed",
            "call_id": result.call_id,
            "ok": !result.is_error,
            "denied": result.denied,
        })),
        RuntimeEvent::TurnCompleted { tool_rounds } => Some(json!({
            "type": "runtime_event",
            "kind": "turn_completed",
            "tool_rounds": tool_rounds,
        })),
        _ => None,
    };
    if let Some(payload) = payload {
        write_json_line(output, &payload)?;
    }
    Ok(())
}

fn write_json_line(output: &mut impl Write, value: &serde_json::Value) -> Result<()> {
    serde_json::to_writer(&mut *output, value)?;
    output.write_all(b"\n")?;
    output.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_ids_are_bounded_and_path_neutral() {
        assert_eq!(
            validate_session_id(Some("desktop_01-a")).unwrap(),
            "desktop_01-a"
        );
        assert!(validate_session_id(Some("../escape")).is_err());
        assert!(validate_session_id(Some("contains space")).is_err());
        assert!(validate_session_id(Some(&"x".repeat(129))).is_err());
    }

    #[test]
    fn protocol_events_are_one_json_object_per_line() {
        let mut output = Vec::new();
        write_event(&mut output, RuntimeEvent::TextDelta("xin chào".to_string())).unwrap();
        write_event(
            &mut output,
            RuntimeEvent::Metrics(crate::model::provider::ChatUsage {
                input_tokens: 4,
                output_tokens: 7,
            }),
        )
        .unwrap();
        let lines = String::from_utf8(output).unwrap();
        let parsed = lines
            .lines()
            .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            parsed[0],
            json!({ "type": "text_delta", "text": "xin chào" })
        );
        assert_eq!(parsed[1]["input_tokens"], 4);
        assert_eq!(parsed[1]["output_tokens"], 7);
    }

    #[test]
    fn tool_requested_started_completed_are_serialized_with_shared_call_id() {
        use crate::model::tool::{ToolCall, ToolResultRecord};
        let call = ToolCall {
            id: "call-1".to_string(),
            name: "run_command".to_string(),
            arguments_json: r#"{"command":"cargo test"}"#.to_string(),
        };
        let mut output = Vec::new();
        write_event(&mut output, RuntimeEvent::ToolRequested(call.clone())).unwrap();
        write_event(
            &mut output,
            RuntimeEvent::ToolStarted { call_id: call.id.clone() },
        )
        .unwrap();
        write_event(
            &mut output,
            RuntimeEvent::ToolCompleted(ToolResultRecord {
                call_id: call.id.clone(),
                output: "277 passed".to_string(),
                is_error: false,
                denied: false,
            }),
        )
        .unwrap();

        let lines: Vec<serde_json::Value> = String::from_utf8(output)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();

        assert_eq!(lines[0]["type"], "runtime_event");
        assert_eq!(lines[0]["kind"], "tool_requested");
        assert_eq!(lines[0]["call_id"], "call-1");
        assert_eq!(lines[0]["tool"], "run_command");
        assert_eq!(lines[0]["summary"], "Running: cargo test");

        assert_eq!(lines[1]["kind"], "tool_started");
        assert_eq!(lines[1]["call_id"], "call-1");

        assert_eq!(lines[2]["kind"], "tool_completed");
        assert_eq!(lines[2]["call_id"], "call-1");
        assert_eq!(lines[2]["ok"], true);
        assert_eq!(lines[2]["denied"], false);
        // The one property this event type must never regress: raw tool
        // output never travels through the Activity channel.
        assert!(lines[2].get("output").is_none());

        // Same call_id across all three — the correlation strategy this
        // step relies on (ToolCall.id / ToolResultRecord.call_id), not a
        // synthetic id invented here.
        assert_eq!(lines[0]["call_id"], lines[1]["call_id"]);
        assert_eq!(lines[1]["call_id"], lines[2]["call_id"]);
    }

    #[test]
    fn tool_approved_denied_and_human_approval_required_are_serialized() {
        use crate::model::tool::ToolCall;
        use crate::runtime::AuthorityLayer;

        let mut output = Vec::new();
        write_event(
            &mut output,
            RuntimeEvent::ToolApproved { call_id: "call-2".to_string() },
        )
        .unwrap();
        write_event(
            &mut output,
            RuntimeEvent::ToolDenied {
                call_id: "call-3".to_string(),
                reason: "non-human-initiated turn cannot execute this capability".to_string(),
            },
        )
        .unwrap();
        write_event(
            &mut output,
            RuntimeEvent::HumanApprovalRequired {
                call: ToolCall {
                    id: "call-4".to_string(),
                    name: "run_command".to_string(),
                    arguments_json: r#"{"command":"rm -rf /tmp/x"}"#.to_string(),
                },
                authority: AuthorityLayer::YanaControlPlane,
                reason: "capability 'command.execute' requires explicit human approval".to_string(),
            },
        )
        .unwrap();
        write_event(&mut output, RuntimeEvent::TurnCompleted { tool_rounds: 3 }).unwrap();

        let lines: Vec<serde_json::Value> = String::from_utf8(output)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();

        assert_eq!(lines[0]["kind"], "tool_approved");
        assert_eq!(lines[0]["call_id"], "call-2");
        assert_eq!(lines[1]["kind"], "tool_denied");
        assert_eq!(lines[1]["reason"], "non-human-initiated turn cannot execute this capability");
        assert_eq!(lines[2]["kind"], "human_approval_required");
        assert_eq!(lines[2]["call_id"], "call-4");
        assert_eq!(lines[2]["authority"], "yana_control_plane");
        assert_eq!(lines[3]["kind"], "turn_completed");
        assert_eq!(lines[3]["tool_rounds"], 3);
    }

    #[test]
    fn internal_events_are_dropped_without_panicking() {
        use crate::runtime::{TurnContext, TurnOrigin};
        use crate::session_context::SessionContext;
        use std::path::PathBuf;

        let session = SessionContext::new("s1", PathBuf::from("/tmp/repo"), "anthropic", "m", true);
        let mut output = Vec::new();
        // TurnStarted, MessageStarted, TurnResumed, MessageCompleted: none
        // of these are classified as Activity-relevant (see write_event's
        // own doc comment) — must not panic, must not emit anything.
        write_event(
            &mut output,
            RuntimeEvent::TurnStarted {
                context: TurnContext::new(session, TurnOrigin::Desktop, true),
                provider: "anthropic".to_string(),
                model: "claude".to_string(),
            },
        )
        .unwrap();
        write_event(&mut output, RuntimeEvent::MessageStarted).unwrap();
        write_event(
            &mut output,
            RuntimeEvent::TurnResumed { approval_id: "a1".to_string() },
        )
        .unwrap();
        write_event(
            &mut output,
            RuntimeEvent::MessageCompleted("full assistant reply text".to_string()),
        )
        .unwrap();
        assert!(output.is_empty());
    }

    #[test]
    fn tool_call_summary_redacts_secret_like_text_and_bounds_length() {
        use crate::model::tool::ToolCall;
        let with_secret = ToolCall {
            id: "c".to_string(),
            name: "run_command".to_string(),
            arguments_json: r#"{"command":"curl -H 'Authorization: Bearer sk-abc' https://x"}"#.to_string(),
        };
        let summary = summarize_tool_call(&with_secret);
        assert_eq!(summary, "[redacted — may reference a secret]");
        assert!(!summary.to_uppercase().contains("BEARER"));

        let long = ToolCall {
            id: "c2".to_string(),
            name: "run_command".to_string(),
            arguments_json: format!(r#"{{"command":"{}"}}"#, "x".repeat(500)),
        };
        assert!(summarize_tool_call(&long).chars().count() <= MAX_TOOL_SUMMARY_CHARS + 1);

        let normal = ToolCall {
            id: "c3".to_string(),
            name: "read_file".to_string(),
            arguments_json: r#"{"path":"src/main.rs"}"#.to_string(),
        };
        assert_eq!(summarize_tool_call(&normal), "Reading: src/main.rs");
    }

    #[test]
    fn images_are_bounded_and_mime_checked() {
        let images = validate_images(vec![HeadlessImageInput {
            mime_type: "image/png".to_string(),
            data: "aGVsbG8=".to_string(),
        }])
        .unwrap();
        assert_eq!(images[0].mime_type, "image/png");
        assert!(validate_images(vec![HeadlessImageInput {
            mime_type: "text/html".to_string(),
            data: "aGVsbG8=".to_string(),
        }])
        .is_err());
        assert!(validate_images(vec![HeadlessImageInput {
            mime_type: "image/png".to_string(),
            data: "not base64!".to_string(),
        }])
        .is_err());
        assert!(validate_images(vec![HeadlessImageInput {
            mime_type: "image/png".to_string(),
            data: "a=bc".to_string(),
        }])
        .is_err());
    }
}
