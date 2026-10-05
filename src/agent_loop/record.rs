//! Saving a run's messages as the engine reports them.

use crate::model::provider::{ChatMessage, ChatUsage, Role};
use crate::model::tool::{ToolCallRecord, ToolResultRecord};
use crate::runtime::RuntimeEvent;
use crate::session_db::{MessageRow, SessionStore, SqliteSessionStore};
use chrono::Utc;

/// Turns the engine's events into saved messages, in the same shape the chat history uses:
/// an assistant text, then a separate assistant tool call, then the tool's result.
pub(super) struct Recorder<'a> {
    store: &'a SqliteSessionStore,
    session_id: String,
    next_seq: u32,
    pending_text: String,
    last_usage: Option<ChatUsage>,
    /// The first failure to save, if any. The run is stopped when this is set.
    pub error: Option<String>,
    /// The reason the engine gave when it asked for a person's approval.
    pub approval_reason: Option<String>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

impl<'a> Recorder<'a> {
    pub(super) fn new(store: &'a SqliteSessionStore, session_id: &str, saved: u32) -> Self {
        Self { store, session_id: session_id.to_string(), next_seq: saved + 1, pending_text: String::new(), last_usage: None, error: None, approval_reason: None }
    }

    fn append(&mut self, role: Role, content: String, tool_call: Option<String>, tool_result: Option<String>, usage: Option<ChatUsage>) {
        if self.error.is_some() {
            return;
        }
        let row = MessageRow {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: self.session_id.clone(),
            seq: self.next_seq,
            role,
            content,
            tool_call,
            tool_result,
            ts: now(),
            input_tokens: usage.map(|u| u.input_tokens),
            output_tokens: usage.map(|u| u.output_tokens),
        };
        match self.store.append_message(&row) {
            Ok(_) => self.next_seq += 1,
            Err(error) => self.error = Some(error.to_string()),
        }
    }

    pub(super) fn user(&mut self, text: &str) {
        self.append(Role::User, text.to_string(), None, None, None);
    }

    fn flush_text(&mut self) {
        if !self.pending_text.is_empty() {
            let text = std::mem::take(&mut self.pending_text);
            let usage = self.last_usage.take();
            self.append(Role::Assistant, text, None, None, usage);
        }
    }

    pub(super) fn on_event(&mut self, event: &RuntimeEvent) {
        match event {
            RuntimeEvent::Metrics(usage) => self.last_usage = Some(*usage),
            RuntimeEvent::MessageCompleted(text) => self.pending_text = text.clone(),
            RuntimeEvent::ToolRequested(call) => {
                self.flush_text();
                let record = serde_json::to_string(&ToolCallRecord::from(call.clone())).ok();
                self.append(Role::Assistant, String::new(), record, None, None);
            }
            RuntimeEvent::ToolCompleted(result) => {
                let record = serde_json::to_string::<ToolResultRecord>(result).ok();
                self.append(Role::User, String::new(), None, record, None);
            }
            RuntimeEvent::HumanApprovalRequired { reason, .. } => self.approval_reason = Some(reason.clone()),
            RuntimeEvent::TurnCompleted { .. } => self.flush_text(),
            RuntimeEvent::Cancelled { partial } => {
                if !partial.is_empty() {
                    self.pending_text = partial.clone();
                }
                self.flush_text();
            }
            _ => {}
        }
    }
}

/// A saved message back as a chat message the provider can be sent again.
pub(super) fn to_chat(row: &MessageRow) -> ChatMessage {
    let mut message = ChatMessage::text(row.role, row.content.clone());
    message.tool_call = row.tool_call.as_deref().and_then(|json| serde_json::from_str(json).ok());
    message.tool_result = row.tool_result.as_deref().and_then(|json| serde_json::from_str(json).ok());
    message
}
