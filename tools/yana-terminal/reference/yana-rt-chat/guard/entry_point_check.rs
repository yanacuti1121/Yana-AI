//! guard entry-point-check — advisory reminder for fragile entry-point files.
//!
//! See core/rules/71-entry-point-verify-law.md for the full rationale:
//! scripts/yana-rt-wrapper.js shipped twice with bugs (2026-07-07 self-
//! recursion, 2026-07-09 a stray leading blank line before the shebang) that
//! diff review and unit-level logic tests both missed, because the failure
//! mode was "the file can't even exec", not a logic bug inside it.
//!
//! This is a PostToolUse(Write|Edit|MultiEdit) hook — the write has already
//! happened by the time it runs, so it can only advise (additionalContext),
//! never deny. Its job is to make the requirement impossible to miss: after
//! touching a registered entry-point file, dispatch an independent
//! verify-agent to real-`exec()` it, not just re-read the diff.

use super::blast_paths::{entry_point_hit, entry_point_prefixes};
use serde::Deserialize;
use std::io::Read;

#[derive(Deserialize, Default)]
struct ToolInput {
    path: Option<String>,
    file_path: Option<String>,
    target_file: Option<String>,
}

#[derive(Deserialize, Default)]
struct HookEvent {
    tool_name: Option<String>,
    #[serde(default)]
    tool_input: ToolInput,
}

/// Is this tool name a write/edit-class tool? Same set self_mod.rs guards.
fn is_write_tool(name: &str) -> bool {
    matches!(
        name,
        "write_file"
            | "Write"
            | "create_file"
            | "edit_file"
            | "Edit"
            | "MultiEdit"
            | "str_replace_based_edit"
            | "str_replace_editor"
            | "overwrite_file"
            | "patch_file"
    )
}

/// Extract the target path from any write-class tool input.
fn extract_path(input: &ToolInput) -> Option<String> {
    input
        .path
        .clone()
        .or_else(|| input.file_path.clone())
        .or_else(|| input.target_file.clone())
}

fn advise_json(hit: &str, target: &str) {
    let msg = format!(
        "'{target}' is a registered fragile entry point (matched: '{hit}') per \
         core/rules/71-entry-point-verify-law.md. A syntactic mistake here can break the \
         whole tool, not just a code path — dispatch an independent verify-agent (or \
         spec-verifier) to real-exec() this file (not `node file.js` / re-reading the diff / \
         trusting a prior test run) before treating this change as verified."
    );
    let out = serde_json::json!({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": msg
        }
    });
    println!("{out}");
}

pub fn cmd_entry_point_check() -> i32 {
    let mut buf = String::new();
    if std::io::stdin().read_to_string(&mut buf).is_err() {
        // Advisory-only hook: an unreadable payload just means we can't
        // advise this time. Nothing to deny (the write already happened),
        // so fail open rather than block the session on a hook-input error.
        return 0;
    }

    let event: HookEvent = serde_json::from_str(&buf).unwrap_or_default();
    let tool = event.tool_name.as_deref().unwrap_or("");
    if !is_write_tool(tool) {
        return 0;
    }

    let target = match extract_path(&event.tool_input) {
        Some(p) if !p.is_empty() => p,
        _ => return 0,
    };

    if let Some(hit) = entry_point_hit(&target, &entry_point_prefixes()) {
        advise_json(&hit, &target);
    }

    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_payload(tool: &str, path: &str) -> String {
        serde_json::json!({
            "tool_name": tool,
            "tool_input": { "path": path }
        })
        .to_string()
    }

    /// Parses payload and returns Some(hit prefix) if the reminder would
    /// fire, without touching stdout — mirrors self_mod.rs's test harness.
    fn would_advise(payload: &str) -> Option<String> {
        let event: HookEvent = serde_json::from_str(payload).unwrap_or_default();
        let tool = event.tool_name.as_deref().unwrap_or("");
        if !is_write_tool(tool) {
            return None;
        }
        let target = extract_path(&event.tool_input)?;
        entry_point_hit(&target, &entry_point_prefixes())
    }

    #[test]
    fn advises_on_registered_entry_point_write() {
        assert!(would_advise(&make_payload("Write", "scripts/yana-rt-wrapper.js")).is_some());
    }

    #[test]
    fn advises_on_registered_entry_point_edit() {
        assert!(would_advise(&make_payload("Edit", "scripts/yana-rt-wrapper.js")).is_some());
    }

    #[test]
    fn advises_on_registered_entry_point_multi_edit() {
        // MultiEdit uses `file_path`, not `path` — exercise that fallback
        // branch of extract_path(), not just the Write/Edit `path` field.
        let payload = serde_json::json!({
            "tool_name": "MultiEdit",
            "tool_input": { "file_path": "scripts/yana-rt-wrapper.js" }
        })
        .to_string();
        assert!(would_advise(&payload).is_some());
    }

    #[test]
    fn silent_on_unrelated_file() {
        assert!(would_advise(&make_payload("Write", "src/main.rs")).is_none());
    }

    #[test]
    fn silent_on_read_tool() {
        assert!(would_advise(&make_payload("Read", "scripts/yana-rt-wrapper.js")).is_none());
    }

    #[test]
    fn silent_when_no_path_in_payload() {
        let payload = serde_json::json!({ "tool_name": "Write", "tool_input": {} }).to_string();
        assert!(would_advise(&payload).is_none());
    }
}
