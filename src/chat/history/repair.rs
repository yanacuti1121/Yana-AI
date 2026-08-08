//! Repairs a dangling tool_call left in `--resume`d history by a crash or
//! force-quit between `append_tool_call()` (written the instant a model
//! proposes `run_command`) and the matching `push_tool_result()` (written
//! only after the human approves/declines AND, for an approval, the
//! command finishes executing — see `tui/tool_dispatch.rs` and
//! `tui/approval.rs`). That window can be arbitrarily long: a human can
//! walk away from the "Run this command? y/N" prompt, or the command
//! itself can run for a while under `sandbox-exec.sh`.
//!
//! Because history is append-only and nothing else gets appended while a
//! turn is parked in `TurnState::AwaitingApproval`/`ExecutingTool`, a
//! dangling tool_call can only ever be the LAST line in a session file —
//! a completed round always has its tool_result immediately follow its
//! tool_call. Checking just the trailing message is therefore sufficient,
//! not a heuristic.
//!
//! Left unrepaired, resuming such a session sends a message sequence to
//! the provider with a tool_call turn and no matching tool_result turn —
//! both Anthropic and the OpenAI-compatible wire format reject that
//! shape outright, so the entire session would be unusable until someone
//! hand-edited the `.jsonl` file. This mirrors `turn.rs`'s existing
//! "keep the partial reply as context" handling for a stream that dies
//! mid-response — same philosophy, applied to the tool-call/tool-result
//! pair instead of a single assistant turn.

use super::super::provider::{ChatMessage, Role};
use super::super::tool_types::ToolResultRecord;
use anyhow::Result;

/// Returns `Ok(true)` if a dangling tool_call was found and repaired
/// (both in `messages` and persisted back to the session file — so a
/// second `--resume` of the same session doesn't need to repair it
/// again), `Ok(false)` if the history was already well-formed.
pub fn repair_dangling_tool_call(
    session_id: &str,
    messages: &mut Vec<ChatMessage>,
) -> Result<bool> {
    let Some(last) = messages.last() else {
        return Ok(false);
    };
    let Some(call) = &last.tool_call else {
        return Ok(false);
    };

    let record = ToolResultRecord {
        call_id: call.id.clone(),
        output: "interrupted — yana-rt exited (crash or force-quit) before this tool call \
                 was resolved; the actual outcome is unknown, do not assume it succeeded or \
                 failed"
            .to_string(),
        is_error: true,
        denied: false,
    };
    super::append_tool_result(session_id, &record)?;

    let mut msg = ChatMessage::text(Role::User, "");
    msg.tool_result = Some(record);
    messages.push(msg);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::tool_types::ToolCallRecord;
    use uuid::Uuid;

    fn unique_session_id() -> String {
        Uuid::new_v4().to_string()
    }

    fn cleanup(session_id: &str) {
        let _ = std::fs::remove_file(super::super::history_path(session_id));
    }

    #[test]
    fn repairs_a_trailing_dangling_tool_call() {
        let session_id = unique_session_id();
        let call = ToolCallRecord {
            id: "call_1".to_string(),
            name: "run_command".to_string(),
            arguments_json: "{\"command\":\"ls\"}".to_string(),
        };
        super::super::append_tool_call(&session_id, "anthropic", "claude-sonnet-4-6", &call)
            .unwrap();
        let mut messages = super::super::load(&session_id).unwrap();
        assert_eq!(messages.len(), 1);

        let repaired = repair_dangling_tool_call(&session_id, &mut messages).unwrap();
        assert!(repaired);
        assert_eq!(messages.len(), 2);
        let result = messages[1].tool_result.as_ref().unwrap();
        assert_eq!(result.call_id, "call_1");
        assert!(result.is_error);
        assert!(!result.denied);

        // Persisted, not just in-memory — reloading the same session must
        // already show the repair without repairing it a second time.
        let reloaded = super::super::load(&session_id).unwrap();
        assert_eq!(reloaded.len(), 2);
        assert!(!repair_dangling_tool_call(&session_id, &mut reloaded.clone()).unwrap());

        cleanup(&session_id);
    }

    #[test]
    fn does_not_touch_a_well_formed_session() {
        let session_id = unique_session_id();
        super::super::append_user(&session_id, "hi").unwrap();
        super::super::append_assistant(
            &session_id,
            "anthropic",
            "claude-sonnet-4-6",
            "hello",
            5,
            5,
            10,
            false,
            None,
        )
        .unwrap();
        let mut messages = super::super::load(&session_id).unwrap();

        assert!(!repair_dangling_tool_call(&session_id, &mut messages).unwrap());
        assert_eq!(messages.len(), 2); // nothing synthesized

        cleanup(&session_id);
    }

    #[test]
    fn empty_history_is_not_a_dangling_call() {
        let mut messages = Vec::new();
        assert!(!repair_dangling_tool_call("nonexistent", &mut messages).unwrap());
    }
}
