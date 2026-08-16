use super::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use super::tool_types::{StreamOutcome, ToolCall, ToolCallRecord, ToolResultRecord};
use super::{RuntimeEvent, TurnContext, TurnOutcome, TurnRequest};
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ToolDecision {
    Allow,
    Deny { reason: String },
}

pub(crate) trait ToolAuthorizer: Send + Sync {
    fn authorize(&self, context: &TurnContext, call: &ToolCall) -> ToolDecision;
}

pub(crate) trait ToolExecutor: Send + Sync {
    fn execute(&self, context: &TurnContext, call: &ToolCall) -> ToolResultRecord;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TurnError {
    Provider(String),
    ToolRoundLimit { limit: usize },
}

impl fmt::Display for TurnError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Provider(message) => write!(formatter, "provider failed: {message}"),
            Self::ToolRoundLimit { limit } => {
                write!(formatter, "tool-call round limit reached ({limit})")
            }
        }
    }
}

impl std::error::Error for TurnError {}

pub(crate) struct TurnEngine {
    provider: Arc<dyn ChatProvider>,
    authorizer: Arc<dyn ToolAuthorizer>,
    executor: Arc<dyn ToolExecutor>,
    max_tool_rounds: usize,
}

impl TurnEngine {
    pub(crate) fn new(
        provider: Arc<dyn ChatProvider>,
        authorizer: Arc<dyn ToolAuthorizer>,
        executor: Arc<dyn ToolExecutor>,
    ) -> Self {
        Self {
            provider,
            authorizer,
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

        let mut tool_results = Vec::new();
        let mut total_usage = ChatUsage::default();
        let mut tool_rounds = 0;

        loop {
            if cancellation.is_cancelled() {
                return Ok(cancelled(String::new(), emit));
            }

            emit(RuntimeEvent::MessageStarted);
            let mut reply = String::new();
            let provider_result = self.provider.stream_chat(
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

            let (usage, stream_outcome) = match provider_result {
                Ok(value) if !cancellation.is_cancelled() => value,
                Ok(_) => return Ok(cancelled(reply, emit)),
                Err(error)
                    if cancellation.is_cancelled()
                        || error.to_string().contains(CANCELLED_MESSAGE) =>
                {
                    return Ok(cancelled(reply, emit));
                }
                Err(error) => {
                    let error = TurnError::Provider(error.to_string());
                    emit(RuntimeEvent::Error {
                        message: error.to_string(),
                    });
                    return Err(error);
                }
            };

            total_usage.input_tokens = total_usage.input_tokens.saturating_add(usage.input_tokens);
            total_usage.output_tokens = total_usage
                .output_tokens
                .saturating_add(usage.output_tokens);
            emit(RuntimeEvent::Metrics(usage));
            emit(RuntimeEvent::MessageCompleted(reply.clone()));

            match stream_outcome {
                StreamOutcome::Text => {
                    emit(RuntimeEvent::TurnCompleted { tool_rounds });
                    return Ok(TurnOutcome::Completed {
                        message: reply,
                        usage: total_usage,
                        tool_results,
                    });
                }
                StreamOutcome::ToolCalls(calls) => {
                    if tool_rounds >= self.max_tool_rounds {
                        let error = TurnError::ToolRoundLimit {
                            limit: self.max_tool_rounds,
                        };
                        emit(RuntimeEvent::Error {
                            message: error.to_string(),
                        });
                        return Err(error);
                    }
                    tool_rounds += 1;
                    if !reply.is_empty() {
                        request
                            .messages
                            .push(ChatMessage::text(Role::Assistant, reply));
                    }
                    for call in calls {
                        if cancellation.is_cancelled() {
                            return Ok(cancelled(String::new(), emit));
                        }
                        self.handle_tool_call(
                            &request.context,
                            &mut request.messages,
                            &mut tool_results,
                            call,
                            emit,
                        );
                    }
                }
            }
        }
    }

    fn handle_tool_call(
        &self,
        context: &TurnContext,
        messages: &mut Vec<ChatMessage>,
        tool_results: &mut Vec<ToolResultRecord>,
        call: ToolCall,
        emit: &mut dyn FnMut(RuntimeEvent),
    ) {
        emit(RuntimeEvent::ToolRequested(call.clone()));
        let mut assistant = ChatMessage::text(Role::Assistant, "");
        assistant.tool_call = Some(ToolCallRecord::from(call.clone()));
        messages.push(assistant);

        let result = match self.authorizer.authorize(context, &call) {
            ToolDecision::Allow => {
                emit(RuntimeEvent::ToolApproved {
                    call_id: call.id.clone(),
                });
                emit(RuntimeEvent::ToolStarted {
                    call_id: call.id.clone(),
                });
                self.executor.execute(context, &call)
            }
            ToolDecision::Deny { reason } => {
                emit(RuntimeEvent::ToolDenied {
                    call_id: call.id.clone(),
                    reason: reason.clone(),
                });
                ToolResultRecord {
                    call_id: call.id.clone(),
                    output: reason,
                    is_error: true,
                    denied: true,
                }
            }
        };

        emit(RuntimeEvent::ToolCompleted(result.clone()));
        let mut tool_message = ChatMessage::text(Role::User, "");
        tool_message.tool_result = Some(result.clone());
        messages.push(tool_message);
        tool_results.push(result);
    }
}

fn cancelled(partial: String, emit: &mut dyn FnMut(RuntimeEvent)) -> TurnOutcome {
    emit(RuntimeEvent::Cancelled {
        partial: partial.clone(),
    });
    TurnOutcome::Cancelled { partial }
}
