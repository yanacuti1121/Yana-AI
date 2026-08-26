use super::{
    AuthorityDecision, AuthorityLayer, RuntimeAuthority, RuntimeEvent, TurnContext, TurnOutcome,
    TurnRequest,
};
use crate::model::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use crate::model::tool::{StreamOutcome, ToolCall, ToolCallRecord, ToolResultRecord};
use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const DEFAULT_MAX_TOOL_ROUNDS: usize = 8;
const CANCELLED_MESSAGE: &str = "generation cancelled by user";

#[derive(Clone, Default)]
pub(crate) struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub(crate) fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

pub(crate) trait ToolExecutor: Send + Sync {
    fn execute(&self, context: &TurnContext, call: &ToolCall) -> ToolResultRecord;
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

    #[cfg(test)]
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
                        AuthorityDecision::Allow => {
                            emit(RuntimeEvent::ToolApproved {
                                call_id: call.id.clone(),
                            });
                            emit(RuntimeEvent::ToolStarted {
                                call_id: call.id.clone(),
                            });
                            let result = self.executor.execute(&request.context, &call);
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

fn push_tool_result(messages: &mut Vec<ChatMessage>, result: &ToolResultRecord) {
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
