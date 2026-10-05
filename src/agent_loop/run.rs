//! `AgentRun::run`: one run of the agent on a saved session.

use super::record::{to_chat, Recorder};
use super::watchdog::{Watchdog, POLL};
use super::{Clock, Limit, RunError, RunLimits, RunReport, RunStatus};
use crate::model::provider::{ChatProvider, ChatUsage};
use crate::model::tool::ToolSpec;
use crate::runtime::{
    reason_with_disclosure, CancellationToken, LimitKind, PendingApprovalStore, RuntimeAuthority, RuntimeEvent, ToolExecutor, TurnContext,
    TurnEngine, TurnError, TurnLimits, TurnOutcome, TurnRequest,
};
use crate::session_db::{EndReason, SessionDbError, SessionRow, SessionStore, SqliteSessionStore};
use chrono::Utc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// How long a pending approval made by a run stays open, in minutes.
const APPROVAL_TTL_MINUTES: u64 = 60 * 24;

/// What one run needs.
pub(crate) struct RunInput<'a> {
    pub store: &'a SqliteSessionStore,
    pub session_id: String,
    pub title: String,
    pub context: TurnContext,
    pub model: String,
    pub system: Option<String>,
    pub tools: Vec<ToolSpec>,
    pub api_key: Option<String>,
    pub user_message: String,
    pub limits: RunLimits,
    /// The caller's token. The run uses a child of it, so a limit stopping this run never
    /// cancels the caller, and cancelling the caller stops the run.
    pub cancellation: CancellationToken,
}

pub(crate) struct AgentRun {
    provider: Arc<dyn ChatProvider>,
    authority: Arc<dyn RuntimeAuthority>,
    executor: Arc<dyn ToolExecutor>,
    clock: Arc<dyn Clock>,
    poll: Duration,
}

fn store_error(error: SessionDbError) -> RunError {
    match error {
        SessionDbError::Busy(id) => RunError::Busy(id),
        other => RunError::Store(other.to_string()),
    }
}

impl AgentRun {
    pub(crate) fn new(provider: Arc<dyn ChatProvider>, authority: Arc<dyn RuntimeAuthority>, executor: Arc<dyn ToolExecutor>, clock: Arc<dyn Clock>) -> Self {
        Self { provider, authority, executor, clock, poll: POLL }
    }

    #[cfg(test)]
    pub(crate) fn with_poll(mut self, poll: Duration) -> Self {
        self.poll = poll;
        self
    }

    /// Run one user message to a stopping point. Every event is passed to `sink` after it
    /// has been saved. Nothing is run when the session cannot be locked or opened.
    pub(crate) fn run(&self, input: RunInput<'_>, sink: &mut dyn FnMut(RuntimeEvent)) -> Result<RunReport, RunError> {
        let _lock = input.store.lock_session(&input.session_id).map_err(store_error)?;
        let now = Utc::now().to_rfc3339();
        input
            .store
            .create_session(&SessionRow {
                id: input.session_id.clone(),
                title: input.title.clone(),
                provider: self.provider.name().to_string(),
                model: input.model.clone(),
                cwd: Some(input.context.session.repo_root.display().to_string()),
                created_at: now.clone(),
                updated_at: now,
                ended_at: None,
                end_reason: None,
                message_count: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            })
            .map_err(store_error)?;
        let saved = input.store.load_messages(&input.session_id).map_err(store_error)?;
        let mut history: Vec<_> = saved.iter().map(to_chat).collect();
        let mut recorder = Recorder::new(input.store, &input.session_id, u32::try_from(saved.len()).unwrap_or(u32::MAX));
        recorder.user(&input.user_message);
        if let Some(error) = recorder.error.take() {
            return Err(RunError::Store(error));
        }
        history.push(crate::model::provider::ChatMessage::text(crate::model::provider::Role::User, input.user_message.clone()));

        let token = input.cancellation.child();
        let last_event = Arc::new(AtomicU64::new(self.clock.now_ms()));
        let watchdog = Watchdog::spawn(Arc::clone(&self.clock), &input.limits, token.clone(), Arc::clone(&last_event), self.poll);
        let mut request = TurnRequest::new(input.context.clone(), input.model.clone(), history)
            .with_tools(input.tools.clone())
            .with_limits(TurnLimits { max_input_tokens: input.limits.max_input_tokens, max_output_tokens: input.limits.max_output_tokens });
        if let Some(system) = &input.system {
            request = request.with_system(system.clone());
        }
        if let Some(key) = &input.api_key {
            request = request.with_api_key(key.clone());
        }
        let engine = TurnEngine::new(Arc::clone(&self.provider), Arc::clone(&self.authority), Arc::clone(&self.executor)).with_max_tool_rounds(input.limits.max_tool_rounds);
        let mut emit = |event: RuntimeEvent| {
            last_event.store(self.clock.now_ms(), Ordering::Release);
            recorder.on_event(&event);
            if recorder.error.is_some() {
                token.cancel();
            }
            sink(event);
        };
        let outcome = engine.run(request, &token, &mut emit);
        let fired = watchdog.finish();
        if let Some(error) = recorder.error.take() {
            let _ = input.store.finish_session(&input.session_id, EndReason::Crashed);
            return Ok(report(RunStatus::Failed(format!("could not save the conversation: {error}")), String::new(), ChatUsage::default(), 0, &input.session_id));
        }
        let (status, message, usage, rounds, end) = match outcome {
            Ok(TurnOutcome::Completed { message, usage, tool_rounds, .. }) => (RunStatus::Completed, message, usage, tool_rounds, EndReason::Completed),
            Ok(TurnOutcome::Cancelled { partial }) => {
                let status = fired.map_or(RunStatus::Cancelled, RunStatus::LimitReached);
                (status, partial, ChatUsage::default(), 0, EndReason::Cancelled)
            }
            Ok(TurnOutcome::AwaitingApproval { call, continuation_messages, usage, tool_rounds }) => {
                let reason = reason_with_disclosure(&input.context.session.repo_root, &call, recorder.approval_reason.take());
                let made = reason.map_err(|e| e.to_string()).and_then(|reason| {
                    PendingApprovalStore::for_root(&input.context.session.repo_root)
                        .create(input.context.clone(), input.model.clone(), input.system.clone(), continuation_messages, tool_rounds, call, reason, APPROVAL_TTL_MINUTES)
                        .map_err(|e| e.to_string())
                });
                // A paused session is recorded as cancelled: the run did stop, and a session
                // left open with no lock holder would be taken for a crash (WS4 `recover`).
                match made {
                    Ok(pending) => (RunStatus::AwaitingApproval(pending.approval_id), String::new(), usage, tool_rounds, EndReason::Cancelled),
                    Err(why) => (RunStatus::Failed(format!("cannot ask for approval: {why}")), String::new(), usage, tool_rounds, EndReason::Cancelled),
                }
            }
            Err(error) => {
                let limit = match &error {
                    TurnError::ToolRoundLimit { .. } => Some(Limit::ToolRounds),
                    TurnError::BudgetExceeded { kind: LimitKind::InputTokens, .. } => Some(Limit::InputTokens),
                    TurnError::BudgetExceeded { kind: LimitKind::OutputTokens, .. } => Some(Limit::OutputTokens),
                    _ => None,
                };
                let status = limit.map_or_else(|| RunStatus::Failed(error.to_string()), RunStatus::LimitReached);
                (status, String::new(), ChatUsage::default(), 0, EndReason::Cancelled)
            }
        };
        let _ = input.store.finish_session(&input.session_id, end);
        Ok(report(status, message, usage, rounds, &input.session_id))
    }
}

fn report(status: RunStatus, final_message: String, usage: ChatUsage, tool_rounds: usize, session_id: &str) -> RunReport {
    RunReport { status, final_message, usage, tool_rounds, session_id: session_id.to_string() }
}
