//! Tests for the run loop: a scripted provider, a real session store in a temporary
//! directory, and a clock that moves by hand. No network, no real home directory.

use super::*;
use crate::model::provider::{ChatMessage, ChatProvider, ModelInfo, Role};
use crate::model::tool::{StreamOutcome, ToolCall, ToolResultRecord, ToolSpec};
use crate::runtime::{CancellationToken, RuntimeEvent, ToolExecutor, TurnContext, TurnOrigin, YanaAuthorityChain};
use crate::session_context::SessionContext;
use crate::session_db::{EndReason, ProfileName, SessionStore, SqliteSessionStore, StateRoot};
use anyhow::Result;
use std::collections::VecDeque;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

enum Step {
    Text(Vec<&'static str>),
    Tool(ToolCall),
    /// Run something (move the clock, cancel a token) and then answer with text.
    Stall(Box<dyn Fn() + Send + Sync>),
}

struct Scripted {
    steps: Mutex<VecDeque<Step>>,
    seen_lengths: Mutex<Vec<usize>>,
}

impl Scripted {
    fn new(steps: impl IntoIterator<Item = Step>) -> Arc<Self> {
        Arc::new(Self { steps: Mutex::new(steps.into_iter().collect()), seen_lengths: Mutex::default() })
    }
}

impl ChatProvider for Scripted {
    fn name(&self) -> &str {
        "scripted"
    }
    fn default_model(&self) -> &str {
        "mock-model"
    }
    fn requires_key(&self) -> bool {
        false
    }
    fn env_var(&self) -> &str {
        ""
    }
    fn list_models(&self, _api_key: Option<&str>) -> Result<Vec<ModelInfo>> {
        Ok(vec![ModelInfo::named("mock-model")])
    }
    fn stream_chat(
        &self,
        _api_key: Option<&str>,
        _model: &str,
        _system: Option<&str>,
        messages: &[ChatMessage],
        _tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        self.seen_lengths.lock().unwrap().push(messages.len());
        let step = self.steps.lock().unwrap().pop_front().expect("the script ran out of steps");
        let usage = |i, o| ChatUsage { input_tokens: i, output_tokens: o, ..Default::default() };
        match step {
            Step::Text(chunks) => {
                for chunk in chunks {
                    on_chunk(chunk)?;
                }
                Ok((usage(2, 3), StreamOutcome::Text))
            }
            Step::Tool(call) => Ok((usage(1, 1), StreamOutcome::ToolCalls(vec![call]))),
            Step::Stall(action) => {
                action();
                // Give the watcher time to notice before this call returns.
                std::thread::sleep(std::time::Duration::from_millis(80));
                on_chunk("late")?;
                Ok((usage(2, 3), StreamOutcome::Text))
            }
        }
    }
}

struct Echo(Arc<AtomicUsize>);

impl ToolExecutor for Echo {
    fn execute(&self, _context: &TurnContext, call: &ToolCall) -> ToolResultRecord {
        self.0.fetch_add(1, Ordering::SeqCst);
        ToolResultRecord { call_id: call.id.clone(), output: "tool output".into(), is_error: false, denied: false }
    }
}

struct Rig {
    _dir: tempfile::TempDir,
    root: std::path::PathBuf,
    store: SqliteSessionStore,
    clock: Arc<ManualClock>,
    executed: Arc<AtomicUsize>,
}

fn rig() -> Rig {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
    std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
    std::fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
    let state = StateRoot::for_profile(&root, &ProfileName::default_profile());
    let store = SqliteSessionStore::open(&state).unwrap();
    Rig { _dir: dir, root, store, clock: Arc::new(ManualClock::default()), executed: Arc::default() }
}

fn context(root: &Path) -> TurnContext {
    TurnContext::new(SessionContext::new("s-1", root.to_path_buf(), "scripted", "mock-model", true), TurnOrigin::Terminal, true)
}

fn agent(rig: &Rig, provider: Arc<Scripted>) -> AgentRun {
    AgentRun::new(provider, Arc::new(YanaAuthorityChain), Arc::new(Echo(Arc::clone(&rig.executed))), rig.clock.clone()).with_poll(Duration::from_millis(5))
}

fn input<'a>(rig: &'a Rig, text: &str, limits: RunLimits, token: &CancellationToken) -> RunInput<'a> {
    RunInput {
        store: &rig.store,
        session_id: "sess-1".into(),
        title: "test".into(),
        context: context(&rig.root),
        model: "mock-model".into(),
        system: None,
        tools: Vec::new(),
        api_key: None,
        user_message: text.into(),
        limits,
        cancellation: token.clone(),
    }
}

fn tool_call(name: &str, args: &str) -> ToolCall {
    ToolCall { id: "call-1".into(), name: name.into(), arguments_json: args.into() }
}

fn rows(rig: &Rig) -> Vec<(u32, Role, String, bool, bool)> {
    rig.store
        .load_messages("sess-1")
        .unwrap()
        .into_iter()
        .map(|m| (m.seq, m.role, m.content, m.tool_call.is_some(), m.tool_result.is_some()))
        .collect()
}

fn ended(rig: &Rig) -> Option<EndReason> {
    rig.store.list_recent(5).unwrap().into_iter().find(|s| s.id == "sess-1").and_then(|s| s.end_reason)
}

#[test]
fn a_plain_run_saves_the_question_and_the_answer_in_order_and_ends_completed() {
    let rig = rig();
    let provider = Scripted::new([Step::Text(vec!["hel", "lo"])]);
    let mut events = Vec::new();
    let report = agent(&rig, provider).run(input(&rig, "hi", RunLimits::default(), &CancellationToken::default()), &mut |e| events.push(e)).unwrap();
    assert_eq!(report.status, RunStatus::Completed);
    assert_eq!(report.final_message, "hello");
    assert_eq!(rows(&rig), [(1, Role::User, "hi".to_string(), false, false), (2, Role::Assistant, "hello".to_string(), false, false)]);
    assert_eq!(ended(&rig), Some(EndReason::Completed));
    assert!(events.iter().any(|e| matches!(e, RuntimeEvent::TurnCompleted { .. })), "the caller still sees every event");
}

#[test]
fn a_tool_round_is_saved_as_call_then_result_then_the_final_answer() {
    let rig = rig();
    let provider = Scripted::new([Step::Tool(tool_call("read_file", "{\"path\":\"a\"}")), Step::Text(vec!["done"])]);
    let report = agent(&rig, provider).run(input(&rig, "go", RunLimits::default(), &CancellationToken::default()), &mut |_| {}).unwrap();
    assert_eq!((report.status, report.tool_rounds), (RunStatus::Completed, 1));
    let saved = rows(&rig);
    assert_eq!(saved.iter().map(|r| r.0).collect::<Vec<_>>(), [1, 2, 3, 4], "no gap in the sequence");
    assert_eq!((saved[1].3, saved[2].4), (true, true), "assistant tool call, then user tool result");
    assert_eq!(saved[3].2, "done");
    assert_eq!(rig.executed.load(Ordering::SeqCst), 1);
}

#[test]
fn a_second_run_on_the_same_session_sends_what_was_saved() {
    let rig = rig();
    let first = Scripted::new([Step::Text(vec!["one"])]);
    agent(&rig, first).run(input(&rig, "first", RunLimits::default(), &CancellationToken::default()), &mut |_| {}).unwrap();
    let second = Scripted::new([Step::Text(vec!["two"])]);
    agent(&rig, Arc::clone(&second)).run(input(&rig, "second", RunLimits::default(), &CancellationToken::default()), &mut |_| {}).unwrap();
    assert_eq!(*second.seen_lengths.lock().unwrap(), [3], "question, answer, new question");
    assert_eq!(rows(&rig).len(), 4);
}

#[test]
fn the_token_limit_stops_the_run_before_the_next_round_and_keeps_what_was_done() {
    let rig = rig();
    let provider = Scripted::new([Step::Tool(tool_call("read_file", "{}")), Step::Tool(tool_call("read_file", "{}")), Step::Text(vec!["never"])]);
    let limits = RunLimits { max_input_tokens: 2, ..RunLimits::default() };
    let report = agent(&rig, Arc::clone(&provider)).run(input(&rig, "go", limits, &CancellationToken::default()), &mut |_| {}).unwrap();
    assert_eq!(report.status, RunStatus::LimitReached(Limit::InputTokens));
    assert_eq!(provider.seen_lengths.lock().unwrap().len(), 2, "no third round");
    assert_eq!(rows(&rig).len(), 5, "the question, two calls and two results are saved");
    assert_eq!(ended(&rig), Some(EndReason::Cancelled));
}

#[test]
fn the_tool_round_limit_is_a_limit_not_a_failure() {
    let rig = rig();
    let provider = Scripted::new([Step::Tool(tool_call("read_file", "{}")), Step::Tool(tool_call("read_file", "{}")), Step::Text(vec!["never"])]);
    let limits = RunLimits { max_tool_rounds: 1, ..RunLimits::default() };
    let report = agent(&rig, provider).run(input(&rig, "go", limits, &CancellationToken::default()), &mut |_| {}).unwrap();
    assert_eq!(report.status, RunStatus::LimitReached(Limit::ToolRounds));
}

#[test]
fn cancelling_the_callers_token_stops_the_run_and_keeps_the_partial_answer() {
    let rig = rig();
    let token = CancellationToken::default();
    let cancel = token.clone();
    let provider = Scripted::new([Step::Stall(Box::new(move || cancel.cancel()))]);
    let report = agent(&rig, provider).run(input(&rig, "go", RunLimits::default(), &token), &mut |_| {}).unwrap();
    assert_eq!(report.status, RunStatus::Cancelled);
    assert_eq!(ended(&rig), Some(EndReason::Cancelled));
    assert_eq!(rows(&rig)[0].2, "go");
}

#[test]
fn a_stalled_model_call_is_stopped_by_the_idle_limit_without_touching_the_callers_token() {
    let rig = rig();
    let token = CancellationToken::default();
    let clock = Arc::clone(&rig.clock);
    let provider = Scripted::new([Step::Stall(Box::new(move || clock.advance(5_000)))]);
    let limits = RunLimits { idle: Duration::from_secs(2), ..RunLimits::default() };
    let report = agent(&rig, provider).run(input(&rig, "go", limits, &token), &mut |_| {}).unwrap();
    assert_eq!(report.status, RunStatus::LimitReached(Limit::Idle));
    assert!(!token.is_cancelled(), "a limit stops this run only");
}

#[test]
fn the_wall_limit_stops_a_run_even_while_events_keep_arriving() {
    let rig = rig();
    let clock = Arc::clone(&rig.clock);
    let provider = Scripted::new([Step::Stall(Box::new(move || clock.advance(60_000)))]);
    let limits = RunLimits { wall: Duration::from_secs(30), idle: Duration::from_secs(3600), ..RunLimits::default() };
    let report = agent(&rig, provider).run(input(&rig, "go", limits, &CancellationToken::default()), &mut |_| {}).unwrap();
    assert_eq!(report.status, RunStatus::LimitReached(Limit::Wall));
}

#[test]
fn a_session_another_run_is_using_is_refused_before_anything_runs() {
    let rig = rig();
    let _held = rig.store.lock_session("sess-1").unwrap();
    let provider = Scripted::new([Step::Text(vec!["x"])]);
    let error = agent(&rig, Arc::clone(&provider)).run(input(&rig, "go", RunLimits::default(), &CancellationToken::default()), &mut |_| {}).unwrap_err();
    assert_eq!(error, RunError::Busy("sess-1".into()));
    assert!(provider.seen_lengths.lock().unwrap().is_empty(), "the provider was never called");
    assert!(rig.store.load_messages("sess-1").unwrap().is_empty());
}

#[test]
fn a_call_that_needs_a_person_pauses_the_run_with_a_saved_approval() {
    let rig = rig();
    let provider = Scripted::new([Step::Tool(tool_call("run_command", "{\"command\":\"echo hi\"}"))]);
    let report = agent(&rig, provider).run(input(&rig, "go", RunLimits::default(), &CancellationToken::default()), &mut |_| {}).unwrap();
    let RunStatus::AwaitingApproval(id) = report.status else { panic!("{:?}", report.status) };
    let pending = crate::runtime::PendingApprovalStore::for_root(&rig.root).get(&id).unwrap();
    assert_eq!(pending.pending_call.name, "run_command");
    assert_eq!(rig.executed.load(Ordering::SeqCst), 0, "nothing was run before a person decided");
    assert_eq!(rows(&rig).len(), 2, "the question and the call that is waiting");
    assert_eq!(ended(&rig), Some(EndReason::Cancelled), "a paused run is not left open for recovery to call a crash");
}

#[test]
fn a_run_that_is_not_started_by_a_person_cannot_use_a_capability_that_needs_one() {
    let rig = rig();
    let mut ctx = context(&rig.root);
    ctx.human_initiated = false;
    ctx.origin = TurnOrigin::Scheduler;
    let provider = Scripted::new([Step::Tool(tool_call("run_command", "{\"command\":\"echo hi\"}")), Step::Text(vec!["ok"])]);
    let mut run_input = input(&rig, "go", RunLimits::default(), &CancellationToken::default());
    run_input.context = ctx;
    let report = agent(&rig, provider).run(run_input, &mut |_| {}).unwrap();
    assert_eq!(report.status, RunStatus::Completed);
    assert_eq!(rig.executed.load(Ordering::SeqCst), 0);
    assert!(rows(&rig).iter().any(|r| r.4), "the refusal came back to the model as a tool result");
}
