use super::*;
use crate::model::provider::{ChatMessage, ChatProvider, ChatUsage, ModelInfo, Role};
use crate::model::tool::{StreamOutcome, ToolCall, ToolResultRecord, ToolSpec};
use crate::session_context::SessionContext;
use anyhow::Result;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

enum MockResponse {
    Text(Vec<&'static str>),
    Tool(ToolCall),
}

struct MockProvider {
    responses: Mutex<VecDeque<MockResponse>>,
    calls: Arc<AtomicUsize>,
}

impl MockProvider {
    fn new(responses: impl IntoIterator<Item = MockResponse>, calls: Arc<AtomicUsize>) -> Self {
        Self {
            responses: Mutex::new(responses.into_iter().collect()),
            calls,
        }
    }
}

impl ChatProvider for MockProvider {
    fn name(&self) -> &str {
        "mock"
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
        Ok(vec![ModelInfo::named(self.default_model())])
    }

    fn stream_chat(
        &self,
        _api_key: Option<&str>,
        _model: &str,
        _system: Option<&str>,
        _messages: &[ChatMessage],
        _tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        match self.responses.lock().unwrap().pop_front().unwrap() {
            MockResponse::Text(chunks) => {
                for chunk in chunks {
                    on_chunk(chunk)?;
                }
                Ok((
                    ChatUsage {
                        input_tokens: 2,
                        output_tokens: 3,
                    },
                    StreamOutcome::Text,
                ))
            }
            MockResponse::Tool(call) => Ok((
                ChatUsage {
                    input_tokens: 1,
                    output_tokens: 1,
                },
                StreamOutcome::ToolCalls(vec![call]),
            )),
        }
    }
}

struct RecordingExecutor {
    calls: Arc<AtomicUsize>,
}

impl ToolExecutor for RecordingExecutor {
    fn execute(&self, _context: &TurnContext, call: &ToolCall) -> ToolResultRecord {
        self.calls.fetch_add(1, Ordering::SeqCst);
        ToolResultRecord {
            call_id: call.id.clone(),
            output: "executed".into(),
            is_error: false,
            denied: false,
        }
    }
}

fn request(root: &std::path::Path) -> TurnRequest {
    let session = SessionContext::new("session-1", root.to_path_buf(), "mock", "mock-model", true);
    TurnRequest::new(
        TurnContext::new(session, TurnOrigin::Terminal, true),
        "mock-model",
        vec![ChatMessage::text(Role::User, "hello")],
    )
}

fn engine(
    responses: impl IntoIterator<Item = MockResponse>,
    provider_calls: Arc<AtomicUsize>,
    executor_calls: Arc<AtomicUsize>,
) -> TurnEngine {
    TurnEngine::new(
        Arc::new(MockProvider::new(responses, provider_calls)),
        Arc::new(YanaAuthorityChain),
        Arc::new(RecordingExecutor {
            calls: executor_calls,
        }),
    )
}

fn call(name: &str) -> ToolCall {
    ToolCall {
        id: "call-1".into(),
        name: name.into(),
        arguments_json: "{}".into(),
    }
}

fn call_with_command(name: &str, command: &str) -> ToolCall {
    ToolCall {
        id: "call-1".into(),
        name: name.into(),
        arguments_json: serde_json::json!({ "command": command }).to_string(),
    }
}

#[test]
fn giam_thi_halt_blocks_before_the_provider_runs() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join(".claude/state")).unwrap();
    std::fs::write(root.path().join(".claude/state/GIAMTHI_HALT.lock"), "halt").unwrap();
    let provider_calls = Arc::new(AtomicUsize::new(0));
    let turn = engine(
        [MockResponse::Text(vec!["must not run"])],
        Arc::clone(&provider_calls),
        Arc::new(AtomicUsize::new(0)),
    );

    let error = turn
        .run(
            request(root.path()),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap_err();

    assert_eq!(provider_calls.load(Ordering::SeqCst), 0);
    assert!(matches!(
        error,
        TurnError::AuthorityDenied {
            authority: AuthorityLayer::GiamThi,
            ..
        }
    ));
}

#[test]
fn read_only_capability_executes_under_yana_control_plane() {
    let root = tempfile::tempdir().unwrap();
    let executor_calls = Arc::new(AtomicUsize::new(0));
    let turn = engine(
        [
            MockResponse::Tool(call("read_file")),
            MockResponse::Text(vec!["Cargo package found"]),
        ],
        Arc::new(AtomicUsize::new(0)),
        Arc::clone(&executor_calls),
    );

    let outcome = turn
        .run(
            request(root.path()),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();

    assert_eq!(executor_calls.load(Ordering::SeqCst), 1);
    assert!(matches!(
        outcome,
        TurnOutcome::Completed {
            ref message,
            ref continuation_messages,
            tool_rounds: 1,
            ..
        } if message == "Cargo package found"
            && continuation_messages.len() == 3
            && continuation_messages[1].tool_call.is_some()
            && continuation_messages[2].tool_result.is_some()
    ));
}

/// Authority Hardening item #4: a real, end-to-end `TurnEngine::run()`
/// invocation must produce both an `AuthorityDecisionReceipt` (item #3)
/// and an `ExecutionReceipt` (item #4) for the one tool call it makes,
/// and the two must correlate — the whole point of threading
/// `decision_id` through `AuthorityDecision::Allow` in the first place.
#[test]
fn execution_receipt_is_recorded_and_correlates_with_the_authority_decision() {
    let root = tempfile::tempdir().unwrap();
    let turn = engine(
        [
            MockResponse::Tool(call("read_file")),
            MockResponse::Text(vec!["done"]),
        ],
        Arc::new(AtomicUsize::new(0)),
        Arc::new(AtomicUsize::new(0)),
    );

    turn.run(
        request(root.path()),
        &CancellationToken::default(),
        &mut |_| {},
    )
    .unwrap();

    let authority_receipts = crate::runtime::receipt::read_receipts(root.path());
    let execution_receipts = crate::runtime::receipt::read_execution_receipts(root.path());
    assert_eq!(authority_receipts.len(), 1, "one capability decision was made");
    assert_eq!(execution_receipts.len(), 1, "one capability was actually invoked");

    let authority_decision_id = &authority_receipts[0].decision_id;
    let execution = &execution_receipts[0];
    assert_eq!(
        execution.authority_decision_id.as_ref(),
        Some(authority_decision_id),
        "ExecutionReceipt must reference the exact AuthorityDecisionReceipt that permitted it"
    );
    assert_eq!(execution.turn_id, authority_receipts[0].turn_id);
    assert_eq!(execution.capability_id, "read_file");
    assert_eq!(execution.outcome, crate::runtime::receipt::ExecutionOutcome::Success);
    assert!(execution.output_hash.is_some(), "RecordingExecutor returns non-empty output");
    assert!(execution.completed_at >= execution.started_at);
}

/// Delegates every decision to the real chain, but cancels the shared
/// token first — simulates a user cancelling in the instant between a
/// tool call being proposed and the authority decision coming back, the
/// exact race window `run()`'s `AuthorityDecision::Allow` arm now closes.
struct CancelOnAuthorize {
    cancel: CancellationToken,
}

impl RuntimeAuthority for CancelOnAuthorize {
    fn preflight_turn(&self, context: &TurnContext) -> AuthorityDecision {
        YanaAuthorityChain.preflight_turn(context)
    }
    fn authorize_tool(&self, context: &TurnContext, call: &ToolCall) -> AuthorityDecision {
        self.cancel.cancel();
        YanaAuthorityChain.authorize_tool(context, call)
    }
    fn authorize_approved_tool(&self, context: &TurnContext, call: &ToolCall) -> AuthorityDecision {
        YanaAuthorityChain.authorize_approved_tool(context, call)
    }
}

#[test]
fn cancellation_between_authority_allow_and_execution_stops_the_tool() {
    let root = tempfile::tempdir().unwrap();
    let executor_calls = Arc::new(AtomicUsize::new(0));
    let cancel = CancellationToken::default();
    let turn = TurnEngine::new(
        Arc::new(MockProvider::new(
            [MockResponse::Tool(call("read_file"))],
            Arc::new(AtomicUsize::new(0)),
        )),
        Arc::new(CancelOnAuthorize {
            cancel: cancel.clone(),
        }),
        Arc::new(RecordingExecutor {
            calls: Arc::clone(&executor_calls),
        }),
    );

    let outcome = turn
        .run(request(root.path()), &cancel, &mut |_| {})
        .unwrap();

    assert_eq!(
        executor_calls.load(Ordering::SeqCst),
        0,
        "the capability must not run once cancellation arrived before execution"
    );
    assert!(matches!(outcome, TurnOutcome::Cancelled { .. }));
}

#[test]
fn mutating_capability_stops_for_human_approval_without_execution() {
    let root = tempfile::tempdir().unwrap();
    let executor_calls = Arc::new(AtomicUsize::new(0));
    let turn = engine(
        [MockResponse::Tool(call("run_command"))],
        Arc::new(AtomicUsize::new(0)),
        Arc::clone(&executor_calls),
    );

    let outcome = turn
        .run(
            request(root.path()),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();

    assert_eq!(executor_calls.load(Ordering::SeqCst), 0);
    assert!(matches!(
        outcome,
        TurnOutcome::AwaitingApproval {
            ref call,
            ref continuation_messages,
            tool_rounds: 1,
            ..
        } if call.name == "run_command"
            && continuation_messages.last().unwrap().tool_call.is_some()
    ));
}

/// Authority Hardening item #5: `pending_approval::resume_turn` must
/// actually complete the exact continuation Terminal's own in-process
/// `chat/tui/approval.rs` performs (execute the approved call, append the
/// result, start a fresh turn) — just via a durable
/// `PendingApprovalStore` record instead of in-memory `App` state, so a
/// resume that arrives in a LATER process invocation still works.
struct ApprovingExecutor {
    calls: Arc<AtomicUsize>,
}

impl ToolExecutor for ApprovingExecutor {
    fn execute(&self, _context: &TurnContext, call: &ToolCall) -> ToolResultRecord {
        ToolResultRecord {
            call_id: call.id.clone(),
            output: "executed".into(),
            is_error: false,
            denied: false,
        }
    }
    fn execute_approved(&self, approved: crate::runtime::ApprovedTool<'_>) -> ToolResultRecord {
        self.calls.fetch_add(1, Ordering::SeqCst);
        ToolResultRecord {
            call_id: approved.call().id.clone(),
            output: "approved and executed".into(),
            is_error: false,
            denied: false,
        }
    }
}

#[test]
fn resume_turn_completes_the_paused_call_and_continues_to_a_final_answer() {
    let root = tempfile::tempdir().unwrap();
    write_flock_marker(root.path());
    let executor_calls = Arc::new(AtomicUsize::new(0));
    let provider_calls = Arc::new(AtomicUsize::new(0));
    let provider = Arc::new(MockProvider::new(
        [
            MockResponse::Tool(call("run_command")),
            MockResponse::Text(vec!["done after resume"]),
        ],
        Arc::clone(&provider_calls),
    ));
    let executor = Arc::new(ApprovingExecutor {
        calls: Arc::clone(&executor_calls),
    });
    let engine = TurnEngine::new(
        Arc::clone(&provider) as Arc<dyn crate::model::provider::ChatProvider>,
        Arc::new(YanaAuthorityChain),
        Arc::clone(&executor) as Arc<dyn ToolExecutor>,
    );

    let paused = engine
        .run(request(root.path()), &CancellationToken::default(), &mut |_| {})
        .unwrap();
    let TurnOutcome::AwaitingApproval {
        call,
        continuation_messages,
        tool_rounds,
        ..
    } = paused
    else {
        panic!("expected AwaitingApproval");
    };
    assert_eq!(executor_calls.load(Ordering::SeqCst), 0, "must not execute before a human decides");

    let store = crate::runtime::PendingApprovalStore::for_root(root.path());
    let created = store
        .create(
            request(root.path()).context,
            "mock-model".into(),
            None,
            continuation_messages,
            tool_rounds,
            call,
            "requires explicit human approval".into(),
            20,
        )
        .unwrap();
    let resolved = store.resolve(&created.approval_id, true, "human:test".into()).unwrap();

    let outcome = crate::runtime::resume_turn(
        &resolved,
        Arc::clone(&provider) as Arc<dyn crate::model::provider::ChatProvider>,
        Arc::clone(&executor) as Arc<dyn ToolExecutor>,
        Vec::new(),
        None,
        &CancellationToken::default(),
        &mut |_| {},
    )
    .unwrap();

    assert_eq!(executor_calls.load(Ordering::SeqCst), 1, "resume must execute the approved call exactly once");
    assert!(matches!(
        outcome,
        TurnOutcome::Completed { ref message, .. } if message == "done after resume"
    ));
}

#[test]
fn resume_turn_on_a_denied_decision_reports_the_decline_and_continues() {
    let root = tempfile::tempdir().unwrap();
    write_flock_marker(root.path());
    let executor_calls = Arc::new(AtomicUsize::new(0));
    let provider_calls = Arc::new(AtomicUsize::new(0));
    let provider = Arc::new(MockProvider::new(
        [
            MockResponse::Tool(call("run_command")),
            MockResponse::Text(vec!["okay, skipping that"]),
        ],
        Arc::clone(&provider_calls),
    ));
    let executor = Arc::new(ApprovingExecutor {
        calls: Arc::clone(&executor_calls),
    });
    let engine = TurnEngine::new(
        Arc::clone(&provider) as Arc<dyn crate::model::provider::ChatProvider>,
        Arc::new(YanaAuthorityChain),
        Arc::clone(&executor) as Arc<dyn ToolExecutor>,
    );
    let paused = engine
        .run(request(root.path()), &CancellationToken::default(), &mut |_| {})
        .unwrap();
    let TurnOutcome::AwaitingApproval {
        call,
        continuation_messages,
        tool_rounds,
        ..
    } = paused
    else {
        panic!("expected AwaitingApproval");
    };

    let store = crate::runtime::PendingApprovalStore::for_root(root.path());
    let created = store
        .create(
            request(root.path()).context,
            "mock-model".into(),
            None,
            continuation_messages,
            tool_rounds,
            call,
            "requires explicit human approval".into(),
            20,
        )
        .unwrap();
    let resolved = store.resolve(&created.approval_id, false, "human:test".into()).unwrap();

    let outcome = crate::runtime::resume_turn(
        &resolved,
        Arc::clone(&provider) as Arc<dyn crate::model::provider::ChatProvider>,
        Arc::clone(&executor) as Arc<dyn ToolExecutor>,
        Vec::new(),
        None,
        &CancellationToken::default(),
        &mut |_| {},
    )
    .unwrap();

    assert_eq!(executor_calls.load(Ordering::SeqCst), 0, "a denied decision must never execute the call");
    assert!(matches!(
        outcome,
        TurnOutcome::Completed { ref message, .. } if message == "okay, skipping that"
    ));
}

#[test]
fn subagent_origin_cannot_turn_human_approval_into_mutation_authority() {
    let root = tempfile::tempdir().unwrap();
    let context = request(root.path()).context.for_subagent("worker-1");
    let command = call("run_command");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Deny {
            authority: AuthorityLayer::YanaControlPlane,
            reason,
        } if reason.contains("non-human-initiated")
    ));
}

#[test]
fn resumed_turn_enforces_the_original_tool_round_budget() {
    let root = tempfile::tempdir().unwrap();
    let executor_calls = Arc::new(AtomicUsize::new(0));
    let provider_calls = Arc::new(AtomicUsize::new(0));
    let turn = engine(
        [MockResponse::Tool(call("read_file"))],
        Arc::clone(&provider_calls),
        Arc::clone(&executor_calls),
    );
    let request = request(root.path()).with_tool_rounds_completed(8);

    let error = turn
        .run(request, &CancellationToken::default(), &mut |_| {})
        .unwrap_err();

    assert_eq!(provider_calls.load(Ordering::SeqCst), 1);
    assert_eq!(executor_calls.load(Ordering::SeqCst), 0);
    assert!(matches!(error, TurnError::ToolRoundLimit { limit: 8 }));
}

#[test]
fn approved_tool_is_rechecked_against_giam_thi_before_execution() {
    let root = tempfile::tempdir().unwrap();
    let context = request(root.path()).context;
    let command = call("run_command");
    assert!(matches!(
        YanaAuthorityChain.authorize_tool(&context, &command),
        AuthorityDecision::HumanApprovalRequired { .. }
    ));

    std::fs::create_dir_all(root.path().join(".claude/state")).unwrap();
    std::fs::write(root.path().join(".claude/state/GIAMTHI_HALT.lock"), "halt").unwrap();

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Deny {
            authority: AuthorityLayer::GiamThi,
            ..
        }
    ));
}

#[test]
fn unknown_tool_is_denied_and_reported_back_to_the_model() {
    let root = tempfile::tempdir().unwrap();
    let executor_calls = Arc::new(AtomicUsize::new(0));
    let turn = engine(
        [
            MockResponse::Tool(call("unregistered_tool")),
            MockResponse::Text(vec!["I cannot use that tool"]),
        ],
        Arc::new(AtomicUsize::new(0)),
        Arc::clone(&executor_calls),
    );

    let outcome = turn
        .run(
            request(root.path()),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();

    assert_eq!(executor_calls.load(Ordering::SeqCst), 0);
    assert!(matches!(
        outcome,
        TurnOutcome::Completed { ref tool_results, .. }
            if tool_results.len() == 1 && tool_results[0].denied
    ));
}

#[test]
fn cancellation_preserves_partial_output() {
    let root = tempfile::tempdir().unwrap();
    let turn = engine(
        [MockResponse::Text(vec!["partial", "ignored"])],
        Arc::new(AtomicUsize::new(0)),
        Arc::new(AtomicUsize::new(0)),
    );
    let cancellation = CancellationToken::default();
    let event_token = cancellation.clone();

    let outcome = turn
        .run(request(root.path()), &cancellation, &mut |event| {
            if matches!(&event, RuntimeEvent::TextDelta(chunk) if chunk == "partial") {
                event_token.cancel();
            }
        })
        .unwrap();

    assert!(matches!(
        outcome,
        TurnOutcome::Cancelled { ref partial } if partial == "partial"
    ));
}

// ── Capability Lease (Milestone "Authority Depth", P0) ──────────────────────
//
// A lease is the one deliberate way a subagent turn *can* satisfy the
// `HumanApprovalPerCall` gate that `subagent_origin_cannot_turn_human_
// approval_into_mutation_authority` above proves is otherwise closed. These
// tests prove the lease path is real without weakening that existing
// invariant — the no-lease case above must still pass unmodified, and it
// does (untouched by this change).

/// Every lease mutation now runs inside a `flock-v1` critical section
/// (hardening pass), which requires the real protocol marker to be
/// present — matches the exact pattern every other flock-v1 caller's own
/// tests already use (e.g. `os::health`'s tests), rather than relying on
/// `YANA_LOCKING_PROTOCOL_MODE=test`.
fn write_flock_marker(root: &std::path::Path) {
    let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
    std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
    std::fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
}

#[test]
fn subagent_with_a_valid_matching_lease_gets_mutation_authority() {
    let root = tempfile::tempdir().unwrap();
    write_flock_marker(root.path());
    let context = request(root.path()).context.for_subagent("worker-1");
    crate::capability::lease::LeaseStore::for_root(root.path())
        .grant(
            "worker-1".into(),
            "command.execute".into(),
            vec!["cargo test".into()],
            vec![],
            "human".into(),
            20,
            Some(5),
            None,
        )
        .unwrap();
    let command = call_with_command("run_command", "cargo test --release");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Allow { .. }
    ));
}

#[test]
fn subagent_with_an_expired_lease_is_still_denied() {
    let root = tempfile::tempdir().unwrap();
    write_flock_marker(root.path());
    let context = request(root.path()).context.for_subagent("worker-1");
    let now = chrono::Utc::now();
    let expired = crate::capability::lease::Lease {
        id: "expired1".into(),
        subject: "worker-1".into(),
        capability: "command.execute".into(),
        repo_root: root.path().to_path_buf(),
        allow: vec!["cargo test".into()],
        deny: vec![],
        issued_by: "human".into(),
        issued_at: now - chrono::Duration::minutes(30),
        expires_at: now - chrono::Duration::minutes(10),
        invocation_budget: None,
        remaining: None,
        revoked: false,
        parent_lease_id: None,
    };
    std::fs::create_dir_all(root.path().join(".yana-ai")).unwrap();
    std::fs::write(
        root.path().join(".yana-ai").join("leases.json"),
        serde_json::to_vec(&vec![expired]).unwrap(),
    )
    .unwrap();
    let command = call_with_command("run_command", "cargo test");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Deny {
            authority: AuthorityLayer::YanaControlPlane,
            reason,
        } if reason.contains("non-human-initiated")
    ));
}

#[test]
fn subagent_with_a_lease_for_a_different_command_is_still_denied() {
    let root = tempfile::tempdir().unwrap();
    write_flock_marker(root.path());
    let context = request(root.path()).context.for_subagent("worker-1");
    crate::capability::lease::LeaseStore::for_root(root.path())
        .grant(
            "worker-1".into(),
            "command.execute".into(),
            vec!["cargo test".into()],
            vec![],
            "human".into(),
            20,
            None,
            None,
        )
        .unwrap();
    let command = call_with_command("run_command", "git push --force origin main");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Deny {
            authority: AuthorityLayer::YanaControlPlane,
            reason,
        } if reason.contains("non-human-initiated")
    ));
}

#[test]
fn halt_active_denies_a_leased_subagent_call_too() {
    let root = tempfile::tempdir().unwrap();
    write_flock_marker(root.path());
    std::fs::create_dir_all(root.path().join(".claude/state")).unwrap();
    std::fs::write(root.path().join(".claude/state/GIAMTHI_HALT.lock"), "halt").unwrap();
    let context = request(root.path()).context.for_subagent("worker-1");
    crate::capability::lease::LeaseStore::for_root(root.path())
        .grant(
            "worker-1".into(),
            "command.execute".into(),
            vec!["cargo test".into()],
            vec![],
            "human".into(),
            20,
            None,
            None,
        )
        .unwrap();
    let command = call_with_command("run_command", "cargo test");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Deny {
            authority: AuthorityLayer::GiamThi,
            ..
        }
    ));
}

// ── Intent Contract foundation (Authority Hardening item #7) ────────────
// EffectiveExecutionEnvelope = ModelRequested ∩ HumanGranted ∩
// DelegatedAuthority ∩ PolicyAllowed ∩ RuntimeCapabilityAvailability.
// `narrow_by_intent` is the ModelRequested term -- these tests prove it
// only ever narrows an Allow the other four terms already produced,
// never widens a Deny/HumanApprovalRequired, and leaves every existing
// behavior unchanged when no declaration is present at all.

fn intent(capabilities: &[&str], scope: &[&str]) -> crate::runtime::IntentDeclaration {
    crate::runtime::IntentDeclaration {
        declared_capabilities: capabilities.iter().map(|c| c.to_string()).collect(),
        declared_scope: scope.iter().map(|s| s.to_string()).collect(),
        declared_reason: "test-declared plan".into(),
    }
}

#[test]
fn declared_capability_and_in_scope_command_is_allowed() {
    let root = tempfile::tempdir().unwrap();
    let context = request(root.path())
        .context
        .with_intent(intent(&["command.execute"], &["cargo test"]));
    let command = call_with_command("run_command", "cargo test --release");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Allow { .. }
    ));
}

#[test]
fn undeclared_capability_is_downgraded_to_human_approval_required_not_denied() {
    let root = tempfile::tempdir().unwrap();
    // Declares only read_file -- run_command was never claimed.
    let context = request(root.path())
        .context
        .with_intent(intent(&["read_file"], &[]));
    let command = call_with_command("run_command", "cargo test");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::HumanApprovalRequired {
            authority: AuthorityLayer::YanaControlPlane,
            ..
        }
    ), "an undeclared capability must pause for a new human decision, not silently deny");
}

#[test]
fn out_of_declared_scope_command_is_downgraded_even_though_capability_matches() {
    let root = tempfile::tempdir().unwrap();
    // command.execute is declared, but only for "cargo test" -- a force
    // push under the same declared capability must still be caught.
    let context = request(root.path())
        .context
        .with_intent(intent(&["command.execute"], &["cargo test"]));
    let command = call_with_command("run_command", "git push --force origin main");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::HumanApprovalRequired {
            authority: AuthorityLayer::YanaControlPlane,
            ..
        }
    ));
}

#[test]
fn declared_intent_can_never_widen_a_halt_deny() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join(".claude/state")).unwrap();
    std::fs::write(root.path().join(".claude/state/GIAMTHI_HALT.lock"), "halt").unwrap();
    // Declares everything -- must not matter, HALT is checked first and
    // narrow_by_intent never runs on a Deny.
    let context = request(root.path())
        .context
        .with_intent(intent(&["command.execute"], &[]));
    let command = call_with_command("run_command", "cargo test");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Deny {
            authority: AuthorityLayer::GiamThi,
            ..
        }
    ));
}

#[test]
fn no_intent_declared_leaves_existing_approval_behavior_unchanged() {
    let root = tempfile::tempdir().unwrap();
    let context = request(root.path()).context; // intent: None, the default
    let command = call_with_command("run_command", "anything at all, undeclared or not");

    assert!(matches!(
        YanaAuthorityChain.authorize_approved_tool(&context, &command),
        AuthorityDecision::Allow { .. }
    ), "with no declaration at all, the four pre-existing terms alone must still govern, unchanged");
}
