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
const RESUME_REFUSED: &str = "blocked: the configuration of this external program could not be read, or is not the one that was approved (it, or the PATH of this process, may differ from the one that created the approval); ask again from the process that created the approval";

pub(crate) struct ChatCapabilityExecutor {
    use_sandbox: bool,
    /// For an approved `mcp_call`: exactly what the approver saw. When present
    /// the call runs that configuration or nothing; when absent (a resumed
    /// remote approval) the configuration is disclosed again right before the
    /// call, after `resume_turn` has checked it against the stored reason.
    approved_mcp: Option<crate::capability::mcp_disclosure::Disclosure>,
    /// The same for an approved `lsp_query`.
    approved_lsp: Option<crate::capability::lsp_disclosure::LspDisclosure>,
    /// A resumed approval whose configuration could not be disclosed, or no longer matches what
    /// was approved: every external-program call is refused.
    resume_refused: bool,
    /// Plan mode: refuse every tool that is not read-only, even if the model asks for one that was never offered.
    plan_mode: bool,
}

impl ChatCapabilityExecutor {
    pub(crate) fn new(use_sandbox: bool) -> Self {
        Self { use_sandbox, approved_mcp: None, approved_lsp: None, resume_refused: false, plan_mode: false }
    }

    pub(crate) fn in_plan_mode(mut self, plan_mode: bool) -> Self {
        self.plan_mode = plan_mode;
        self
    }

    pub(crate) fn with_approved_mcp(mut self, approved: Option<crate::capability::mcp_disclosure::Disclosure>) -> Self {
        self.approved_mcp = approved;
        self
    }

    /// For a resumed approval: disclose the call's configuration NOW, before the turn is resumed,
    /// require that it is exactly what the stored approval was for (`authority_reason` ends with
    /// ` | <summary>`), and bind the executor to it. `resume_turn` then checks the stored
    /// approval again and the gateway checks this disclosure against the configuration read at
    /// run time, so a configuration changed at any point in between runs nothing. Anything that
    /// cannot be disclosed or does not match the approval makes the executor REFUSE the call
    /// (it never falls back to disclosing again later). Calls that start no external program
    /// are left alone.
    pub(crate) fn bound_to_current_configuration(mut self, call: &ToolCall, root: &std::path::Path, authority_reason: &str) -> Self {
        if !matches!(call.name.as_str(), "mcp_call" | "lsp_query") {
            return self;
        }
        let args: serde_json::Value = serde_json::from_str(&call.arguments_json).unwrap_or(serde_json::Value::Null);
        let matches_approval = matches!(
            crate::runtime::disclosure_summary(root, call),
            Ok(Some(summary)) if authority_reason.ends_with(&format!(" | {summary}"))
        );
        if !matches_approval {
            self.resume_refused = true;
            return self;
        }
        match call.name.as_str() {
            "mcp_call" => {
                let command = args.get("command").and_then(|c| c.as_str()).unwrap_or("");
                self.approved_mcp = crate::capability::mcp_disclosure::disclose(root, command).ok();
                self.resume_refused = self.approved_mcp.is_none();
            }
            _ => {
                self.approved_lsp = crate::capability::lsp_disclosure::disclose(root, &args).ok();
                self.resume_refused = self.approved_lsp.is_none();
            }
        }
        self
    }

    pub(crate) fn with_approved_lsp(mut self, approved: Option<crate::capability::lsp_disclosure::LspDisclosure>) -> Self {
        self.approved_lsp = approved;
        self
    }

    /// Run an approved `lsp_query`. Needs the `lsp` feature; a build without it says so.
    fn approved_lsp_call(&self, call: &ToolCall, root: &std::path::Path) -> ToolResultRecord {
        if self.resume_refused {
            return tool_result(call, RESUME_REFUSED.to_string(), true, true);
        }
        let arguments: serde_json::Value = serde_json::from_str(&call.arguments_json).unwrap_or(serde_json::Value::Null);
        let disclosure = match self.approved_lsp.clone().map(Ok).unwrap_or_else(|| crate::capability::lsp_disclosure::disclose(root, &arguments)) {
            Ok(disclosure) => disclosure,
            Err(error) => return tool_result(call, format!("language server query refused: {error}"), true, false),
        };
        #[cfg(feature = "lsp")]
        {
            return match crate::lsp_client::gateway::lsp_query(root, &arguments, &disclosure) {
                Ok(answer) => tool_result(call, answer, false, false),
                Err(error) => tool_result(call, format!("language server query failed: {error}"), true, false),
            };
        }
        #[cfg(not(feature = "lsp"))]
        {
            let _ = (&arguments, &disclosure);
            tool_result(call, "this build of yana-rt was made without language server support".to_string(), true, false)
        }
    }

    /// Run an approved `mcp_call`. Needs the `mcp` feature; a build without it says so.
    fn approved_mcp_call(&self, call: &ToolCall, root: &std::path::Path) -> ToolResultRecord {
        if self.resume_refused {
            return tool_result(call, RESUME_REFUSED.to_string(), true, true);
        }
        let args: serde_json::Value = serde_json::from_str(&call.arguments_json).unwrap_or(serde_json::Value::Null);
        let Some(command) = args.get("command").and_then(|c| c.as_str()) else {
            return tool_result(call, "missing required argument 'command'".to_string(), true, false);
        };
        let arguments = args.get("arguments").cloned().unwrap_or(serde_json::Value::Null);
        let disclosure = match self.approved_mcp.clone().map(Ok).unwrap_or_else(|| crate::capability::mcp_disclosure::disclose(root, command)) {
            Ok(disclosure) => disclosure,
            Err(error) => return tool_result(call, format!("mcp call refused: {error}"), true, false),
        };
        #[cfg(feature = "mcp")]
        {
            return match crate::mcp_client::gateway::mcp_call(root, command, &arguments, &disclosure) {
                Ok(answer) => tool_result(call, answer, false, false),
                Err(error) => tool_result(call, format!("mcp call failed: {error}"), true, false),
            };
        }
        #[cfg(not(feature = "mcp"))]
        {
            let _ = (&arguments, &disclosure);
            tool_result(call, "this build of yana-rt was made without MCP client support".to_string(), true, false)
        }
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
            "repo_tree" | "search_code" | "git_status" | "git_diff" => {
                let result = read_only_result(&context.session.repo_root, &call.name, &call.arguments_json);
                match result {
                    Ok(output) => tool_result(call, output, false, false),
                    Err(error) => tool_result(call, error, true, false),
                }
            }
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
        if self.plan_mode && !tools::is_plan_mode_tool(&call.name) {
            return tool_result(
                call,
                "Plan mode is on: this tool is turned off. Put the change in your plan instead of making it.".to_string(),
                true,
                true,
            );
        }
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
                file_write_result(call, approved.context(), session_id, false)
            }
            "write_config" => {
                let session_id = approved.context().session.session_id.clone();
                file_write_result(call, approved.context(), session_id, true)
            }
            "patch_file" => {
                let session_id = approved.context().session.session_id.clone();
                file_patch_result(call, approved.context(), session_id)
            }
            "mcp_call" => self.approved_mcp_call(call, &approved.context().session.repo_root),
            "lsp_query" => self.approved_lsp_call(call, &approved.context().session.repo_root),
            "web_search" => match parse_string_arg(&call.arguments_json, "query") {
                Some(query) => match crate::capability::web_search::web_search(&approved.context().session.repo_root, &query) {
                    Ok(answer) => tool_result(call, answer, false, false),
                    Err(error) => tool_result(call, format!("search failed: {error}"), true, false),
                },
                None => tool_result(call, "missing required argument 'query'".to_string(), true, false),
            },
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

/// Executes an already-approved `write_file`/`write_config` call for real
/// (`crate::capability::apply_file_write`/`apply_config_write`: backup ->
/// atomic write -> verify -> evidence). Called only from
/// `execute_approved`, which the runtime authority chain only invokes
/// after `HumanApprovalPerCall` has been satisfied — this function has no
/// approval logic of its own. `is_config` picks which of the two apply
/// functions runs; both take identical arguments and return the same
/// `FileMutationOutcome` shape, so the result formatting below is shared.
fn file_write_result(
    call: &ToolCall,
    context: &TurnContext,
    session_id: String,
    is_config: bool,
) -> ToolResultRecord {
    let Ok(args) = serde_json::from_str::<WriteFileArgs>(&call.arguments_json) else {
        return tool_result(
            call,
            format!(
                "missing or invalid arguments for {} (need path, content, kind)",
                call.name
            ),
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
    let root = &context.session.repo_root;
    let outcome = if is_config {
        crate::capability::apply_config_write(root, &args.path, kind, &args.content, Some(session_id))
    } else {
        crate::capability::apply_file_write(root, &args.path, kind, &args.content, Some(session_id))
    };
    match outcome {
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

/// Executes an already-approved `patch_file` call: the edits are re-matched against the file as it is
/// now, then written through the same governed path as `write_file` (backup, atomic write, hash check).
/// A match failure is reported to the model so it can retry; it is not a denial.
fn file_patch_result(call: &ToolCall, context: &TurnContext, session_id: String) -> ToolResultRecord {
    let (path, edits) = match crate::capability::file_patch::parse_patch_call(&call.arguments_json) {
        Ok(parsed) => parsed,
        Err(error) => return tool_result(call, format!("cannot patch: {error}"), true, false),
    };
    match crate::capability::file_patch::apply_file_patch(&context.session.repo_root, &path, &edits, Some(session_id)) {
        Ok((outcome, reports)) => tool_result(
            call,
            format!(
                "patched {} ({} edits applied, {} bytes, sha256 {}){}",
                path,
                reports.len(),
                outcome.evidence.byte_count.unwrap_or(0),
                outcome.evidence.sha256.as_deref().unwrap_or("unknown"),
                outcome.backup_path.map(|p| format!(", backup at {p}")).unwrap_or_default(),
            ),
            false,
            false,
        ),
        Err(error) => tool_result(call, format!("patch failed, nothing was written: {error}"), true, false),
    }
}

impl App {
    pub(super) fn prepare_pending_approval(&mut self, call: ToolCall) {
        match call.name.as_str() {
            "run_command" => self.prepare_command_approval(call),
            "write_file" => self.prepare_write_file_approval(call, false),
            "write_config" => self.prepare_write_file_approval(call, true),
            "patch_file" => self.prepare_patch_file_approval(call),
            "web_search" => self.prepare_web_search_approval(call),
            "mcp_call" => self.prepare_mcp_approval(call),
            "lsp_query" => self.prepare_lsp_approval(call),
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

    /// Starting an external program is the point of an `mcp_call`, so the prompt
    /// shows the exact command line (quoted) and the variable names passed. A
    /// configuration nobody confirmed, a malformed call text, or an unlisted
    /// server never reaches `AwaitingApproval`: the model is told why instead.
    fn prepare_mcp_approval(&mut self, call: ToolCall) {
        let args: serde_json::Value = serde_json::from_str(&call.arguments_json).unwrap_or(serde_json::Value::Null);
        let Some(command) = args.get("command").and_then(|c| c.as_str()).map(str::to_string) else {
            self.push_tool_result(&call.id, "missing required argument 'command'".to_string(), true, false);
            self.continue_after_tool_result();
            return;
        };
        let arguments = args.get("arguments").cloned().unwrap_or(serde_json::Value::Null);
        if !(arguments.is_null() || arguments.is_object()) {
            self.push_tool_result(&call.id, "'arguments' must be a JSON object".to_string(), true, false);
            self.continue_after_tool_result();
            return;
        }
        match crate::capability::mcp_disclosure::disclose(&self.session_context().repo_root, &command) {
            Ok(disclosure) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval::McpCall { call, command, arguments, disclosure });
            }
            Err(error) => {
                self.push_tool_result(&call.id, format!("cannot call: {error}"), true, false);
                self.continue_after_tool_result();
            }
        }
    }

    /// Starting a language server runs an external program, so the prompt shows the
    /// resolved program, the variable names and the question. A list nobody confirmed,
    /// an unlisted server, a file that cannot be used or a secrets file never reaches
    /// `AwaitingApproval`: the model is told why instead.
    fn prepare_lsp_approval(&mut self, call: ToolCall) {
        let arguments: serde_json::Value = serde_json::from_str(&call.arguments_json).unwrap_or(serde_json::Value::Null);
        match crate::capability::lsp_disclosure::disclose(&self.session_context().repo_root, &arguments) {
            Ok(disclosure) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval::LspQuery { call, disclosure });
            }
            Err(error) => {
                self.push_tool_result(&call.id, format!("cannot ask: {error}"), true, false);
                self.continue_after_tool_result();
            }
        }
    }

    /// The query leaves this machine, so the prompt must say where it goes and
    /// whether a key goes with it. A missing or invalid search configuration
    /// never reaches `AwaitingApproval`: the model is told why instead.
    fn prepare_web_search_approval(&mut self, call: ToolCall) {
        let Some(raw_query) = parse_string_arg(&call.arguments_json, "query") else {
            self.push_tool_result(&call.id, "missing required argument 'query'".to_string(), true, false);
            self.continue_after_tool_result();
            return;
        };
        // Validated before anything is shown: a query that could never run, or
        // that could spoof the prompt's other lines, never reaches the approver.
        let query = match crate::capability::web_search::validate_query(&raw_query) {
            Ok(query) => query,
            Err(error) => {
                self.push_tool_result(&call.id, format!("cannot search: {error}"), true, false);
                self.continue_after_tool_result();
                return;
            }
        };
        match crate::capability::web_search::disclose(&self.session_context().repo_root) {
            Ok(disclosure) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval::WebSearch { call, query, disclosure });
            }
            Err(error) => {
                self.push_tool_result(&call.id, format!("cannot search: {error}"), true, false);
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

    /// `patch_file`: the same approval prompt as an overwrite, built from the patched content, so the human
    /// sees the real diff. A patch that does not match goes back to the model as an error; nothing is
    /// proposed. When approved the call itself runs (`file_patch_result`), re-matching on the current file.
    fn prepare_patch_file_approval(&mut self, call: ToolCall) {
        let root = self.session_context().repo_root;
        let proposal = crate::capability::file_patch::parse_patch_call(&call.arguments_json).and_then(|(path, edits)| {
            let (content, _) = crate::capability::file_patch::patched(&root, &path, &edits)?;
            let (diff, _) = crate::capability::file_patch::propose_file_patch(&root, &path, &edits)?;
            Ok((path, content, diff))
        });
        match proposal {
            Ok((path, content, diff)) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval::FileWrite {
                    call,
                    path,
                    kind: crate::capability::FileMutationKind::Overwrite,
                    content,
                    is_config: false,
                    diff,
                });
            }
            Err(error) => {
                self.push_tool_result(&call.id, format!("cannot propose patch: {error}"), true, false);
                self.continue_after_tool_result();
            }
        }
    }

    /// Computes the diff (read-only — neither `propose_*` function
    /// touches the filesystem) up front so the approval prompt itself can
    /// show it, rather than the human approving a path/kind pair blind
    /// and finding out what changed only after the fact. Shared by
    /// `write_file` (`is_config: false`) and `write_config`
    /// (`is_config: true`, Phase 4) — the two differ only in which
    /// `propose_*` function validates the request.
    fn prepare_write_file_approval(&mut self, call: ToolCall, is_config: bool) {
        let Ok(args) = serde_json::from_str::<WriteFileArgs>(&call.arguments_json) else {
            self.push_tool_result(
                &call.id,
                format!(
                    "missing or invalid arguments for {} (need path, content, kind)",
                    call.name
                ),
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
        let proposal = if is_config {
            crate::capability::propose_config_write(&root, &args.path, kind, &args.content)
        } else {
            crate::capability::propose_file_write(&root, &args.path, kind, &args.content)
        };
        match proposal {
            Ok(diff) => {
                self.turn = TurnState::AwaitingApproval(PendingApproval::FileWrite {
                    call,
                    path: args.path,
                    kind,
                    content: args.content,
                    is_config,
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
/// Largest `depth` the model may ask `repo_tree` for; the capability clamps again, this only rejects nonsense early.
const MAX_TREE_DEPTH_ARG: u64 = 64;
/// Default tree depth when the model gives none (one level shows the top of the repository without flooding context).
const DEFAULT_TREE_DEPTH: usize = 2;

/// Runs one of the four read-only inspection tools. Everything is sandboxed to `root` by the capability layer, so the
/// only job here is turning the model's JSON arguments into typed ones and rejecting malformed input with a message
/// the model can act on (never panicking, never defaulting silently past a wrong type).
fn read_only_result(root: &std::path::Path, tool: &str, arguments_json: &str) -> Result<String, String> {
    let args: serde_json::Value = if arguments_json.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(arguments_json).map_err(|_| "arguments must be a JSON object".to_string())?
    };
    let object = args.as_object().ok_or_else(|| "arguments must be a JSON object".to_string())?;
    let text = |key: &str| -> Result<Option<String>, String> {
        match object.get(key) {
            None | Some(serde_json::Value::Null) => Ok(None),
            Some(serde_json::Value::String(value)) => Ok(Some(value.clone())),
            Some(_) => Err(format!("'{key}' must be a string")),
        }
    };
    let result = match tool {
        "repo_tree" => {
            let depth = match object.get("depth") {
                None | Some(serde_json::Value::Null) => DEFAULT_TREE_DEPTH,
                Some(value) => match value.as_u64() {
                    Some(n) if n <= MAX_TREE_DEPTH_ARG => n as usize,
                    _ => return Err("'depth' must be a whole number from 0 to 5".to_string()),
                },
            };
            crate::capability::repo::repo_tree(root, text("path")?.as_deref().unwrap_or("."), depth)
        }
        "search_code" => {
            let query = text("query")?.ok_or_else(|| "missing required argument 'query'".to_string())?;
            crate::capability::repo::search_code(root, text("path")?.as_deref().unwrap_or("."), &query)
        }
        "git_status" => crate::capability::git::git_status(root),
        "git_diff" => {
            let staged = match object.get("staged") {
                None | Some(serde_json::Value::Null) => false,
                Some(serde_json::Value::Bool(value)) => *value,
                Some(_) => return Err("'staged' must be true or false".to_string()),
            };
            crate::capability::git::git_diff(root, staged)
        }
        other => return Err(format!("not a read-only tool: {other}")),
    };
    result.map_err(|error| error.to_string())
}

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

    fn search_call(args: &str) -> ToolCall {
        ToolCall { id: "call-s".into(), name: "web_search".into(), arguments_json: args.into() }
    }

    fn app_in(root: &std::path::Path) -> App {
        let mut app = app();
        app.repo_root = root.to_path_buf();
        // Past the round ceiling, so error paths stop at the guard instead of starting a turn.
        app.tool_rounds.set_rounds(9);
        app
    }

    fn write_search_config(root: &std::path::Path, json: &str) {
        std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
        std::fs::write(root.join(".yana-ai/web-search.json"), json).unwrap();
        // These tests are about the approval flow, so the configuration is confirmed.
        crate::capability::config_trust::trust_in_test(root);
    }

    fn last_tool_result(app: &App) -> crate::model::tool::ToolResultRecord {
        app.history.last().and_then(|m| m.tool_result.clone()).expect("a tool result was recorded")
    }

    #[test]
    fn a_web_search_waits_for_approval_showing_the_host_and_the_key_variable() {
        let root = tempfile::tempdir().unwrap();
        write_search_config(root.path(), r#"{"endpoint":"https://s.example/q","api_key_env":"YANA_SEARCH_KEY"}"#);
        let mut app = app_in(root.path());
        app.prepare_pending_approval(search_call(r#"{"query":"rust release"}"#));
        match &app.turn {
            TurnState::AwaitingApproval(pending @ PendingApproval::WebSearch { query, disclosure, .. }) => {
                assert_eq!(query, "rust release");
                assert_eq!(disclosure.backend_host, "s.example");
                assert_eq!(disclosure.key_variable.as_deref(), Some("YANA_SEARCH_KEY"));
                assert!(pending.summary_line().contains("s.example"));
                assert!(!pending.is_guard_denied());
            }
            _ => panic!("expected AwaitingApproval(WebSearch), status: {}", app.status),
        }
    }

    #[test]
    fn a_web_search_that_cannot_be_disclosed_never_reaches_the_approval_prompt() {
        let root = tempfile::tempdir().unwrap();
        let mut none = app_in(root.path());
        none.prepare_pending_approval(search_call(r#"{"query":"x"}"#));
        assert!(matches!(none.turn, TurnState::Idle));
        let result = last_tool_result(&none);
        assert!(result.is_error && result.output.contains("not configured"), "{result:?}");
        write_search_config(root.path(), r#"{"endpoint":"https://s.example/","api_key_env":"GITHUB_TOKEN"}"#);
        let mut wrong_key = app_in(root.path());
        wrong_key.prepare_pending_approval(search_call(r#"{"query":"x"}"#));
        assert!(matches!(wrong_key.turn, TurnState::Idle));
        assert!(last_tool_result(&wrong_key).output.contains("YANA_SEARCH_"));
        let mut no_query = app_in(root.path());
        no_query.prepare_pending_approval(search_call("{}"));
        assert!(matches!(no_query.turn, TurnState::Idle));
        assert!(last_tool_result(&no_query).output.contains("missing required argument 'query'"));
    }

    #[test]
    fn approving_a_search_after_the_backend_changed_is_refused_without_any_request() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
        let root = tempfile::tempdir().unwrap();
        write_search_config(root.path(), r#"{"endpoint":"https://good.example/q"}"#);
        let mut app = app_in(root.path());
        app.prepare_pending_approval(search_call(r#"{"query":"x"}"#));
        assert!(matches!(app.turn, TurnState::AwaitingApproval(_)));
        write_search_config(root.path(), r#"{"endpoint":"https://evil.example/q"}"#);
        app.handle_approval_key(KeyEvent::new(KeyCode::Char('y'), KeyModifiers::NONE));
        assert!(matches!(app.turn, TurnState::Idle), "nothing is executing");
        let result = last_tool_result(&app);
        assert!(result.is_error && result.denied && result.output.contains("changed since approval"), "{result:?}");
    }

    #[test]
    fn declining_a_search_records_a_denial_and_sends_nothing() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
        let root = tempfile::tempdir().unwrap();
        write_search_config(root.path(), r#"{"endpoint":"https://good.example/q"}"#);
        let mut app = app_in(root.path());
        app.prepare_pending_approval(search_call(r#"{"query":"x"}"#));
        app.handle_approval_key(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
        assert!(matches!(app.turn, TurnState::Idle));
        assert!(last_tool_result(&app).output.contains("declined"));
    }

    #[test]
    fn the_approved_executor_runs_the_search_capability_and_reports_its_error_text() {
        // No backend configured: the capability itself refuses before any request,
        // which proves the approved path reaches it without touching the network.
        let root = tempfile::tempdir().unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let result = execute_approved_tool(
            &YanaAuthorityChain,
            &executor,
            &context(root.path()),
            &search_call(r#"{"query":"x"}"#),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();
        assert!(result.is_error && result.output.contains("search failed") && result.output.contains("not configured"), "{result:?}");
        let missing = execute_approved_tool(&YanaAuthorityChain, &executor, &context(root.path()), &search_call("{}"), &CancellationToken::default(), &mut |_| {}).unwrap();
        assert!(missing.output.contains("missing required argument 'query'"));
    }

    #[test]
    fn a_search_is_never_executed_without_approval() {
        let root = tempfile::tempdir().unwrap();
        write_search_config(root.path(), r#"{"endpoint":"https://good.example/q"}"#);
        let result = ChatCapabilityExecutor::new(false).execute(&context(root.path()), &search_call(r#"{"query":"x"}"#));
        assert!(result.is_error, "the unapproved executor path must not run it: {result:?}");
        assert!(result.output.contains("no implementation") && !result.output.contains("good.example"), "{result:?}");
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

    /// `write_config` end to end (Phase 4) — same shape as
    /// `canonical_approved_path_writes_a_file_once`, proving the config
    /// specialization also works through the real authority chain, not
    /// just `config_write`'s own unit tests.
    #[test]
    fn canonical_approved_path_writes_a_config_file_once() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("core/config")).unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let call = ToolCall {
            id: "call-1".into(),
            name: "write_config".into(),
            arguments_json: r#"{"path":"new-setting.json","content":"{\"enabled\":true}","kind":"create"}"#.into(),
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
            std::fs::read_to_string(root.path().join("core/config/new-setting.json")).unwrap(),
            "{\"enabled\":true}"
        );
    }

    #[test]
    fn canonical_approved_path_rejects_write_config_targeting_core_lock_json() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("core/config")).unwrap();
        std::fs::write(root.path().join("core/config/core-lock.json"), "{}").unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let call = ToolCall {
            id: "call-1".into(),
            name: "write_config".into(),
            arguments_json: r#"{"path":"core-lock.json","content":"{\"tampered\":true}","kind":"overwrite"}"#.into(),
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
        assert_eq!(
            std::fs::read_to_string(root.path().join("core/config/core-lock.json")).unwrap(),
            "{}",
            "core-lock.json must be untouched"
        );
    }

    fn patch_call(path: &str, old: &str, new: &str) -> ToolCall {
        ToolCall {
            id: "call-p".into(),
            name: "patch_file".into(),
            arguments_json: serde_json::json!({ "path": path, "edits": [{ "old": old, "new": new }] }).to_string(),
        }
    }

    /// The refused-without-approval test the file.patch contract asks for: a `patch_file` call that goes
    /// through the plain (non-approved) executor path is denied and the file is untouched.
    #[test]
    fn an_unapproved_patch_file_call_is_denied_and_changes_nothing() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("a.txt"), "one\ntwo\n").unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let result = executor.execute(&context(root.path()), &patch_call("a.txt", "two", "2"));
        assert!(result.denied);
        assert_eq!(std::fs::read_to_string(root.path().join("a.txt")).unwrap(), "one\ntwo\n");
    }

    #[test]
    fn plan_mode_refuses_an_approved_write_and_changes_nothing() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("a.txt"), "one\ntwo\n").unwrap();
        let executor = ChatCapabilityExecutor::new(false).in_plan_mode(true);
        let result = execute_approved_tool(
            &YanaAuthorityChain,
            &executor,
            &context(root.path()),
            &patch_call("a.txt", "two", "2"),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();
        assert!(result.denied && result.is_error, "{}", result.output);
        assert!(result.output.contains("Plan mode"), "{}", result.output);
        assert_eq!(std::fs::read_to_string(root.path().join("a.txt")).unwrap(), "one\ntwo\n");
        assert!(
            !root.path().join(".yana-ai/file-mutation-backups").exists(),
            "a refused call must not create a backup (the authority receipt under .yana-ai is expected)"
        );
    }

    #[test]
    fn canonical_approved_path_patches_a_file_once_and_keeps_a_backup() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("a.txt"), "one\ntwo\nthree\n").unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let result = execute_approved_tool(
            &YanaAuthorityChain,
            &executor,
            &context(root.path()),
            &patch_call("a.txt", "two", "2"),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();
        assert!(!result.denied && !result.is_error, "{}", result.output);
        assert!(result.output.starts_with("patched a.txt"), "{}", result.output);
        assert!(result.output.contains("backup at"), "{}", result.output);
        assert_eq!(std::fs::read_to_string(root.path().join("a.txt")).unwrap(), "one\n2\nthree\n");
    }

    #[test]
    fn an_approved_patch_that_does_not_match_writes_nothing_and_tells_the_model() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("a.txt"), "one\ntwo\n").unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        let result = execute_approved_tool(
            &YanaAuthorityChain,
            &executor,
            &context(root.path()),
            &patch_call("a.txt", "missing text", "x"),
            &CancellationToken::default(),
            &mut |_| {},
        )
        .unwrap();
        assert!(result.is_error);
        assert!(!result.denied, "a failed match is a retryable error, not a denial");
        assert!(result.output.contains("nothing was written"), "{}", result.output);
        assert_eq!(std::fs::read_to_string(root.path().join("a.txt")).unwrap(), "one\ntwo\n");
    }

    #[test]
    fn an_approved_patch_cannot_leave_the_repository_or_touch_a_missing_file() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "keep\n").unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        for path in [format!("../{}/secret.txt", outside.path().file_name().unwrap().to_string_lossy()), "nope.txt".to_string()] {
            let result = execute_approved_tool(
                &YanaAuthorityChain,
                &executor,
                &context(root.path()),
                &patch_call(&path, "keep", "gone"),
                &CancellationToken::default(),
                &mut |_| {},
            )
            .unwrap();
            assert!(result.is_error, "{path}: {}", result.output);
        }
        assert_eq!(std::fs::read_to_string(outside.path().join("secret.txt")).unwrap(), "keep\n");
    }

    #[test]
    fn a_malformed_patch_call_is_reported_not_applied() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("a.txt"), "one\n").unwrap();
        let executor = ChatCapabilityExecutor::new(false);
        for arguments in [r#"{"path":"a.txt"}"#, r#"{"path":"a.txt","edits":[{"old":"one","new":"1","replace_al":true}]}"#, "not json"] {
            let call = ToolCall { id: "call-m".into(), name: "patch_file".into(), arguments_json: arguments.into() };
            let result = execute_approved_tool(
                &YanaAuthorityChain,
                &executor,
                &context(root.path()),
                &call,
                &CancellationToken::default(),
                &mut |_| {},
            )
            .unwrap();
            assert!(result.is_error, "{arguments}: {}", result.output);
        }
        assert_eq!(std::fs::read_to_string(root.path().join("a.txt")).unwrap(), "one\n");
    }

    // ---- read-only inspection tools (repo_tree, search_code, git_status, git_diff)

    fn read_only_repo() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("src")).unwrap();
        std::fs::write(root.path().join("src/lib.rs"), "fn hello() {}\n// NeedleToken here\n").unwrap();
        std::fs::write(root.path().join("README.md"), "readme\n").unwrap();
        root
    }

    #[test]
    fn repo_tree_lists_files_with_no_arguments_at_all() {
        let root = read_only_repo();
        for arguments in ["", "{}"] {
            let out = read_only_result(root.path(), "repo_tree", arguments).unwrap();
            assert!(out.contains("README.md") && out.contains("src"), "{arguments}: {out}");
        }
        assert!(read_only_result(root.path(), "repo_tree", "not json").is_err());
    }

    #[test]
    fn repo_tree_honours_path_and_depth_and_refuses_bad_values() {
        let root = read_only_repo();
        let out = read_only_result(root.path(), "repo_tree", r#"{"path":"src","depth":1}"#).unwrap();
        assert!(out.contains("lib.rs") && !out.contains("README.md"), "{out}");
        for bad in [r#"{"depth":-1}"#, r#"{"depth":"2"}"#, r#"{"depth":1000}"#, r#"{"path":5}"#, "[1]", "\"x\""] {
            assert!(read_only_result(root.path(), "repo_tree", bad).is_err(), "{bad} must be refused");
        }
    }

    #[test]
    fn search_code_finds_text_ignoring_case_and_needs_a_query() {
        let root = read_only_repo();
        let out = read_only_result(root.path(), "search_code", r#"{"query":"needletoken"}"#).unwrap();
        assert!(out.contains("lib.rs") && out.contains("NeedleToken"), "{out}");
        let narrowed = read_only_result(root.path(), "search_code", r#"{"query":"readme","path":"src"}"#).unwrap();
        assert!(!narrowed.contains("README.md"), "{narrowed}");
        for bad in ["{}", r#"{"query":""}"#, r#"{"query":"   "}"#, r#"{"query":7}"#] {
            assert!(read_only_result(root.path(), "search_code", bad).is_err(), "{bad} must be refused");
        }
    }

    #[test]
    fn read_only_tools_cannot_leave_the_repository() {
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().join("repo");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(outer.path().join("secret.txt"), "outside-marker\n").unwrap();
        for (tool, arguments) in [
            ("repo_tree", r#"{"path":".."}"#),
            ("repo_tree", r#"{"path":"/etc"}"#),
            ("search_code", r#"{"query":"outside-marker","path":"../"}"#),
            ("search_code", r#"{"query":"root","path":"/etc"}"#),
        ] {
            let result = read_only_result(&root, tool, arguments);
            assert!(result.is_err(), "{tool} {arguments} must be refused: {result:?}");
        }
    }

    #[test]
    fn git_diff_rejects_a_non_boolean_flag_and_git_tools_do_not_panic_outside_a_repository() {
        let root = read_only_repo();
        assert!(read_only_result(root.path(), "git_diff", r#"{"staged":"yes"}"#).is_err());
        let _ = read_only_result(root.path(), "git_status", "{}");
        let _ = read_only_result(root.path(), "git_diff", r#"{"staged":true}"#);
    }

    #[test]
    fn an_unknown_tool_name_is_not_run_as_read_only() {
        let root = read_only_repo();
        assert!(read_only_result(root.path(), "write_file", "{}").is_err());
    }
}
