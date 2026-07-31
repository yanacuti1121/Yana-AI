//! Approval-state key handling + tool execution — the
//! `TurnState::AwaitingApproval` / `TurnState::ExecutingTool` half of the
//! turn loop. Split out of `tui.rs` (see that file's module doc) purely
//! for line-count budget.

use super::super::tools::run_command;
use super::{App, PendingApproval, ToolExecEvent, TurnState};
use crossterm::event::{KeyCode, KeyEvent};
use std::sync::mpsc;
use std::thread;
use std::time::Instant;

impl App {
    /// Dispatches a keypress while `self.turn` is `AwaitingApproval`.
    /// When `guard_verdict.is_some()` (`check_command()` denied it), only
    /// Enter/Esc acknowledge-and-abort are honored — no y-path exists at
    /// all, the literal enforcement of "no override on a guard denial."
    pub(super) fn handle_approval_key(&mut self, key: KeyEvent) {
        let TurnState::AwaitingApproval(pending) = &self.turn else { return };
        if pending.guard_verdict.is_some() {
            if matches!(key.code, KeyCode::Enter | KeyCode::Esc) {
                self.acknowledge_denied();
            }
            return;
        }
        match key.code {
            KeyCode::Char('y') | KeyCode::Char('Y') => self.execute_approved_tool(),
            KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => self.decline_tool(),
            _ => {}
        }
    }

    fn acknowledge_denied(&mut self) {
        let TurnState::AwaitingApproval(pending) = std::mem::replace(&mut self.turn, TurnState::Idle) else {
            return;
        };
        let reason = pending.guard_verdict.unwrap_or("blocked");
        self.push_tool_result(&pending.call_id, format!("blocked by guard: {reason}"), true, true);
        self.continue_after_tool_result();
    }

    fn decline_tool(&mut self) {
        let TurnState::AwaitingApproval(pending) = std::mem::replace(&mut self.turn, TurnState::Idle) else {
            return;
        };
        self.push_tool_result(&pending.call_id, "user declined to execute this command".to_string(), false, true);
        self.continue_after_tool_result();
    }

    /// Re-invokes the model after a denial/decline so it can adapt — a
    /// denied/declined round still counts toward `tool_rounds`' ceiling,
    /// same as an executed one, so repeatedly proposing (and getting
    /// declined) can't loop forever either.
    fn continue_after_tool_result(&mut self) {
        self.tool_rounds.record_round();
        if self.tool_rounds.exceeded() {
            self.status = "tool-call limit reached for this turn — aborting to avoid a runaway loop".to_string();
            return;
        }
        self.spawn_turn();
    }

    fn execute_approved_tool(&mut self) {
        let TurnState::AwaitingApproval(pending) = std::mem::replace(&mut self.turn, TurnState::Idle) else {
            return;
        };
        let PendingApproval { call_id, argv, command: _, guard_verdict: _ } = pending;
        let use_sandbox = self.use_sandbox;
        let (tx, rx) = mpsc::channel::<ToolExecEvent>();
        thread::spawn(move || {
            let result = run_command::execute(&argv, use_sandbox);
            tx.send(ToolExecEvent::Done(result)).ok();
        });
        self.turn = TurnState::ExecutingTool { call_id, rx };
        self.turn_started_at = Some(Instant::now());
    }
}

/// Drains a pending `ToolExecEvent` for the in-flight execution (if any)
/// before the next draw — mirrors `drain_stream_events`'s
/// avoid-double-borrow structure in `tui.rs` for the same reason (can't
/// hold `&app.turn` to read the `Receiver` while also needing `&mut
/// self` to finish up).
pub(super) fn drain_tool_exec_events(app: &mut App) {
    let TurnState::ExecutingTool { call_id, rx } = &app.turn else { return };
    let ToolExecEvent::Done(result) = match rx.try_recv() {
        Ok(ev) => ev,
        Err(_) => return, // still running or disconnected — nothing to do this tick
    };
    let call_id = call_id.clone();
    app.turn_started_at = None;
    app.turn = TurnState::Idle;
    match result {
        Ok(outcome) => {
            let mut text = outcome.stdout;
            if !outcome.stderr.is_empty() {
                text.push_str("\n[stderr]\n");
                text.push_str(&outcome.stderr);
            }
            if outcome.truncated {
                text.push_str("\n[output truncated]");
            }
            let is_error = outcome.exit_code != Some(0);
            if is_error {
                text = format!("[exit code {}]\n{text}", outcome.exit_code.map_or("unknown".to_string(), |c| c.to_string()));
            }
            app.push_tool_result(&call_id, text, is_error, false);
        }
        Err(e) => app.push_tool_result(&call_id, format!("execution failed: {e}"), true, false),
    }
    // Same private method the y/N-decline paths above use — both are
    // "a tool round just concluded, count it and re-invoke if under the
    // ceiling," whether the round ended in a denial or a real execution.
    app.continue_after_tool_result();
}
