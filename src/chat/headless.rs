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
