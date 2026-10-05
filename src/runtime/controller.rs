use super::{
    AuthorityDecision, AuthorityLayer, RuntimeAuthority, RuntimeEvent, TurnContext, TurnOutcome,
    TurnRequest,
};
use crate::model::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use crate::model::tool::{StreamOutcome, ToolCall, ToolCallRecord, ToolResultRecord};
use chrono::Utc;
use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const DEFAULT_MAX_TOOL_ROUNDS: usize = 8;
const CANCELLED_MESSAGE: &str = "generation cancelled by user";

/// Deepest chain of child tokens followed when asking whether a token is cancelled. Far
/// beyond the delegation depth limit; it only keeps a malformed chain from looping.
const MAX_TOKEN_DEPTH: usize = 16;

/// A cancellation flag with an optional parent. A token is cancelled when it was cancelled
/// itself or when any ancestor was; cancelling a child never cancels its parent. Cancelling
/// a parent therefore cancels every run started beneath it (WS2 contract, sections 4 and 5).
#[derive(Clone, Default)]
pub(crate) struct CancellationToken {
    cancelled: Arc<AtomicBool>,
    parent: Option<Arc<CancellationToken>>,
}

impl CancellationToken {
    pub(crate) fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    /// A new token that is cancelled whenever `self` is, and can also be cancelled alone.
    #[cfg(any(test, feature = "session-db"))]
    pub(crate) fn child(&self) -> CancellationToken {
        CancellationToken { cancelled: Arc::default(), parent: Some(Arc::new(self.clone())) }
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        let mut token = self;
        for _ in 0..MAX_TOKEN_DEPTH {
            if token.cancelled.load(Ordering::Acquire) {
                return true;
            }
            match &token.parent {
                Some(parent) => token = parent,
                None => return false,
            }
        }
        true
    }
}

/// Which limit stopped a turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LimitKind {
    InputTokens,
    OutputTokens,
}

/// Most tokens a turn may use in all. `0` means no limit. Checked before each round with
/// what the provider has reported so far; a round already streaming is never cut short by it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct TurnLimits {
    pub max_input_tokens: u64,
    pub max_output_tokens: u64,
}

impl TurnLimits {
    fn exceeded(&self, used: &ChatUsage) -> Option<(LimitKind, u64)> {
        if self.max_input_tokens > 0 && used.input_tokens >= self.max_input_tokens {
            return Some((LimitKind::InputTokens, self.max_input_tokens));
        }
        if self.max_output_tokens > 0 && used.output_tokens >= self.max_output_tokens {
            return Some((LimitKind::OutputTokens, self.max_output_tokens));
        }
        None
    }
}

pub(crate) trait ToolExecutor: Send + Sync {
    fn execute(&self, context: &TurnContext, call: &ToolCall) -> ToolResultRecord;

    fn execute_approved(&self, approved: ApprovedTool<'_>) -> ToolResultRecord {
        ToolResultRecord {
            call_id: approved.call().id.clone(),
            output: format!(
                "executor has no approved implementation for '{}'",
                approved.call().name
            ),
            is_error: true,
            denied: true,
        }
    }
}

/// Opaque proof that the canonical authority chain approved one mutating
/// capability. Only this module can construct it, so adapters cannot call an
/// approved executor path without first crossing `execute_approved_tool()`.
pub(crate) struct ApprovedTool<'a> {
    context: &'a TurnContext,
    call: &'a ToolCall,
}

impl<'a> ApprovedTool<'a> {
    pub(crate) fn context(&self) -> &'a TurnContext {
        self.context
    }

    pub(crate) fn call(&self) -> &'a ToolCall {
        self.call
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TurnError {
    AuthorityDenied {
        authority: AuthorityLayer,
        reason: String,
    },
    Provider(String),
    ToolRoundLimit {
        limit: usize,
    },
    /// The tokens used so far reached the turn's limit; no further round was started.
    BudgetExceeded {
        kind: LimitKind,
        limit: u64,
    },
    MultipleToolCallsUnsupported {
        count: usize,
    },
}

impl fmt::Display for TurnError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AuthorityDenied { authority, reason } => {
                write!(formatter, "{} denied the turn: {reason}", authority.label())
            }
            Self::Provider(message) => write!(formatter, "provider failed: {message}"),
            Self::ToolRoundLimit { limit } => {
                write!(formatter, "tool-call round limit reached ({limit})")
            }
            Self::BudgetExceeded { kind, limit } => {
                write!(formatter, "{kind:?} limit reached ({limit} tokens)")
            }
            Self::MultipleToolCallsUnsupported { count } => {
                write!(
                    formatter,
                    "provider proposed {count} simultaneous tool calls"
                )
            }
        }
    }
}

impl std::error::Error for TurnError {}

pub(crate) fn execute_approved_tool(
    authority: &dyn RuntimeAuthority,
    executor: &dyn ToolExecutor,
    context: &TurnContext,
    call: &ToolCall,
    cancellation: &CancellationToken,
    emit: &mut dyn FnMut(RuntimeEvent),
) -> Result<ToolResultRecord, TurnError> {
    let authority_decision_id = match authority.authorize_approved_tool(context, call) {
        AuthorityDecision::Allow { decision_id } => decision_id,
        AuthorityDecision::Deny { authority, reason }
        | AuthorityDecision::HumanApprovalRequired { authority, reason } => {
            emit(RuntimeEvent::AuthorityDenied {
                authority,
                reason: reason.clone(),
            });
            return Err(TurnError::AuthorityDenied { authority, reason });
        }
    };
    if cancellation.is_cancelled() {
        return Ok(ToolResultRecord {
            call_id: call.id.clone(),
            output: CANCELLED_MESSAGE.to_string(),
            is_error: true,
            denied: true,
        });
    }
    emit(RuntimeEvent::ToolApproved {
        call_id: call.id.clone(),
    });
    emit(RuntimeEvent::ToolStarted {
        call_id: call.id.clone(),
    });
    let started_at = Utc::now();
    let result = executor.execute_approved(ApprovedTool { context, call });
    let completed_at = Utc::now();
    // Authority Hardening item #4: the invocation actually happened (past
    // the cancellation check above), so it gets an ExecutionReceipt
    // regardless of outcome — closing the causal chain item #3's
    // AuthorityDecision started.
    super::receipt::record_execution(
        context,
        authority_decision_id,
        &call.name,
        &call.arguments_json,
        &result.output,
        result.is_error,
        started_at,
        completed_at,
    );
    emit(RuntimeEvent::ToolCompleted(result.clone()));
    Ok(result)
}

pub(crate) struct TurnEngine {
    provider: Arc<dyn ChatProvider>,
    authority: Arc<dyn RuntimeAuthority>,
    executor: Arc<dyn ToolExecutor>,
    max_tool_rounds: usize,
}

enum ProviderRoundError {
    Cancelled(String),
    Failed(TurnError),
}

impl TurnEngine {
    pub(crate) fn new(
        provider: Arc<dyn ChatProvider>,
        authority: Arc<dyn RuntimeAuthority>,
        executor: Arc<dyn ToolExecutor>,
    ) -> Self {
        Self {
            provider,
            authority,
            executor,
            max_tool_rounds: DEFAULT_MAX_TOOL_ROUNDS,
        }
    }

    #[cfg(any(test, feature = "session-db"))]
    pub(crate) fn with_max_tool_rounds(mut self, limit: usize) -> Self {
        self.max_tool_rounds = limit;
        self
    }

    pub(crate) fn run(
        &self,
        mut request: TurnRequest,
        cancellation: &CancellationToken,
        emit: &mut dyn FnMut(RuntimeEvent),
    ) -> Result<TurnOutcome, TurnError> {
        emit(RuntimeEvent::TurnStarted {
            context: request.context.clone(),
            provider: self.provider.name().to_string(),
            model: request.model.clone(),
        });
        if let AuthorityDecision::Deny { authority, reason } =
            self.authority.preflight_turn(&request.context)
        {
            emit(RuntimeEvent::AuthorityDenied {
                authority,
                reason: reason.clone(),
            });
            return Err(TurnError::AuthorityDenied { authority, reason });
        }

        let mut tool_results = Vec::new();
        let mut total_usage = ChatUsage::default();
        let mut tool_rounds = request.tool_rounds_completed;
        loop {
            if cancellation.is_cancelled() {
                return Ok(cancelled(String::new(), emit));
            }
            if let Some((kind, limit)) = request.limits.exceeded(&total_usage) {
                let error = TurnError::BudgetExceeded { kind, limit };
                emit(RuntimeEvent::Error { message: error.to_string() });
                return Err(error);
            }

            let (reply, usage, stream_outcome) =
                match self.provider_round(&request, cancellation, emit) {
                    Ok(round) => round,
                    Err(ProviderRoundError::Cancelled(partial)) => {
                        return Ok(cancelled(partial, emit))
                    }
                    Err(ProviderRoundError::Failed(error)) => return Err(error),
                };
            total_usage.input_tokens = total_usage.input_tokens.saturating_add(usage.input_tokens);
            total_usage.output_tokens = total_usage
                .output_tokens
                .saturating_add(usage.output_tokens);

            match stream_outcome {
                StreamOutcome::Text => {
                    emit(RuntimeEvent::TurnCompleted { tool_rounds });
                    return Ok(TurnOutcome::Completed {
                        message: reply,
                        usage: total_usage,
                        tool_results,
                        continuation_messages: request.messages,
                        tool_rounds,
                    });
                }
                StreamOutcome::ToolCalls(calls) => {
                    if calls.len() != 1 {
                        return Err(TurnError::MultipleToolCallsUnsupported { count: calls.len() });
                    }
                    if tool_rounds >= self.max_tool_rounds {
                        return Err(TurnError::ToolRoundLimit {
                            limit: self.max_tool_rounds,
                        });
                    }
                    tool_rounds += 1;
                    if !reply.is_empty() {
                        request
                            .messages
                            .push(ChatMessage::text(Role::Assistant, reply));
                    }
                    let call = calls.into_iter().next().expect("one call checked");
                    let mut assistant = ChatMessage::text(Role::Assistant, "");
                    assistant.tool_call = Some(ToolCallRecord::from(call.clone()));
                    request.messages.push(assistant);
                    emit(RuntimeEvent::ToolRequested(call.clone()));

                    match self.authority.authorize_tool(&request.context, &call) {
                        AuthorityDecision::Allow { decision_id } => {
                            // Cancellation may have arrived while the provider was
                            // streaming the tool-call proposal or while authority
                            // was deciding — checked here, not just at the top of
                            // the loop, so a cancel can't race a capability into
                            // starting after the user already asked to stop.
                            if cancellation.is_cancelled() {
                                return Ok(cancelled(String::new(), emit));
                            }
                            emit(RuntimeEvent::ToolApproved {
                                call_id: call.id.clone(),
                            });
                            emit(RuntimeEvent::ToolStarted {
                                call_id: call.id.clone(),
                            });
                            let started_at = Utc::now();
                            let result = self.executor.execute(&request.context, &call);
                            let completed_at = Utc::now();
                            super::receipt::record_execution(
                                &request.context,
                                decision_id,
                                &call.name,
                                &call.arguments_json,
                                &result.output,
                                result.is_error,
                                started_at,
                                completed_at,
                            );
                            emit(RuntimeEvent::ToolCompleted(result.clone()));
                            push_tool_result(&mut request.messages, &result);
                            tool_results.push(result);
                        }
                        AuthorityDecision::HumanApprovalRequired { authority, reason } => {
                            emit(RuntimeEvent::HumanApprovalRequired {
                                call: call.clone(),
                                authority,
                                reason,
                            });
                            return Ok(TurnOutcome::AwaitingApproval {
                                call,
                                continuation_messages: request.messages,
                                usage: total_usage,
                                tool_rounds,
                            });
                        }
                        AuthorityDecision::Deny { authority, reason } => {
                            emit(RuntimeEvent::ToolDenied {
                                call_id: call.id.clone(),
                                reason: reason.clone(),
                            });
                            let result = ToolResultRecord {
                                call_id: call.id,
                                output: format!(
                                    "{} denied capability: {reason}",
                                    authority.label()
                                ),
                                is_error: true,
                                denied: true,
                            };
                            emit(RuntimeEvent::ToolCompleted(result.clone()));
                            push_tool_result(&mut request.messages, &result);
                            tool_results.push(result);
                        }
                    }
                }
            }
        }
    }

    fn provider_round(
        &self,
        request: &TurnRequest,
        cancellation: &CancellationToken,
        emit: &mut dyn FnMut(RuntimeEvent),
    ) -> Result<(String, ChatUsage, StreamOutcome), ProviderRoundError> {
        emit(RuntimeEvent::MessageStarted);
        let mut reply = String::new();
        let result = self.provider.stream_chat(
            request.api_key(),
            &request.model,
            request.system.as_deref(),
            &request.messages,
            &request.tools,
            &mut |chunk| {
                if cancellation.is_cancelled() {
                    anyhow::bail!(CANCELLED_MESSAGE);
                }
                reply.push_str(chunk);
                emit(RuntimeEvent::TextDelta(chunk.to_string()));
                Ok(())
            },
        );
        match result {
            Ok((usage, outcome)) if !cancellation.is_cancelled() => {
                emit(RuntimeEvent::Metrics(usage));
                emit(RuntimeEvent::MessageCompleted(reply.clone()));
                Ok((reply, usage, outcome))
            }
            Ok(_) => Err(ProviderRoundError::Cancelled(reply)),
            Err(error) if cancellation.is_cancelled() => {
                let _ = error;
                Err(ProviderRoundError::Cancelled(reply))
            }
            Err(error) => {
                let error = TurnError::Provider(error.to_string());
                emit(RuntimeEvent::Error {
                    message: error.to_string(),
                });
                Err(ProviderRoundError::Failed(error))
            }
        }
    }
}

pub(crate) fn push_tool_result(messages: &mut Vec<ChatMessage>, result: &ToolResultRecord) {
    let mut message = ChatMessage::text(Role::User, "");
    message.tool_result = Some(result.clone());
    messages.push(message);
}

fn cancelled(partial: String, emit: &mut dyn FnMut(RuntimeEvent)) -> TurnOutcome {
    emit(RuntimeEvent::Cancelled {
        partial: partial.clone(),
    });
    TurnOutcome::Cancelled { partial }
}
