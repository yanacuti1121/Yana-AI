//! `App::handle_tool_calls` and its per-tool dispatch — the turn-loop
//! side of a completed `StreamOutcome::ToolCalls`. Split out of
//! `turn.rs` (see that file's module doc) purely for line-count budget.
//!
//! `read_file` runs synchronously right here and immediately re-invokes
//! the model (no approval needed — read-only, per anh's explicit
//! decision that only `run_command` needs a human gate). `run_command`
//! instead parks the turn in `TurnState::AwaitingApproval` and returns —
//! `approval.rs` picks up from there once a key arrives.

use super::super::provider::{ChatMessage, Role};
use super::super::tool_types::{ToolCall, ToolCallRecord, ToolResultRecord};
use super::super::tools;
use super::{App, PendingApproval, TurnState};

impl App {
    /// Records a round against `self.tool_rounds` (aborting the turn if
    /// the ceiling is hit), rejects more than one simultaneous call as an
    /// explicit MVP limitation (never a silent drop — the model would
    /// otherwise believe calls happened that never did), persists +
    /// pushes the tool_call turn itself, then dispatches by name.
    pub(super) fn handle_tool_calls(&mut self, calls: Vec<ToolCall>) {
        self.tool_rounds.record_round();
        if self.tool_rounds.exceeded() {
            self.status = "tool-call limit reached for this turn — aborting to avoid a runaway loop".to_string();
            return;
        }
        if calls.len() > 1 {
            self.status = "model requested multiple simultaneous tool calls — unsupported in this MVP".to_string();
            return;
        }
        let Some(call) = calls.into_iter().next() else {
            // The accumulator can legitimately produce zero calls (every
            // fragment was nameless — a malformed-stream signal, not a
            // real call, see `tool_types::ToolCallAccumulator::finish`).
            self.status = "model's tool-call stream produced no usable call — ignoring".to_string();
            return;
        };

        let record: ToolCallRecord = call.clone().into();
        if let Err(e) =
            super::super::history::append_tool_call(&self.session_id, self.provider.name(), &self.model, &record)
        {
            self.status = format!("warning: failed to persist tool call: {e}");
        }
        let mut msg = ChatMessage::text(Role::Assistant, "");
        msg.tool_call = Some(record);
        self.history.push(msg);

        match call.name.as_str() {
            "read_file" => self.dispatch_read_file(&call),
            "run_command" => self.dispatch_run_command(&call),
            other => {
                self.status = format!("model requested unknown tool '{other}' — aborting turn");
            }
        }
    }

    fn dispatch_read_file(&mut self, call: &ToolCall) {
        let (output, is_error) = match parse_string_arg(&call.arguments_json, "path") {
            Some(path) => match tools::read_file::execute(&self.repo_root, &path) {
                Ok(content) => (content, false),
                Err(e) => (e, true),
            },
            None => ("missing required argument 'path'".to_string(), true),
        };
        self.push_tool_result(&call.id, output, is_error, false);
        self.spawn_turn();
    }

    fn dispatch_run_command(&mut self, call: &ToolCall) {
        let Some(command) = parse_string_arg(&call.arguments_json, "command") else {
            self.push_tool_result(&call.id, "missing required argument 'command'".to_string(), true, false);
            self.spawn_turn();
            return;
        };
        match tools::run_command::validate(&command) {
            Ok(v) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval {
                    call_id: call.id.clone(),
                    command,
                    argv: v.argv,
                    guard_verdict: v.guard_verdict,
                });
            }
            Err(e) => {
                self.push_tool_result(&call.id, format!("cannot parse command: {e}"), true, false);
                self.spawn_turn();
            }
        }
    }

    /// Persists + pushes a tool-result turn (see `history.rs`'s module
    /// doc for the `role: User` / empty-`content` convention). Shared by
    /// the read_file/run_command dispatch paths above and by
    /// `approval.rs`'s post-execution/denial handling.
    pub(super) fn push_tool_result(&mut self, call_id: &str, output: String, is_error: bool, denied: bool) {
        let record = ToolResultRecord { call_id: call_id.to_string(), output, is_error, denied };
        if let Err(e) = super::super::history::append_tool_result(&self.session_id, &record) {
            self.status = format!("warning: failed to persist tool result: {e}");
        }
        let mut msg = ChatMessage::text(Role::User, "");
        msg.tool_result = Some(record);
        self.history.push(msg);
    }
}

/// Pulls a single string field out of a tool call's raw `arguments_json`.
/// Malformed/missing → `None`, handled by each dispatch site as a normal
/// tool-result error, not a panic or a silently-empty argument.
fn parse_string_arg(arguments_json: &str, key: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(arguments_json).ok()?;
    v.get(key)?.as_str().map(|s| s.to_string())
}
