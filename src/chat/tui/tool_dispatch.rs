//! Terminal adapter for the canonical capability runtime.
//!
//! `TurnEngine` owns provider/tool looping. This module only supplies the
//! terminal's capability executor, reconciles runtime-created conversation
//! records into the tab, and prepares the existing y/N command approval UI.

use super::super::provider::{ChatMessage, Role};
use super::super::tool_types::{ToolCall, ToolResultRecord};
use super::super::tools;
use super::{App, PendingApproval, TurnState};
use crate::runtime::{ApprovedTool, ToolExecutor, TurnContext};

/// `pub(crate)` (not `pub(super)`): reused by `chat::headless`'s remote
/// approval continuation (Authority Hardening item #5) so Desktop/packaged
/// Web get the exact same capability dispatch Terminal already has,
/// rather than a second, independently-written executor.
pub(crate) struct ChatCapabilityExecutor {
    use_sandbox: bool,
}

impl ChatCapabilityExecutor {
    pub(crate) fn new(use_sandbox: bool) -> Self {
        Self { use_sandbox }
    }
}

impl ToolExecutor for ChatCapabilityExecutor {
    fn execute(&self, context: &TurnContext, call: &ToolCall) -> ToolResultRecord {
        match call.name.as_str() {
            "read_file" => match parse_string_arg(&call.arguments_json, "path") {
                Some(path) => match tools::read_file::execute(&context.session.repo_root, &path) {
                    Ok(content) => tool_result(call, content, false, false),
                    Err(error) => tool_result(call, error, true, false),
                },
                None => tool_result(
                    call,
                    "missing required argument 'path'".to_string(),
                    true,
                    false,
                ),
            },
            other => tool_result(
                call,
                format!("terminal executor has no implementation for '{other}'"),
                true,
                true,
            ),
        }
    }

    fn execute_approved(&self, approved: ApprovedTool<'_>) -> ToolResultRecord {
        let call = approved.call();
        match call.name.as_str() {
            "run_command" => {
                let Some(command) = parse_string_arg(&call.arguments_json, "command") else {
                    return tool_result(
                        call,
                        "missing required argument 'command'".to_string(),
                        true,
                        false,
                    );
                };
                match tools::run_command::validate(&command) {
                    Ok(validated) if validated.guard_verdict.is_none() => command_result(
                        call,
                        tools::run_command::execute(
                            &approved.context().session.repo_root,
                            &validated.argv,
                            self.use_sandbox,
                        ),
                    ),
                    Ok(validated) => tool_result(
                        call,
                        format!(
                            "blocked by guard: {}",
                            validated.guard_verdict.unwrap_or("blocked")
                        ),
                        true,
                        true,
                    ),
                    Err(error) => tool_result(
                        call,
                        format!("cannot validate command: {error}"),
                        true,
                        true,
                    ),
                }
            }
            "write_file" => {
                let session_id = approved.context().session.session_id.clone();
                file_write_result(call, approved.context(), session_id)
            }
            other => tool_result(
                call,
                format!("approved executor does not support '{other}'"),
                true,
                true,
            ),
        }
    }
}

/// Deserialized shape of `write_file`'s `arguments_json` — mirrors the
/// `file.write` capability's `input_schema` in `registry_data.rs` exactly
/// (path/content/kind, all required); a model call missing or
/// mis-shaping one of these fails to parse here rather than reaching
/// `apply_file_write` with a guessed default.
#[derive(serde::Deserialize)]
struct WriteFileArgs {
    path: String,
    content: String,
    kind: String,
}

fn parse_mutation_kind(raw: &str) -> Option<crate::capability::FileMutationKind> {
    match raw {
        "create" => Some(crate::capability::FileMutationKind::Create),
        "overwrite" => Some(crate::capability::FileMutationKind::Overwrite),
        _ => None,
    }
}

/// Executes an already-approved `write_file` call for real
/// (`crate::capability::apply_file_write`: backup -> atomic write ->
/// verify -> evidence). Called only from `execute_approved`, which the
/// runtime authority chain only invokes after `HumanApprovalPerCall` has
/// been satisfied — this function has no approval logic of its own.
fn file_write_result(
    call: &ToolCall,
    context: &TurnContext,
    session_id: String,
) -> ToolResultRecord {
    let Ok(args) = serde_json::from_str::<WriteFileArgs>(&call.arguments_json) else {
        return tool_result(
            call,
            "missing or invalid arguments for write_file (need path, content, kind)".to_string(),
            true,
            false,
        );
    };
    let Some(kind) = parse_mutation_kind(&args.kind) else {
        return tool_result(
            call,
            format!("unknown kind '{}' — expected create or overwrite", args.kind),
            true,
            false,
        );
    };
    match crate::capability::apply_file_write(
        &context.session.repo_root,
        &args.path,
        kind,
        &args.content,
        Some(session_id),
    ) {
        Ok(outcome) => tool_result(
            call,
            format!(
                "wrote {} ({} bytes, sha256 {}){}",
                args.path,
                outcome.evidence.byte_count.unwrap_or(0),
                outcome.evidence.sha256.as_deref().unwrap_or("unknown"),
                outcome
                    .backup_path
                    .map(|p| format!(", backup at {p}"))
                    .unwrap_or_default(),
            ),
            false,
            false,
        ),
        Err(error) => tool_result(call, format!("write failed: {error}"), true, true),
    }
}

impl App {
    pub(super) fn prepare_pending_approval(&mut self, call: ToolCall) {
        match call.name.as_str() {
            "run_command" => self.prepare_command_approval(call),
            "write_file" => self.prepare_write_file_approval(call),
            other => {
                self.push_tool_result(
                    &call.id,
                    format!("unsupported approval request for '{other}'"),
                    true,
                    true,
                );
                self.continue_after_tool_result();
            }
        }
    }

    fn prepare_command_approval(&mut self, call: ToolCall) {
        let Some(command) = parse_string_arg(&call.arguments_json, "command") else {
            self.push_tool_result(
                &call.id,
                "missing required argument 'command'".to_string(),
                true,
                false,
            );
            self.continue_after_tool_result();
            return;
        };
        match tools::run_command::validate(&command) {
            Ok(validated) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval::Command {
                    call,
                    command,
                    argv: validated.argv,
                    guard_verdict: validated.guard_verdict,
                });
            }
            Err(error) => {
                self.push_tool_result(
                    &call.id,
                    format!("cannot parse command: {error}"),
                    true,
                    false,
                );
                self.continue_after_tool_result();
            }
        }
    }

    /// Computes the diff (read-only — `propose_file_write` never touches
    /// the filesystem) up front so the approval prompt itself can show it,
    /// rather than the human approving a path/kind pair blind and finding
    /// out what changed only after the fact.
    fn prepare_write_file_approval(&mut self, call: ToolCall) {
        let Ok(args) = serde_json::from_str::<WriteFileArgs>(&call.arguments_json) else {
            self.push_tool_result(
                &call.id,
                "missing or invalid arguments for write_file (need path, content, kind)".to_string(),
                true,
                false,
            );
            self.continue_after_tool_result();
            return;
        };
        let Some(kind) = parse_mutation_kind(&args.kind) else {
            self.push_tool_result(
                &call.id,
                format!("unknown kind '{}' — expected create or overwrite", args.kind),
                true,
                false,
            );
            self.continue_after_tool_result();
            return;
        };
        let root = self.session_context().repo_root;
        match crate::capability::propose_file_write(&root, &args.path, kind, &args.content) {
            Ok(diff) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval::FileWrite {
                    call,
                    path: args.path,
                    kind,
                    content: args.content,
                    diff,
                });
            }
            Err(error) => {
                self.push_tool_result(&call.id, format!("cannot propose write: {error}"), true, false);
                self.continue_after_tool_result();
            }
        }
    }

    pub(super) fn adopt_runtime_messages(&mut self, messages: Vec<ChatMessage>) -> bool {
        let existing_len = self.history.len();
        if messages.len() < existing_len || messages[..existing_len] != self.history[..] {
            self.status =
                "runtime returned a non-contiguous conversation; refusing to replace history"
                    .to_string();
            return false;
        }
        if self.settings.privacy.log_messages {
            for message in messages.iter().skip(existing_len) {
                let result = if let Some(record) = &message.tool_call {
                    super::super::history::append_tool_call(
                        &self.session_id,
                        self.provider.name(),
                        &self.model,
                        record,
                    )
                } else if let Some(record) = &message.tool_result {
                    super::super::history::append_tool_result(&self.session_id, record)
                } else if message.role == Role::Assistant && !message.content.is_empty() {
                    super::super::history::append_assistant(
                        &self.session_id,
                        self.provider.name(),
                        &self.model,
                        &message.content,
                        0,
                        0,
                        0,
                        false,
                        None,
                    )
                } else {
                    Ok(())
                };
                if let Err(error) = result {
                    self.status = format!("warning: failed to persist runtime message: {error}");
                }
            }
        }
        self.history = messages;
        true
    }

    /// Persists + pushes a tool-result turn (see `history.rs`'s module
    /// doc for the `role: User` / empty-`content` convention). Shared by
    /// the read_file/run_command dispatch paths above and by
    /// `approval.rs`'s post-execution/denial handling.
    pub(super) fn push_tool_result(
        &mut self,
        call_id: &str,
        output: String,
        is_error: bool,
        denied: bool,
    ) {
        let record = ToolResultRecord {
            call_id: call_id.to_string(),
            output,
            is_error,
            denied,
        };
        if self.settings.privacy.log_messages {
            if let Err(e) = super::super::history::append_tool_result(&self.session_id, &record) {
                self.status = format!("warning: failed to persist tool result: {e}");
            }
        }
        let mut msg = ChatMessage::text(Role::User, "");
        msg.tool_result = Some(record);
        self.history.push(msg);
    }
}

/// Pulls a single string field out of a tool call's raw `arguments_json`.
/// Malformed/missing → `None`, handled by each dispatch site as a normal
/// tool-result error, not a panic or a silently-empty argument.
fn parse_string_arg(arguments_json: &str, key: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(arguments_json).ok()?;
    v.get(key)?.as_str().map(|s| s.to_string())
}

fn tool_result(call: &ToolCall, output: String, is_error: bool, denied: bool) -> ToolResultRecord {
    ToolResultRecord {
        call_id: call.id.clone(),
        output,
        is_error,
        denied,
    }
}

fn command_result(
    call: &ToolCall,
    result: Result<tools::run_command::ExecOutcome, String>,
) -> ToolResultRecord {
    match result {
        Ok(outcome) => {
            let mut output = outcome.stdout;
            if !outcome.stderr.is_empty() {
                output.push_str("\n[stderr]\n");
                output.push_str(&outcome.stderr);
            }
            if outcome.truncated {
                output.push_str("\n[output truncated]");
            }
            let is_error = outcome.exit_code != Some(0);
            if is_error {
                output = format!(
                    "[exit code {}]\n{output}",
                    outcome
                        .exit_code
                        .map_or("unknown".to_string(), |code| code.to_string())
                );
            }
            tool_result(call, output, is_error, false)
        }
        Err(error) => tool_result(call, format!("execution failed: {error}"), true, false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::provider::{ChatProvider, ChatUsage};
    use crate::chat::tool_types::{StreamOutcome, ToolSpec};
    use crate::runtime::{
        execute_approved_tool, CancellationToken, TurnOrigin, YanaAuthorityChain,
    };
    use anyhow::Result;
    use std::sync::Arc;
    use uuid::Uuid;

    struct FakeProvider;

    impl ChatProvider for FakeProvider {
        fn name(&self) -> &str {
            "fake"
        }
        fn default_model(&self) -> &str {
            "local-test"
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
            Ok((ChatUsage::default(), StreamOutcome::Text))
        }
    }

    fn app() -> App {
        let mut app = App::new(
            Arc::new(FakeProvider),
            "local-test".to_string(),
            None,
            None,
            Uuid::new_v4().to_string(),
            Vec::new(),
            false,
            true,
            true,
        );
        app.settings.autosave = false;
        app
    }

    /// Regression test for the round-guard bypass found in review: each of
    /// `prepare_pending_approval`'s three error branches (unsupported tool
    /// name, missing `command` argument, unparseable command) used to call
    /// `self.spawn_turn()` directly, skipping `tool_rounds.exceeded()`
    /// entirely — a model that kept proposing a malformed/unsupported tool
    /// call could re-enter the turn loop forever through this path, with
    /// no backstop from the TUI-local guard (only the separate runtime-side
    /// round counter would eventually apply). This exercises the
    /// unsupported-tool-name branch; the other two branches are the same
    /// one-line `continue_after_tool_result()` call.
    #[test]
    fn prepare_pending_approval_respects_the_round_guard_on_error_paths() {
        let mut app = app();
        app.tool_rounds.set_rounds(9); // one past the default ceiling of 8
        app.prepare_pending_approval(ToolCall {
            id: "call-1".into(),
            name: "not_a_real_tool".into(),
            arguments_json: "{}".into(),
        });
        assert!(
            app.status.contains("tool-call limit reached"),
            "expected the round-limit message, got: {}",
            app.status
        );
        assert!(
            matches!(app.turn, TurnState::Idle),
            "spawn_turn must not run once the round guard is exceeded"
        );
    }

    #[test]
    fn prepare_pending_approval_computes_a_diff_for_write_file() {
        let mut app = app();
        // propose_file_write is read-only (no fs::write), so this is safe
        // to run against the real process cwd — it must produce
        // AwaitingApproval(FileWrite) with the diff computed up front,
        // never touching the filesystem itself.
        app.prepare_pending_approval(ToolCall {
            id: "call-1".into(),
            name: "write_file".into(),
            arguments_json: r#"{"path":"whatever-relative-name.txt","content":"hi","kind":"create"}"#
                .into(),
        });
        match &app.turn {
            TurnState::AwaitingApproval(PendingApproval::FileWrite { path, diff, .. }) => {
                assert_eq!(path, "whatever-relative-name.txt");
                assert_eq!(diff.kind_label, "create");
            }
            TurnState::Idle => panic!("expected AwaitingApproval(FileWrite), got Idle — status: {}", app.status),
            _ => panic!("expected AwaitingApproval(FileWrite), got a different turn state"),
        }
    }

    #[test]
    fn prepare_pending_approval_rejects_write_file_with_bad_kind_without_entering_approval() {
        let mut app = app();
        // Past the round ceiling so `continue_after_tool_result()` stops at
        // the guard instead of spawning a new turn against `FakeProvider`
        // — same technique `prepare_pending_approval_respects_the_round_guard_on_error_paths`
        // above already uses to keep `app.turn` observable as `Idle`.
        app.tool_rounds.set_rounds(9);
        app.prepare_pending_approval(ToolCall {
            id: "call-1".into(),
            name: "write_file".into(),
            arguments_json: r#"{"path":"x.txt","content":"y","kind":"rename"}"#.into(),
        });
        assert!(matches!(app.turn, TurnState::Idle));
        assert!(app
            .history
            .last()
            .and_then(|m| m.tool_result.as_ref())
            .map(|r| r.is_error)
            .unwrap_or(false));
    }

    fn context(root: &std::path::Path) -> TurnContext {
        TurnContext::new(
            crate::session_context::SessionContext::new(
                "s",
                root.to_path_buf(),
                "mock",
                "mock",
                true,
            ),
            TurnOrigin::Terminal,
            true,
        )
    }

    #[test]
    fn terminal_executor_reads_through_the_canonical_capability() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("note.txt"), "hello").unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let result = executor.execute(
            &context(root.path()),
            &ToolCall {
                id: "call-1".into(),
                name: "read_file".into(),
                arguments_json: r#"{"path":"note.txt"}"#.into(),
            },
        );
        assert_eq!(result.output, "hello");
        assert!(!result.is_error);
    }

    #[test]
    fn terminal_executor_never_executes_mutating_tools() {
        let root = tempfile::tempdir().unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let result = executor.execute(
            &context(root.path()),
            &ToolCall {
                id: "call-1".into(),
                name: "run_command".into(),
                arguments_json: r#"{"command":"touch should-not-exist"}"#.into(),
            },
        );
        assert!(result.denied);
        assert!(!root.path().join("should-not-exist").exists());
    }

    #[test]
    fn canonical_approved_path_executes_mutating_tools_once() {
        let root = tempfile::tempdir().unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let call = ToolCall {
            id: "call-1".into(),
            name: "run_command".into(),
            arguments_json: r#"{"command":"touch approved-command"}"#.into(),
        };

        let result = execute_approved_tool(
            &YanaAuthorityChain,
            &executor,
            &context(root.path()),
            &call,
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();

        assert!(!result.denied);
        assert!(!result.is_error);
        assert!(root.path().join("approved-command").exists());
    }

    #[test]
    fn terminal_executor_never_writes_files_without_approval() {
        let root = tempfile::tempdir().unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let result = executor.execute(
            &context(root.path()),
            &ToolCall {
                id: "call-1".into(),
                name: "write_file".into(),
                arguments_json: r#"{"path":"new.txt","content":"hi","kind":"create"}"#.into(),
            },
        );
        assert!(result.denied);
        assert!(!root.path().join("new.txt").exists());
    }

    /// Same shape as `canonical_approved_path_executes_mutating_tools_once`,
    /// for `write_file` — proves the capability works end to end through
    /// the real `YanaAuthorityChain` (HALT check, registry lookup,
    /// `HumanApprovalPerCall` gate honored via `human_approved: true` on
    /// `context`), not just through `file_mutation`'s own unit tests.
    #[test]
    fn canonical_approved_path_writes_a_file_once() {
        let root = tempfile::tempdir().unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let call = ToolCall {
            id: "call-1".into(),
            name: "write_file".into(),
            arguments_json: r#"{"path":"created.txt","content":"hello from an approved call\n","kind":"create"}"#.into(),
        };

        let result = execute_approved_tool(
            &YanaAuthorityChain,
            &executor,
            &context(root.path()),
            &call,
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();

        assert!(!result.denied);
        assert!(!result.is_error);
        assert_eq!(
            std::fs::read_to_string(root.path().join("created.txt")).unwrap(),
            "hello from an approved call\n"
        );
    }

    #[test]
    fn canonical_approved_path_rejects_an_unknown_write_kind() {
        let root = tempfile::tempdir().unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let call = ToolCall {
            id: "call-1".into(),
            name: "write_file".into(),
            arguments_json: r#"{"path":"x.txt","content":"y","kind":"delete"}"#.into(),
        };
        let result = execute_approved_tool(
            &YanaAuthorityChain,
            &executor,
            &context(root.path()),
            &call,
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();
        assert!(result.is_error);
        assert!(!root.path().join("x.txt").exists());
    }
}
