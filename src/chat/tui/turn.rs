//! `App::spawn_turn`/`App::finish_turn` and the cost-tracking helper they
//! share — split out of `tui.rs` (see that file's module doc) purely for
//! line-count budget; this is the network-call lifecycle for one chat
//! turn, still logically part of `App`.

use super::super::provider::{ChatMessage, ChatProvider, ChatUsage, Role};
use super::super::tool_types::{StreamOutcome, ToolSpec};
use super::{App, StreamEvent, TurnState};
use crate::session_context::SessionContext;
use anyhow::Result;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::Instant;

/// AD-25/26: don't send a tool catalog to a provider that can't honor it.
/// Actionable, not silent — chat-only is a deliberate degrade, not a
/// swallowed error. Pure/testable on purpose (see tests below); every
/// current provider's `supports_tool_calling()` defaults `true`, so this
/// returns the identical catalog as before for all of them today.
fn tools_for_turn(provider: &dyn ChatProvider, ctx: &SessionContext) -> Vec<ToolSpec> {
    if provider.supports_tool_calling() {
        super::super::tools::catalog(ctx)
    } else {
        Vec::new()
    }
}

impl App {
    pub(super) fn spawn_turn(&mut self) {
        let provider = Arc::clone(&self.provider);
        let api_key = self.api_key.clone();
        let model = self.model.clone();
        let system = self.system.clone();
        let messages = self.history.clone();
        let (tx, rx) = mpsc::channel::<StreamEvent>();
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = Arc::clone(&cancel);

        let tools = tools_for_turn(self.provider.as_ref(), &self.session_context());
        thread::spawn(move || {
            let mut on_chunk = |chunk: &str| -> Result<()> {
                if worker_cancel.load(Ordering::Acquire) {
                    anyhow::bail!("generation cancelled by user");
                }
                tx.send(StreamEvent::Chunk(chunk.to_string())).ok();
                Ok(())
            };
            let result = provider.stream_chat(
                api_key.as_deref(),
                &model,
                system.as_deref(),
                &messages,
                &tools,
                &mut on_chunk,
            );
            let result = if worker_cancel.load(Ordering::Acquire) {
                Err(anyhow::anyhow!("generation cancelled by user"))
            } else {
                result
            };
            tx.send(StreamEvent::Done(result)).ok();
        });

        self.turn = TurnState::Streaming { rx, cancel };
        self.turn_started_at = Some(Instant::now());
        self.output_started_at = Some(Instant::now());
        self.output_chunks = 0;
        self.streaming_reply.clear();
    }

    /// Near-verbatim port of the old single-threaded `run_turn`'s three
    /// Ok/Err match arms, plus a new `Ok` sub-branch for
    /// `StreamOutcome::ToolCalls` (delegated to
    /// `tool_dispatch::handle_tool_calls` — see that file). Same
    /// conditions, same `history::append_assistant`/`track_cost`/
    /// `breaker.record_*` calls for the plain-text path, writing to
    /// `self.status` instead of `println!`/`eprintln!`.
    pub(super) fn finish_turn(&mut self, result: Result<(ChatUsage, StreamOutcome)>) {
        let duration_ms = self
            .turn_started_at
            .take()
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(0);
        let reply = std::mem::take(&mut self.streaming_reply);
        self.turn = TurnState::Idle;

        match result {
            Ok((usage, StreamOutcome::Text)) => {
                self.last_usage = usage;
                self.last_duration_ms = Some(duration_ms);
                self.breaker.record_success();
                self.history
                    .push(ChatMessage::text(Role::Assistant, reply.clone()));
                if self.settings.privacy.log_messages {
                    self.status = match super::super::history::append_assistant(
                        &self.session_id,
                        self.provider.name(),
                        &self.model,
                        &reply,
                        usage.input_tokens,
                        usage.output_tokens,
                        duration_ms,
                        false,
                        None,
                    ) {
                        Ok(()) => String::new(),
                        Err(e) => format!("warning: failed to persist assistant message: {e}"),
                    };
                }
                track_cost(self.provider.name(), &self.model, usage, duration_ms);
            }
            // The network call itself succeeded (a valid tool-call
            // response came back) — `breaker` tracks connection health,
            // not conversational completion, so a success is recorded
            // here too, same as the plain-text arm above.
            Ok((usage, StreamOutcome::ToolCalls(calls))) => {
                self.last_usage = usage;
                self.last_duration_ms = Some(duration_ms);
                self.breaker.record_success();
                // A model can stream preamble text ("Let me check that
                // file...") in the same turn it proposes a tool call —
                // `reply` must not be silently dropped just because this
                // turn didn't end in plain `Text`. Same push/persist/cost
                // shape as the Text arm above, just conditional on there
                // being anything to show.
                if !reply.is_empty() {
                    self.history
                        .push(ChatMessage::text(Role::Assistant, reply.clone()));
                    if self.settings.privacy.log_messages {
                        if let Err(e) = super::super::history::append_assistant(
                            &self.session_id,
                            self.provider.name(),
                            &self.model,
                            &reply,
                            usage.input_tokens,
                            usage.output_tokens,
                            duration_ms,
                            false,
                            None,
                        ) {
                            self.status =
                                format!("warning: failed to persist assistant preamble: {e}");
                        }
                    }
                    track_cost(self.provider.name(), &self.model, usage, duration_ms);
                }
                self.handle_tool_calls(calls);
            }
            Err(error) if error.to_string().contains("generation cancelled by user") => {
                self.status = "generation stopped".to_string();
                if !reply.is_empty() {
                    self.history
                        .push(ChatMessage::text(Role::Assistant, reply.clone()));
                    if self.settings.privacy.log_messages {
                        let _ = super::super::history::append_assistant(
                            &self.session_id,
                            self.provider.name(),
                            &self.model,
                            &reply,
                            0,
                            0,
                            duration_ms,
                            true,
                            Some("cancelled by user"),
                        );
                    }
                }
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
                if self.settings.privacy.log_messages {
                    if let Err(e2) = super::super::history::append_assistant(
                        &self.session_id,
                        self.provider.name(),
                        &self.model,
                        "",
                        0,
                        0,
                        duration_ms,
                        true,
                        Some(&e.to_string()),
                    ) {
                        self.status = format!(
                            "{} (also failed to persist error record: {e2})",
                            self.status
                        );
                    }
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
                self.history
                    .push(ChatMessage::text(Role::Assistant, reply.clone()));
                if self.settings.privacy.log_messages {
                    if let Err(e2) = super::super::history::append_assistant(
                        &self.session_id,
                        self.provider.name(),
                        &self.model,
                        &reply,
                        0,
                        0,
                        duration_ms,
                        true,
                        Some(&e.to_string()),
                    ) {
                        self.status = format!(
                            "{} (also failed to persist partial reply: {e2})",
                            self.status
                        );
                    }
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
    if let Err(error) = crate::cost::track_from_payload("chat", &payload) {
        eprintln!("[cost] chat accounting failed: {error:#}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct NoToolCallingProvider;

    impl ChatProvider for NoToolCallingProvider {
        fn name(&self) -> &str {
            "no-tool-calling"
        }
        fn default_model(&self) -> &str {
            "raw-completion"
        }
        fn requires_key(&self) -> bool {
            false
        }
        fn env_var(&self) -> &str {
            ""
        }
        fn supports_tool_calling(&self) -> bool {
            false
        }
        fn stream_chat(
            &self,
            _api_key: Option<&str>,
            _model: &str,
            _system: Option<&str>,
            _messages: &[ChatMessage],
            _tools: &[ToolSpec],
            _on_chunk: &mut dyn FnMut(&str) -> Result<()>,
        ) -> Result<(ChatUsage, StreamOutcome)> {
            anyhow::bail!("not exercised by this test")
        }
    }

    fn ctx() -> SessionContext {
        SessionContext::new("s", PathBuf::from("/tmp"), "no-tool-calling", "m", false)
    }

    #[test]
    fn provider_without_tool_calling_gets_empty_catalog() {
        let tools = tools_for_turn(&NoToolCallingProvider, &ctx());
        assert!(tools.is_empty());
    }

    #[test]
    fn default_supports_tool_calling_is_true_and_returns_the_real_catalog() {
        struct DefaultProvider;
        impl ChatProvider for DefaultProvider {
            fn name(&self) -> &str {
                "default"
            }
            fn default_model(&self) -> &str {
                "m"
            }
            fn requires_key(&self) -> bool {
                false
            }
            fn env_var(&self) -> &str {
                ""
            }
            fn stream_chat(
                &self,
                _api_key: Option<&str>,
                _model: &str,
                _system: Option<&str>,
                _messages: &[ChatMessage],
                _tools: &[ToolSpec],
                _on_chunk: &mut dyn FnMut(&str) -> Result<()>,
            ) -> Result<(ChatUsage, StreamOutcome)> {
                anyhow::bail!("not exercised by this test")
            }
        }
        assert!(DefaultProvider.supports_tool_calling());
        let tools = tools_for_turn(&DefaultProvider, &ctx());
        assert_eq!(tools.len(), 2);
    }
}
