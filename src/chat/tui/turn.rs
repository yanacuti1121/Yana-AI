//! `App::spawn_turn`/`App::finish_turn` and the cost-tracking helper they
//! share — split out of `tui.rs` (see that file's module doc) purely for
//! line-count budget; this is the network-call lifecycle for one chat
//! turn, still logically part of `App`.

use super::super::provider::{ChatMessage, ChatUsage, Role};
use super::{App, StreamEvent, TurnState};
use anyhow::Result;
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::Instant;

impl App {
    pub(super) fn spawn_turn(&mut self) {
        let provider = Arc::clone(&self.provider);
        let api_key = self.api_key.clone();
        let model = self.model.clone();
        let system = self.system.clone();
        let messages = self.history.clone();
        let (tx, rx) = mpsc::channel::<StreamEvent>();

        thread::spawn(move || {
            let mut on_chunk = |chunk: &str| -> Result<()> {
                tx.send(StreamEvent::Chunk(chunk.to_string())).ok();
                Ok(())
            };
            let result = provider.stream_chat(
                api_key.as_deref(),
                &model,
                system.as_deref(),
                &messages,
                &mut on_chunk,
            );
            tx.send(StreamEvent::Done(result)).ok();
        });

        self.turn = TurnState::Streaming(rx);
        self.turn_started_at = Some(Instant::now());
        self.streaming_reply.clear();
    }

    /// Near-verbatim port of the old single-threaded `run_turn`'s three
    /// match arms (Ok / Err-before-any-output / Err-mid-stream) — same
    /// conditions, same `history::append_assistant`/`track_cost`/
    /// `breaker.record_*` calls, writing to `self.status` instead of
    /// `println!`/`eprintln!`.
    pub(super) fn finish_turn(&mut self, result: Result<ChatUsage>) {
        let duration_ms = self
            .turn_started_at
            .take()
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(0);
        let reply = std::mem::take(&mut self.streaming_reply);
        self.turn = TurnState::Idle;

        match result {
            Ok(usage) => {
                self.breaker.record_success();
                self.history.push(ChatMessage { role: Role::Assistant, content: reply.clone() });
                self.status = match super::super::history::append_assistant(
                    &self.session_id, self.provider.name(), &self.model, &reply,
                    usage.input_tokens, usage.output_tokens, duration_ms, false, None,
                ) {
                    Ok(()) => String::new(),
                    Err(e) => format!("warning: failed to persist assistant message: {e}"),
                };
                track_cost(self.provider.name(), &self.model, usage, duration_ms);
            }
            Err(e) if reply.is_empty() => {
                // Failed before any output — nothing conversational
                // happened, so no phantom empty assistant turn is pushed
                // into history. Never dump the raw upstream error to the
                // screen; full detail only under --verbose.
                self.breaker.record_failure();
                self.status = if self.verbose {
                    format!("error: {e:#}")
                } else {
                    "error — request failed. Rerun with --verbose for details.".to_string()
                };
                if let Err(e2) = super::super::history::append_assistant(
                    &self.session_id, self.provider.name(), &self.model, "",
                    0, 0, duration_ms, true, Some(&e.to_string()),
                ) {
                    self.status = format!("{} (also failed to persist error record: {e2})", self.status);
                }
            }
            Err(e) => {
                // Died mid-stream — keep the partial reply as context for
                // the next turn instead of silently losing it.
                self.breaker.record_failure();
                self.status = if self.verbose {
                    format!("stream interrupted: {e:#}")
                } else {
                    "stream interrupted. Rerun with --verbose for details.".to_string()
                };
                self.history.push(ChatMessage { role: Role::Assistant, content: reply.clone() });
                if let Err(e2) = super::super::history::append_assistant(
                    &self.session_id, self.provider.name(), &self.model, &reply,
                    0, 0, duration_ms, true, Some(&e.to_string()),
                ) {
                    self.status = format!("{} (also failed to persist partial reply: {e2})", self.status);
                }
            }
        }
    }
}

/// Feed real, provider-reported token counts into the same cost ledger
/// every other yana-rt subcommand already writes to — not the
/// char_count/4 heuristic used elsewhere in this repo.
fn track_cost(provider_name: &str, model: &str, usage: ChatUsage, duration_ms: u64) {
    if usage.input_tokens == 0 && usage.output_tokens == 0 {
        return; // provider didn't report usage — nothing honest to log
    }
    let payload = serde_json::json!({
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "task": "chat",
        "tier": "standard",
        "model": format!("{provider_name}/{model}"),
        "duration_ms": duration_ms,
    });
    crate::cost::track_from_payload("chat", &payload);
}
