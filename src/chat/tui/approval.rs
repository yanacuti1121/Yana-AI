//! Approval-state key handling + tool execution — the
//! `TurnState::AwaitingApproval` / `TurnState::ExecutingTool` half of the
//! turn loop. Split out of `tui.rs` (see that file's module doc) purely
//! for line-count budget.

use super::super::tools::run_command;
use super::tool_dispatch::ChatCapabilityExecutor;
use super::{App, PendingApproval, ToolExecEvent, TurnState};
use crate::runtime::{
    execute_approved_tool, CancellationToken, TurnContext, TurnOrigin, YanaAuthorityChain,
};
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
        let TurnState::AwaitingApproval(pending) = &self.turn else {
            return;
        };
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
        let TurnState::AwaitingApproval(pending) =
            std::mem::replace(&mut self.turn, TurnState::Idle)
        else {
            return;
        };
        let reason = pending.guard_verdict.unwrap_or("blocked");
        self.push_tool_result(
            &pending.call.id,
            format!("blocked by guard: {reason}"),
            true,
            true,
        );
        self.continue_after_tool_result();
    }

    pub(super) fn decline_tool(&mut self) {
        let TurnState::AwaitingApproval(pending) =
            std::mem::replace(&mut self.turn, TurnState::Idle)
        else {
            return;
        };
        self.push_tool_result(
            &pending.call.id,
            "user declined to execute this command".to_string(),
            false,
            true,
        );
        self.continue_after_tool_result();
    }

    /// Re-invokes the canonical runtime after a denial/decline so the model
    /// can adapt. The runtime counted the proposed call before returning
    /// `AwaitingApproval`, so this continuation must not count it twice.
    ///
    /// `pub(super)`: also used by `tool_dispatch.rs`'s `prepare_pending_approval`
    /// error branches (unsupported tool / missing argument / unparseable
    /// command), which must not re-invoke the turn loop via a bare
    /// `spawn_turn()` that skips the round-limit check — see that module's
    /// doc comment.
    pub(super) fn continue_after_tool_result(&mut self) {
        if self.tool_rounds.exceeded() {
            self.status =
                "tool-call limit reached for this turn — aborting to avoid a runaway loop"
                    .to_string();
            return;
        }
        self.spawn_turn();
    }

    fn execute_approved_tool(&mut self) {
        let TurnState::AwaitingApproval(pending) =
            std::mem::replace(&mut self.turn, TurnState::Idle)
        else {
            return;
        };
        let PendingApproval {
            call,
            argv,
            command,
            guard_verdict: _,
        } = pending;
        match run_command::validate(&command) {
            Ok(validated) if validated.guard_verdict.is_none() && validated.argv == argv => {
                // Exact argv revalidation passed. The canonical approved-tool
                // runtime repeats validation inside its opaque approval path
                // before executing, so this check only protects the TUI's
                // displayed proposal from changing between prompt and y.
            }
            Ok(validated) => {
                let reason = validated
                    .guard_verdict
                    .unwrap_or("command changed after approval validation");
                self.push_tool_result(
                    &call.id,
                    format!("blocked during execution revalidation: {reason}"),
                    true,
                    true,
                );
                self.continue_after_tool_result();
                return;
            }
            Err(error) => {
                self.push_tool_result(
                    &call.id,
                    format!("execution revalidation failed: {error}"),
                    true,
                    true,
                );
                self.continue_after_tool_result();
                return;
            }
        }
        let context = TurnContext::new(self.session_context(), TurnOrigin::Terminal, true);
        let call_id = call.id.clone();
        let executor = ChatCapabilityExecutor::new(self.use_sandbox);
        let (tx, rx) = mpsc::channel::<ToolExecEvent>();
        thread::spawn(move || {
            let result = execute_approved_tool(
                &YanaAuthorityChain,
                &executor,
                &context,
                &call,
                &CancellationToken::default(),
                &mut |_| {},
            );
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
    let TurnState::ExecutingTool { call_id, rx } = &app.turn else {
        return;
    };
    let ToolExecEvent::Done(result) = match rx.try_recv() {
        Ok(ev) => ev,
        Err(_) => return, // still running or disconnected — nothing to do this tick
    };
    let call_id = call_id.clone();
    app.turn_started_at = None;
    app.turn = TurnState::Idle;
    match result {
        Ok(record) => app.push_tool_result(&call_id, record.output, record.is_error, record.denied),
        Err(error) => app.push_tool_result(
            &call_id,
            format!("execution denied after approval: {error}"),
            true,
            true,
        ),
    }
    // Same private method the y/N-decline paths above use — both are
    // "a tool round just concluded, count it and re-invoke if under the
    // ceiling," whether the round ended in a denial or a real execution.
    app.continue_after_tool_result();
}
