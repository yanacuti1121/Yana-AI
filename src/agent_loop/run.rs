//! `AgentRun::run`: one run of the agent on a saved session.

use super::record::{repair_dangling_call, to_chat, Recorder};
use super::watchdog::{Watchdog, POLL};
use super::{Clock, Limit, RunError, RunLimits, RunReport, RunStatus};
use crate::model::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use crate::model::tool::ToolSpec;
use crate::runtime::{
    reason_with_disclosure, CancellationToken, LimitKind, PendingApprovalStore, RuntimeAuthority, RuntimeEvent, ToolExecutor, TurnContext,
    TurnEngine, TurnError, TurnLimits, TurnOutcome, TurnRequest,
};
use crate::session_db::{EndReason, SessionDbError, SessionRow, SessionStore, SqliteSessionStore};
use chrono::Utc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// How long a pending approval made by a run stays open, in minutes (one day).
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

/// What the run has seen so far, kept for every way it can end.
#[derive(Default)]
struct Progress {
    usage: ChatUsage,
    rounds: usize,
    text: String,
}

fn store_error(error: SessionDbError) -> RunError {
    match error {
        SessionDbError::Busy(id) => RunError::Busy(id),
        other => RunError::Store(other.to_string()),
    }
}

fn new_session_row(input: &RunInput<'_>, provider: &str) -> SessionRow {
    let now = Utc::now().to_rfc3339();
    SessionRow {
        id: input.session_id.clone(),
        title: input.title.clone(),
        provider: provider.to_string(),
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
    }
}

fn add_usage(total: &mut ChatUsage, more: &ChatUsage) {
    total.input_tokens = total.input_tokens.saturating_add(more.input_tokens);
    total.output_tokens = total.output_tokens.saturating_add(more.output_tokens);
    total.cache_read_tokens = total.cache_read_tokens.saturating_add(more.cache_read_tokens);
    total.cache_write_tokens = total.cache_write_tokens.saturating_add(more.cache_write_tokens);
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

    /// Run one user message to a stopping point. Every event is saved, then passed to
    /// `sink`. Nothing is run when the session cannot be locked or opened.
    pub(crate) fn run(&self, input: RunInput<'_>, sink: &mut dyn FnMut(RuntimeEvent)) -> Result<RunReport, RunError> {
        let _lock = input.store.lock_session(&input.session_id).map_err(store_error)?;
        input.store.create_session(&new_session_row(&input, self.provider.name())).map_err(store_error)?;
        let mut saved = input.store.load_messages(&input.session_id).map_err(store_error)?;
        // A call left waiting (for approval, or by a run that stopped) gets a result before
        // anything new is added, so the model is never sent a call that has no answer.
        if let Some(row) = repair_dangling_call(input.store, &saved).map_err(RunError::Store)? {
            saved.push(row);
        }
        let mut history: Vec<ChatMessage> = saved.iter().map(to_chat).collect();
        let mut recorder = Recorder::new(input.store, &input.session_id, saved.iter().map(|m| m.seq).max().unwrap_or(0));
        recorder.user(&input.user_message);
        if let Some(error) = recorder.error.take() {
            return Err(RunError::Store(error));
        }
        history.push(ChatMessage::text(Role::User, input.user_message.clone()));
        let token = input.cancellation.child();
        let last_event = Arc::new(AtomicU64::new(self.clock.now_ms()));
        let in_tool = Arc::new(AtomicBool::new(false));
        let watchdog = Watchdog::spawn(Arc::clone(&self.clock), &input.limits, token.clone(), Arc::clone(&last_event), Arc::clone(&in_tool), self.poll);
        let request = self.request(&input, history);
        let engine = TurnEngine::new(Arc::clone(&self.provider), Arc::clone(&self.authority), Arc::clone(&self.executor)).with_max_tool_rounds(input.limits.max_tool_rounds);
        let mut progress = Progress::default();
        let mut emit = |event: RuntimeEvent| {
            note_progress(&mut progress, &event, &last_event, &in_tool, self.clock.now_ms());
            recorder.on_event(&event);
            if recorder.error.is_some() {
                token.cancel();
            }
            sink(event);
        };
        let outcome = engine.run(request, &token, &mut emit);
        let fired = watchdog.finish();
        let caller_cancelled = input.cancellation.is_cancelled();
        if let Some(error) = recorder.error.take() {
            let _ = input.store.finish_session(&input.session_id, EndReason::Crashed);
            let status = RunStatus::Failed(format!("could not save the conversation: {error}"));
            return Ok(report(status, progress, &input.session_id));
        }
        let (status, end) = self.status_of(outcome, fired.filter(|_| !caller_cancelled), &input, &mut recorder, &mut progress);
        let _ = input.store.finish_session(&input.session_id, end);
        Ok(report(status, progress, &input.session_id))
    }

    fn request(&self, input: &RunInput<'_>, history: Vec<ChatMessage>) -> TurnRequest {
        let limits = TurnLimits { max_input_tokens: input.limits.max_input_tokens, max_output_tokens: input.limits.max_output_tokens };
        let mut request = TurnRequest::new(input.context.clone(), input.model.clone(), history).with_tools(input.tools.clone()).with_limits(limits);
        if let Some(system) = &input.system {
            request = request.with_system(system.clone());
        }
        if let Some(key) = &input.api_key {
            request = request.with_api_key(key.clone());
        }
        request
    }

    /// How the engine's outcome becomes a status, and how the session is marked. A paused run
    /// is marked cancelled: it did stop, and a session left open with nobody holding its lock
    /// would be taken for a crash by WS4's `recover`.
    fn status_of(&self, outcome: Result<TurnOutcome, TurnError>, fired: Option<Limit>, input: &RunInput<'_>, recorder: &mut Recorder<'_>, progress: &mut Progress) -> (RunStatus, EndReason) {
        match outcome {
            Ok(TurnOutcome::Completed { message, tool_rounds, .. }) => {
                progress.text = message;
                progress.rounds = tool_rounds;
                (RunStatus::Completed, EndReason::Completed)
            }
            Ok(TurnOutcome::Cancelled { partial }) => {
                progress.text = partial;
                (fired.map_or(RunStatus::Cancelled, RunStatus::LimitReached), EndReason::Cancelled)
            }
            Ok(TurnOutcome::AwaitingApproval { call, continuation_messages, tool_rounds, .. }) => {
                progress.rounds = tool_rounds;
                let root = &input.context.session.repo_root;
                let made = reason_with_disclosure(root, &call, recorder.approval_reason.take()).map_err(|e| e.to_string()).and_then(|reason| {
                    PendingApprovalStore::for_root(root)
                        .create(input.context.clone(), input.model.clone(), input.system.clone(), continuation_messages, tool_rounds, call, reason, APPROVAL_TTL_MINUTES)
                        .map_err(|e| e.to_string())
                });
                match made {
                    Ok(pending) => (RunStatus::AwaitingApproval(pending.approval_id), EndReason::Cancelled),
                    Err(why) => (RunStatus::Failed(format!("cannot ask for approval: {why}")), EndReason::Cancelled),
                }
            }
            Err(error) => {
                let limit = match &error {
                    TurnError::ToolRoundLimit { .. } => Some(Limit::ToolRounds),
                    TurnError::BudgetExceeded { kind: LimitKind::InputTokens, .. } => Some(Limit::InputTokens),
                    TurnError::BudgetExceeded { kind: LimitKind::OutputTokens, .. } => Some(Limit::OutputTokens),
                    _ => None,
                };
                (limit.map_or_else(|| RunStatus::Failed(error.to_string()), RunStatus::LimitReached), EndReason::Cancelled)
            }
        }
    }
}

/// Keep the running totals and the clock for the watcher. An empty chunk is not progress, so
/// a model that keeps sending nothing cannot hold a run open; time spent inside a tool is
/// not counted as idle (the tool has its own limits).
fn note_progress(progress: &mut Progress, event: &RuntimeEvent, last_event: &AtomicU64, in_tool: &AtomicBool, now: u64) {
    match event {
        RuntimeEvent::Metrics(usage) => add_usage(&mut progress.usage, usage),
        RuntimeEvent::ToolRequested(_) => progress.rounds += 1,
        RuntimeEvent::MessageCompleted(text) => progress.text = text.clone(),
        RuntimeEvent::ToolStarted { .. } => in_tool.store(true, Ordering::Release),
        RuntimeEvent::ToolCompleted(_) => in_tool.store(false, Ordering::Release),
        _ => {}
    }
    if !matches!(event, RuntimeEvent::TextDelta(chunk) if chunk.is_empty()) {
        last_event.store(now, Ordering::Release);
    }
}

fn report(status: RunStatus, progress: Progress, session_id: &str) -> RunReport {
    RunReport { status, final_message: progress.text, usage: progress.usage, tool_rounds: progress.rounds, session_id: session_id.to_string() }
}
