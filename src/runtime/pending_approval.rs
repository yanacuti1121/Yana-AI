//! Remote Approval Continuation (Authority Hardening item #5, `ADR-015`).
//!
//! Terminal's own approval continuation (`chat/tui/approval.rs`) works
//! entirely in-process: `execute_approved_tool()` runs synchronously, the
//! result is appended to conversation history, and a new turn starts
//! immediately — no persistence needed, because the pause and the resume
//! happen in the same running process, often the same event-loop tick.
//!
//! Desktop, packaged Web, and Discord cannot do this: the human's
//! decision typically arrives in a LATER process invocation (a fresh
//! `yana-rt chat resume-approval` call, a later IPC message) than the one
//! that paused. This module makes the pause durable: it persists exactly
//! what Terminal's in-memory continuation already needed —
//! `continuation_messages`, the pending `ToolCall`, and the `TurnContext`
//! — to `.yana-ai/pending-approvals.json`, following `capability::lease`'s
//! exact locked-JSON-file pattern (not `receipt.rs`'s append-only
//! pattern: an approval is created once and resolved exactly once, a
//! mutation lifecycle, not an append-only log).
//!
//! **Locked invariant, unchanged from every other authority primitive in
//! this codebase:** resuming an approval does NOT grant authority.
//! [`resume_turn`] calls the exact same `execute_approved_tool()` /
//! `authorize_approved_tool()` path Terminal's own continuation calls,
//! with `human_approved` sourced from a recorded decision — a HALT or
//! policy change since the pause is caught by that call the same way it
//! always is. No client can manufacture approval by writing this file
//! directly: only [`PendingApprovalStore::resolve`], gated by loading and
//! checking the record's own `resolved`/`expires_at` fields under a
//! `flock-v1` lock, can mark a decision, and `resolve` itself never
//! executes anything — it only records what a human decided.
//!
//! `api_key` is deliberately never part of this record — see
//! `TurnRequest`'s own private `api_key` field for why persisting it
//! would violate `52-secrets-vault-law.md`. The resuming client re-sources
//! its own `api_key` fresh, exactly as it already does for a brand-new
//! turn. `tools: Vec<ToolSpec>` is excluded for a different, structural
//! reason: `ToolSpec`'s `name`/`description` fields are `&'static str`,
//! which cannot round-trip through `Deserialize` — the resuming client
//! rebuilds its fixed tool catalog the same way it always does for any
//! turn (`crate::chat::tools::catalog`), not from this record.

use super::{
    push_tool_result, CancellationToken, RuntimeEvent, ToolExecutor, TurnContext, TurnEngine,
    TurnOutcome, TurnRequest,
};
use crate::model::provider::{ChatMessage, ChatProvider};
use crate::model::tool::{ToolCall, ToolResultRecord, ToolSpec};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

fn approval_lock_timeout() -> Duration {
    std::env::var("YANA_APPROVAL_LOCK_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse().ok())
        .map(Duration::from_secs)
        .unwrap_or(Duration::from_secs(10))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PendingApproval {
    pub approval_id: String,
    pub context: TurnContext,
    pub model: String,
    pub system: Option<String>,
    /// Conversation history at the moment of pause — exactly
    /// `TurnOutcome::AwaitingApproval`'s own `continuation_messages`.
    pub messages: Vec<ChatMessage>,
    pub tool_rounds_completed: usize,
    pub pending_call: ToolCall,
    /// Why the authority chain paused — for display only, never re-checked
    /// on resume (`resume_turn` re-runs the real check unconditionally).
    pub authority_reason: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub resolved: bool,
    /// `Some(true)` = allow, `Some(false)` = deny. `None` until resolved.
    pub decision: Option<bool>,
    pub decided_by: Option<String>,
}

fn approvals_path(root: &Path) -> PathBuf {
    root.join(".yana-ai").join("pending-approvals.json")
}

/// Mirrors `capability::lease::read_leases` exactly: a missing file is an
/// empty list, a malformed file is a hard error, a symlink is rejected —
/// a pending approval is authority-adjacent state, so it gets the same
/// fail-closed treatment a lease does, not `receipt.rs`'s
/// best-effort-and-swallow treatment (that's for evidence *about* a
/// decision; this file *is* part of a decision still in flight).
fn read_approvals(root: &Path) -> Result<Vec<PendingApproval>> {
    let path = approvals_path(root);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(error)
                .with_context(|| format!("cannot inspect pending-approval store {}", path.display()))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!(
            "pending-approval store must be a regular file: {}",
            path.display()
        );
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("cannot read pending-approval store {}", path.display()))?;
    let approvals: Vec<PendingApproval> = serde_json::from_str(&raw)
        .with_context(|| format!("pending-approval store is invalid JSON: {}", path.display()))?;
    Ok(approvals)
}

fn write_approvals(root: &Path, approvals: &[PendingApproval]) -> Result<()> {
    let path = approvals_path(root);
    let parent = path.parent().expect("pending-approval store path has parent");
    fs::create_dir_all(parent).with_context(|| {
        format!(
            "cannot create pending-approval store directory {}",
            parent.display()
        )
    })?;
    let temporary = path.with_extension(format!("json.tmp.{}", std::process::id()));
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    options.mode(0o600);
    {
        let mut file = options.open(&temporary).with_context(|| {
            format!(
                "cannot write temporary pending-approval store {}",
                temporary.display()
            )
        })?;
        use std::io::Write;
        file.write_all(&serde_json::to_vec_pretty(approvals)?)
            .with_context(|| format!("cannot write pending-approval store {}", temporary.display()))?;
    }
    fs::rename(&temporary, &path)
        .with_context(|| format!("cannot replace pending-approval store {}", path.display()))
}

pub(crate) struct PendingApprovalStore {
    root: PathBuf,
}

impl PendingApprovalStore {
    pub(crate) fn for_root(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
        }
    }

    fn with_locked<T>(&self, action: impl FnOnce() -> Result<T>) -> Result<T> {
        let locked = yana_rt::flock_v1::with_lock(
            "key:pending-approvals",
            &self.root,
            approval_lock_timeout(),
            action,
        );
        match locked {
            Ok(inner) => inner,
            Err(lock_error) => Err(lock_error.context("could not acquire pending-approval store lock")),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn create(
        &self,
        context: TurnContext,
        model: String,
        system: Option<String>,
        messages: Vec<ChatMessage>,
        tool_rounds_completed: usize,
        pending_call: ToolCall,
        authority_reason: String,
        ttl_minutes: u64,
    ) -> Result<PendingApproval> {
        self.with_locked(|| {
            let now = Utc::now();
            let approval = PendingApproval {
                approval_id: Uuid::new_v4().simple().to_string()[..12].to_string(),
                context,
                model,
                system,
                messages,
                tool_rounds_completed,
                pending_call,
                authority_reason,
                created_at: now,
                expires_at: now + chrono::Duration::minutes(ttl_minutes as i64),
                resolved: false,
                decision: None,
                decided_by: None,
            };
            let mut approvals = read_approvals(&self.root)?;
            approvals.push(approval.clone());
            write_approvals(&self.root, &approvals)?;
            Ok(approval)
        })
    }

    /// Records a human decision. Re-checks `resolved`/`expires_at` inside
    /// the lock against what's on disk right now — the same "never trust
    /// a caller-held value" discipline `capability::lease` already
    /// established, so two concurrent resolutions of the same approval
    /// can't both win, and a decision can't be recorded against an
    /// already-expired pause.
    pub(crate) fn resolve(
        &self,
        approval_id: &str,
        decision: bool,
        decided_by: String,
    ) -> Result<PendingApproval> {
        self.with_locked(|| {
            let mut approvals = read_approvals(&self.root)?;
            let now = Utc::now();
            let Some(approval) = approvals.iter_mut().find(|a| a.approval_id == approval_id) else {
                bail!("no pending approval with id '{approval_id}'");
            };
            if approval.resolved {
                bail!("pending approval '{approval_id}' was already resolved");
            }
            if approval.expires_at <= now {
                bail!("pending approval '{approval_id}' expired at {}", approval.expires_at);
            }
            approval.resolved = true;
            approval.decision = Some(decision);
            approval.decided_by = Some(decided_by);
            let resolved = approval.clone();
            write_approvals(&self.root, &approvals)?;
            Ok(resolved)
        })
    }

    pub(crate) fn get(&self, approval_id: &str) -> Result<PendingApproval> {
        let approvals = read_approvals(&self.root)?;
        approvals
            .into_iter()
            .find(|a| a.approval_id == approval_id)
            .with_context(|| format!("no pending approval with id '{approval_id}'"))
    }

    pub(crate) fn list(&self) -> Result<Vec<PendingApproval>> {
        read_approvals(&self.root)
    }
}

/// `yana-rt authority pending-approvals [--id <id>] [--json]` — same
/// "must not become invisible" reasoning as `authority receipts`/
/// `authority executions`: a durable pause nobody can inspect from the
/// CLI is no better than the in-memory state it replaces.
pub fn cmd_pending_approvals(id: Option<String>, json: bool) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let store = PendingApprovalStore::for_root(&root);
    let approvals = match id {
        Some(id) => vec![store.get(&id)?],
        None => store.list()?,
    };
    if json {
        println!("{}", serde_json::to_string_pretty(&approvals)?);
        return Ok(());
    }
    if approvals.is_empty() {
        println!("No pending approvals.");
        return Ok(());
    }
    for approval in &approvals {
        let status = if approval.resolved {
            match approval.decision {
                Some(true) => "resolved: allow",
                Some(false) => "resolved: deny",
                None => "resolved: (inconsistent, no decision)",
            }
        } else if approval.expires_at <= Utc::now() {
            "expired"
        } else {
            "pending"
        };
        println!(
            "#{}  [{status}]  subject={}  capability={}",
            printable(&approval.approval_id),
            printable(approval.context.agent_id.as_deref().unwrap_or("human")),
            printable(&approval.pending_call.name)
        );
        println!("  reason: {}", printable(&approval.authority_reason));
        println!("  expires at: {}", approval.expires_at);
    }
    Ok(())
}

/// Text for a terminal: control characters (escape sequences, line breaks) are
/// shown as `?`, so a stored value cannot rewrite what the approver reads.
fn printable(text: &str) -> String {
    text.chars().map(|c| if c.is_control() { '?' } else { c }).collect()
}

/// For a call that sends something out or starts a program: one line saying
/// where it goes. `web_search`: which endpoint receives the (validated) query and
/// whether an API key goes with it (variable NAME only). `mcp_call`: the exact,
/// quoted command line that would be started and the variable names passed.
/// `Ok(None)` for any other call; an error when the call cannot be disclosed (no
/// or unconfirmed configuration, missing or unacceptable arguments).
fn disclosure_summary(root: &Path, call: &ToolCall) -> Result<Option<String>, crate::capability::CapabilityError> {
    use crate::capability::web_search::{disclose, validate_query};
    if call.name == "lsp_query" {
        let arguments = serde_json::from_str::<serde_json::Value>(&call.arguments_json).unwrap_or_default();
        return Ok(Some(crate::capability::lsp_disclosure::disclose(root, &arguments)?.summary()));
    }
    if call.name == "mcp_call" {
        use crate::capability::mcp_disclosure::{disclose, Disclosure};
        let args = serde_json::from_str::<serde_json::Value>(&call.arguments_json).unwrap_or_default();
        let command = args
            .get("command")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| crate::capability::CapabilityError::InvalidInput { detail: "missing required argument 'command'".into() })?;
        let arguments = args.get("arguments").cloned().unwrap_or_default();
        if !(arguments.is_null() || arguments.is_object()) {
            return Err(crate::capability::CapabilityError::InvalidInput { detail: "'arguments' must be a JSON object".into() });
        }
        return Ok(Some(format!("{}; arguments: {}", disclose(root, command)?.summary(), Disclosure::arguments_note(&arguments))));
    }
    if call.name != "web_search" {
        return Ok(None);
    }
    let raw = serde_json::from_str::<serde_json::Value>(&call.arguments_json)
        .ok()
        .and_then(|args| args.get("query").and_then(serde_json::Value::as_str).map(str::to_string))
        .ok_or_else(|| crate::capability::CapabilityError::InvalidInput { detail: "missing required argument 'query'".into() })?;
    let query = validate_query(&raw)?;
    Ok(Some(disclose(root)?.summary(&query)))
}

/// The reason to store and show with a pending approval. For a web search it
/// also carries where the query goes, so a remote approver sees the host and
/// the key variable name, and `resume_turn` can tell if they changed. A web
/// search that cannot be disclosed is an error: it must not be paused for a
/// human to approve blind.
pub(crate) fn reason_with_disclosure(
    root: &Path,
    call: &ToolCall,
    base: Option<String>,
) -> Result<String, crate::capability::CapabilityError> {
    let base = base.unwrap_or_else(|| "requires explicit human approval".to_string());
    Ok(match disclosure_summary(root, call)? {
        Some(summary) => format!("{base} | {summary}"),
        None => base,
    })
}

/// `Some(refusal)` when an approved `web_search`, `mcp_call` or `lsp_query` would now go
/// somewhere (or start something) other than what its approver was shown.
fn disclosure_changed(approval: &PendingApproval) -> Option<ToolResultRecord> {
    if !matches!(approval.pending_call.name.as_str(), "web_search" | "mcp_call" | "lsp_query") {
        return None;
    }
    let now = disclosure_summary(&approval.context.session.repo_root, &approval.pending_call);
    // The summary is appended last, after " | ", when the reason is built: it must be the end
    // of it AND start right after that separator, so text inside an earlier part of the reason
    // cannot stand in for it.
    let unchanged = matches!(&now, Ok(Some(summary)) if approval.authority_reason.ends_with(&format!(" | {summary}")));
    if unchanged {
        return None;
    }
    Some(ToolResultRecord {
        call_id: approval.pending_call.id.clone(),
        output: "blocked: the search backend, MCP server or language server configuration changed since this was approved (or the question is not the one approved); ask again".to_string(),
        is_error: true,
        denied: true,
    })
}

/// Resumes a resolved [`PendingApproval`]: executes the pending call
/// through the exact same `execute_approved_tool()` path Terminal's own
/// in-process continuation uses (real `human_approved` gate, HALT/policy
/// re-checked unconditionally), appends the result to the paused
/// conversation, and starts a fresh `TurnEngine::run()` with the extended
/// history — mirroring `chat/tui/approval.rs::execute_approved_tool` +
/// `continue_after_tool_result`'s exact two-step shape, just across a
/// process boundary instead of within one.
///
/// `approval` must already have `resolved == true` (call
/// [`PendingApprovalStore::resolve`] first) — this function does not
/// resolve anything itself, it only acts on an already-recorded decision.
/// `api_key` and `tools` are supplied fresh by the caller, never read
/// from `approval` — see this module's own doc comment for why.
pub(crate) fn resume_turn(
    approval: &PendingApproval,
    provider: Arc<dyn ChatProvider>,
    executor: Arc<dyn ToolExecutor>,
    tools: Vec<ToolSpec>,
    api_key: Option<String>,
    cancellation: &CancellationToken,
    emit: &mut dyn FnMut(RuntimeEvent),
) -> Result<TurnOutcome> {
    if !approval.resolved {
        bail!(
            "pending approval '{}' has not been resolved yet",
            approval.approval_id
        );
    }
    let Some(decision) = approval.decision else {
        bail!(
            "pending approval '{}' is resolved but carries no decision — inconsistent store state",
            approval.approval_id
        );
    };

    let mut messages = approval.messages.clone();
    if decision {
        if let Some(refusal) = disclosure_changed(approval) {
            push_tool_result(&mut messages, &refusal);
        } else {
            let result = super::execute_approved_tool(
                &super::YanaAuthorityChain,
                executor.as_ref(),
                &approval.context,
                &approval.pending_call,
                cancellation,
                emit,
            )?;
            push_tool_result(&mut messages, &result);
        }
    } else {
        push_tool_result(
            &mut messages,
            &ToolResultRecord {
                call_id: approval.pending_call.id.clone(),
                output: "human declined to approve this capability call".to_string(),
                is_error: true,
                denied: true,
            },
        );
    }
    emit(RuntimeEvent::TurnResumed {
        approval_id: approval.approval_id.clone(),
    });

    let mut request = TurnRequest::new(approval.context.clone(), approval.model.clone(), messages)
        .with_tools(tools)
        .with_tool_rounds_completed(approval.tool_rounds_completed);
    if let Some(system) = approval.system.clone() {
        request = request.with_system(system);
    }
    if let Some(api_key) = api_key {
        request = request.with_api_key(api_key);
    }

    let engine = TurnEngine::new(provider, Arc::new(super::YanaAuthorityChain), executor);
    Ok(engine.run(request, cancellation, emit)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::{TurnContext, TurnOrigin};
    use crate::session_context::SessionContext;
    use std::path::PathBuf;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yana-pending-approval-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let marker = dir.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(&marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        dir
    }

    fn context(root: &Path) -> TurnContext {
        let session = SessionContext::new(
            "test-session".to_string(),
            root.to_path_buf(),
            "test-provider".to_string(),
            "test-model".to_string(),
            false,
        );
        TurnContext::new(session, TurnOrigin::Desktop, true)
    }

    fn call() -> ToolCall {
        ToolCall {
            id: "call-1".into(),
            name: "run_command".into(),
            arguments_json: "{\"command\":\"cargo test\"}".into(),
        }
    }

    fn search_call() -> ToolCall {
        ToolCall { id: "call-s".into(), name: "web_search".into(), arguments_json: "{\"query\":\"rust release\"}".into() }
    }

    fn write_search_config(root: &Path, json: &str) {
        fs::create_dir_all(root.join(".yana-ai")).unwrap();
        fs::write(root.join(".yana-ai/web-search.json"), json).unwrap();
        crate::capability::config_trust::trust_in_test(root);
    }

    fn paused_search(root: &Path) -> PendingApproval {
        let reason = reason_with_disclosure(root, &search_call(), Some("yana_control_plane: needs approval".into())).unwrap();
        PendingApprovalStore::for_root(root)
            .create(context(root), "m".into(), None, Vec::new(), 0, search_call(), reason, 20)
            .unwrap()
    }

    #[test]
    fn a_web_search_reason_names_the_host_and_the_key_variable_never_a_value() {
        let root = temp_root();
        write_search_config(&root, r#"{"endpoint":"https://s.example/q","api_key_env":"YANA_SEARCH_KEY"}"#);
        let reason = reason_with_disclosure(&root, &search_call(), Some("base".into())).unwrap();
        assert!(reason.starts_with("base | ") && reason.contains("s.example") && reason.contains("$YANA_SEARCH_KEY WILL be sent"), "{reason}");
        assert!(reason.contains("rust release"), "{reason}");
        fs::remove_dir_all(&root).ok();
    }

    fn mcp_call_record(command: &str) -> ToolCall {
        ToolCall { id: "call-m".into(), name: "mcp_call".into(), arguments_json: serde_json::json!({"command": command, "arguments": {}}).to_string() }
    }

    fn write_mcp_config(root: &Path, servers: serde_json::Value) {
        fs::create_dir_all(root.join(".yana-ai")).unwrap();
        fs::write(root.join(".yana-ai/mcp-servers.json"), serde_json::json!({"servers": servers}).to_string()).unwrap();
        crate::capability::config_trust::trust_in_test(root);
    }

    #[test]
    fn an_mcp_reason_carries_the_exact_quoted_command_line_and_variable_names() {
        let root = temp_root();
        write_mcp_config(&root, serde_json::json!([{"name": "gh", "command": "npx", "args": ["-y", "a b"], "env": ["GITHUB_TOKEN"]}]));
        let reason = reason_with_disclosure(&root, &mcp_call_record("gh search"), Some("base".into())).unwrap();
        assert!(reason.starts_with("base | MCP: start external program `npx -y 'a b'`"), "{reason}");
        assert!(reason.contains("GITHUB_TOKEN") && reason.contains("call its tool 'search'"), "{reason}");
        assert!(reason.contains("timeout 30s") && reason.ends_with("arguments: \"{}\""), "timeout and the model's arguments are shown: {reason}");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn what_the_model_passes_is_shown_masked_and_cut_and_must_be_an_object() {
        let root = temp_root();
        write_mcp_config(&root, serde_json::json!([{"name": "gh", "command": "npx"}]));
        let call = |arguments: serde_json::Value| ToolCall {
            id: "c".into(),
            name: "mcp_call".into(),
            arguments_json: serde_json::json!({"command": "gh delete", "arguments": arguments}).to_string(),
        };
        let reason = reason_with_disclosure(&root, &call(serde_json::json!({"path": "a\u{202e}b\nc"})), None).unwrap();
        assert!(reason.contains("arguments: ") && reason.contains("a?b"), "{reason}");
        assert!(!reason.contains('\u{202e}') && !reason.contains('\n'), "no direction override, no line break: {reason:?}");
        let long = reason_with_disclosure(&root, &call(serde_json::json!({"x": "y".repeat(500)})), None).unwrap();
        assert!(long.ends_with("...\""), "cut, not pushed out of view: {long}");
        assert!(long.len() < 800, "{}", long.len());
        assert!(reason_with_disclosure(&root, &call(serde_json::json!([1, 2])), None).is_err(), "not an object");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn an_mcp_call_that_cannot_be_disclosed_is_an_error_not_a_blind_approval() {
        let root = temp_root();
        assert!(reason_with_disclosure(&root, &mcp_call_record("gh search"), None).is_err(), "no server list");
        write_mcp_config(&root, serde_json::json!([{"name": "gh", "command": "npx"}]));
        for bad in ["other", "gh  search", "gh\u{a0}x", ""] {
            assert!(reason_with_disclosure(&root, &mcp_call_record(bad), None).is_err(), "{bad:?}");
        }
        let missing = ToolCall { id: "c".into(), name: "mcp_call".into(), arguments_json: "{}".into() };
        assert!(reason_with_disclosure(&root, &missing, None).is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resuming_an_mcp_call_is_refused_when_the_program_changed_after_approval() {
        let root = temp_root();
        write_mcp_config(&root, serde_json::json!([{"name": "gh", "command": "npx"}]));
        let reason = reason_with_disclosure(&root, &mcp_call_record("gh search"), Some("needs approval".into())).unwrap();
        let pending = PendingApprovalStore::for_root(&root)
            .create(context(&root), "m".into(), None, Vec::new(), 0, mcp_call_record("gh search"), reason, 20)
            .unwrap();
        assert!(disclosure_changed(&pending).is_none(), "unchanged: allowed to run");
        write_mcp_config(&root, serde_json::json!([{"name": "gh", "command": "/tmp/evil"}]));
        let refusal = disclosure_changed(&pending).expect("a different program must be refused");
        assert!(refusal.denied && refusal.is_error, "{refusal:?}");
        write_mcp_config(&root, serde_json::json!([{"name": "gh", "command": "npx", "args": ["--extra"]}]));
        assert!(disclosure_changed(&pending).is_some(), "an added argument is a change too");
        fs::remove_dir_all(&root).ok();
    }

    fn lsp_call_record(operation: &str, line: u32) -> ToolCall {
        ToolCall {
            id: "call-l".into(),
            name: "lsp_query".into(),
            arguments_json: serde_json::json!({"server": "rust", "operation": operation, "path": "src/lib.rs", "line": line, "character": 3}).to_string(),
        }
    }

    fn write_lsp_config(root: &Path, command: &str) {
        fs::create_dir_all(root.join(".yana-ai")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/lib.rs"), "pub fn alpha() {}\nlet beta = 1;\n").unwrap();
        fs::write(root.join(".yana-ai/lsp-servers.json"), serde_json::json!({"servers": [{"name": "rust", "command": command, "env": ["RUST_LOG"]}]}).to_string()).unwrap();
        crate::capability::config_trust::trust_in_test(root);
    }

    #[test]
    fn an_lsp_reason_carries_the_program_the_variables_and_the_whole_question() {
        let root = temp_root();
        write_lsp_config(&root, "/bin/sh");
        let reason = reason_with_disclosure(&root, &lsp_call_record("references", 2), Some("base".into())).unwrap();
        assert!(reason.starts_with("base | LSP: start external program `/bin/sh`"), "{reason}");
        assert!(reason.contains("RUST_LOG") && reason.ends_with("ask for references at src/lib.rs:2:3"), "{reason}");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn an_lsp_query_that_cannot_be_disclosed_is_an_error_not_a_blind_approval() {
        let root = temp_root();
        assert!(reason_with_disclosure(&root, &lsp_call_record("hover", 1), None).is_err(), "no server list");
        write_lsp_config(&root, "/bin/sh");
        for bad in [lsp_call_record("rename", 1), lsp_call_record("hover", 99)] {
            assert!(reason_with_disclosure(&root, &bad, None).is_err(), "{}", bad.arguments_json);
        }
        let missing = ToolCall { id: "c".into(), name: "lsp_query".into(), arguments_json: "{}".into() };
        assert!(reason_with_disclosure(&root, &missing, None).is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resuming_an_lsp_query_is_refused_when_the_program_or_the_question_changed_after_approval() {
        let root = temp_root();
        write_lsp_config(&root, "/bin/sh");
        let reason = reason_with_disclosure(&root, &lsp_call_record("hover", 1), Some("needs approval".into())).unwrap();
        let pending = PendingApprovalStore::for_root(&root)
            .create(context(&root), "m".into(), None, Vec::new(), 0, lsp_call_record("hover", 1), reason, 20)
            .unwrap();
        assert!(disclosure_changed(&pending).is_none(), "unchanged: allowed to run");
        write_lsp_config(&root, "/tmp/evil");
        let refusal = disclosure_changed(&pending).expect("a different program must be refused");
        assert!(refusal.denied && refusal.is_error && refusal.output.contains("language server"), "{refusal:?}");
        write_lsp_config(&root, "/bin/sh");
        assert!(disclosure_changed(&pending).is_none(), "restoring what was approved is fine");
        // The stored call is what is run, so a different question needs a different approval record.
        let other = PendingApprovalStore::for_root(&root)
            .create(context(&root), "m".into(), None, Vec::new(), 0, lsp_call_record("references", 1), pending.authority_reason.clone(), 20)
            .unwrap();
        assert!(disclosure_changed(&other).is_some(), "an approval for one question does not cover another");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn the_stored_summary_must_come_right_after_the_separator() {
        let root = temp_root();
        write_lsp_config(&root, "/bin/sh");
        let honest = reason_with_disclosure(&root, &lsp_call_record("hover", 1), Some("needs approval".into())).unwrap();
        let summary = honest.rsplit_once(" | ").unwrap().1.to_string();
        let store = PendingApprovalStore::for_root(&root);
        let make = |reason: String| store.create(context(&root), "m".into(), None, Vec::new(), 0, lsp_call_record("hover", 1), reason, 20).unwrap();
        assert!(disclosure_changed(&make(honest.clone())).is_none(), "the honest reason passes");
        // The same text without the separator in front is not what was stored by this code.
        assert!(disclosure_changed(&make(format!("needs approval{summary}"))).is_some());
        assert!(disclosure_changed(&make(summary.clone())).is_some(), "a reason that is only the summary was not built here");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn other_calls_keep_the_plain_reason() {
        let root = temp_root();
        assert_eq!(reason_with_disclosure(&root, &call(), Some("base".into())).unwrap(), "base");
        assert_eq!(reason_with_disclosure(&root, &call(), None).unwrap(), "requires explicit human approval");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn a_search_that_cannot_be_disclosed_is_an_error_not_a_blind_approval() {
        let root = temp_root();
        let ask = |call: &ToolCall| reason_with_disclosure(&root, call, Some("base".into()));
        assert!(ask(&search_call()).is_err(), "no configuration");
        write_search_config(&root, r#"{"endpoint":"https://s.example/","api_key_env":"GITHUB_TOKEN"}"#);
        assert!(ask(&search_call()).is_err(), "a key variable outside the reserved prefix");
        write_search_config(&root, r#"{"endpoint":"https://s.example/q"}"#);
        assert!(ask(&search_call()).is_ok());
        let with_args = |json: &str| ToolCall { id: "c".into(), name: "web_search".into(), arguments_json: json.into() };
        for bad in ["{}", "not json", r#"{"query":""}"#, r#"{"query":7}"#] {
            assert!(ask(&with_args(bad)).is_err(), "{bad}");
        }
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn a_query_that_could_spoof_the_prompt_is_refused_before_it_is_stored() {
        let root = temp_root();
        write_search_config(&root, r#"{"endpoint":"https://s.example/q"}"#);
        let with_query = |q: &str| ToolCall { id: "c".into(), name: "web_search".into(), arguments_json: serde_json::json!({"query": q}).to_string() };
        for bad in ["x\nsent to: good.example\nkey: no API key is sent", "x\u{1b}[2J", "a\u{202e}b", "a\u{200b}b", &"q".repeat(400)] {
            assert!(reason_with_disclosure(&root, &with_query(bad), None).is_err(), "{bad:?}");
        }
        assert!(reason_with_disclosure(&root, &with_query("  plain query  "), None).unwrap().contains("\"plain query\""), "trimmed");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn a_reason_that_merely_contains_the_summary_in_the_middle_does_not_pass() {
        let root = temp_root();
        write_search_config(&root, r#"{"endpoint":"https://good.example/q"}"#);
        let summary = disclosure_summary(&root, &search_call()).unwrap().unwrap();
        let forged = PendingApprovalStore::for_root(&root)
            .create(context(&root), "m".into(), None, Vec::new(), 0, search_call(), format!("{summary} | something appended"), 20)
            .unwrap();
        assert!(disclosure_changed(&forged).is_some());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resuming_a_search_is_refused_when_the_backend_changed_after_approval() {
        let root = temp_root();
        write_search_config(&root, r#"{"endpoint":"https://good.example/q"}"#);
        let pending = paused_search(&root);
        assert!(disclosure_changed(&pending).is_none(), "unchanged configuration: allowed to run");
        write_search_config(&root, r#"{"endpoint":"https://evil.example/q"}"#);
        let refusal = disclosure_changed(&pending).expect("a different host must be refused");
        assert!(refusal.is_error && refusal.denied && refusal.output.contains("changed since this was approved"), "{refusal:?}");
        write_search_config(&root, r#"{"endpoint":"https://good.example/q","api_key_env":"YANA_SEARCH_KEY"}"#);
        assert!(disclosure_changed(&pending).is_some(), "adding a key to the same host is also a change");
        fs::remove_file(root.join(".yana-ai/web-search.json")).unwrap();
        assert!(disclosure_changed(&pending).is_some(), "a vanished configuration is refused, not run");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn only_web_search_is_checked() {
        let root = temp_root();
        let pending = PendingApprovalStore::for_root(&root)
            .create(context(&root), "m".into(), None, Vec::new(), 0, call(), "x".into(), 20)
            .unwrap();
        assert!(disclosure_changed(&pending).is_none());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn create_and_get_round_trip() {
        let root = temp_root();
        let store = PendingApprovalStore::for_root(&root);
        let created = store
            .create(
                context(&root),
                "test-model".into(),
                None,
                vec![ChatMessage::text(crate::model::provider::Role::User, "hi")],
                0,
                call(),
                "needs a click".into(),
                20,
            )
            .unwrap();
        assert!(!created.resolved);
        assert!(created.decision.is_none());

        let fetched = store.get(&created.approval_id).unwrap();
        assert_eq!(fetched.approval_id, created.approval_id);
        assert_eq!(fetched.pending_call.name, "run_command");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resolve_records_the_decision_exactly_once() {
        let root = temp_root();
        let store = PendingApprovalStore::for_root(&root);
        let created = store
            .create(context(&root), "test-model".into(), None, vec![], 0, call(), "reason".into(), 20)
            .unwrap();

        let resolved = store
            .resolve(&created.approval_id, true, "human:anh".into())
            .unwrap();
        assert!(resolved.resolved);
        assert_eq!(resolved.decision, Some(true));
        assert_eq!(resolved.decided_by.as_deref(), Some("human:anh"));

        let second = store.resolve(&created.approval_id, false, "human:anh".into());
        assert!(second.is_err(), "resolving an already-resolved approval must fail, not silently overwrite the decision");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resolve_rejects_an_expired_approval() {
        let root = temp_root();
        let store = PendingApprovalStore::for_root(&root);
        let created = store
            .create(context(&root), "test-model".into(), None, vec![], 0, call(), "reason".into(), 20)
            .unwrap();
        // Hand-edit expires_at into the past -- the store must re-check
        // it fresh at resolve time, not trust a caller-held value.
        let mut approvals = read_approvals(&root).unwrap();
        approvals[0].expires_at = Utc::now() - chrono::Duration::minutes(1);
        write_approvals(&root, &approvals).unwrap();

        let result = store.resolve(&created.approval_id, true, "human:anh".into());
        assert!(result.is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resolve_rejects_an_unknown_approval_id() {
        let root = temp_root();
        let store = PendingApprovalStore::for_root(&root);
        assert!(store.resolve("does-not-exist", true, "human:anh".into()).is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn get_on_empty_store_is_a_clean_error_not_a_panic() {
        let root = temp_root();
        let store = PendingApprovalStore::for_root(&root);
        assert!(store.get("anything").is_err());
        assert!(store.list().unwrap().is_empty());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn corrupt_store_is_a_hard_error_not_a_silent_empty_list() {
        let root = temp_root();
        fs::create_dir_all(root.join(".yana-ai")).unwrap();
        fs::write(approvals_path(&root), b"not valid json").unwrap();
        assert!(PendingApprovalStore::for_root(&root).list().is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_store_is_rejected_not_followed() {
        use std::os::unix::fs::symlink;
        let root = temp_root();
        let path = approvals_path(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let target = root.join("outside-approval-store");
        fs::write(&target, "[]").unwrap();
        symlink(&target, &path).unwrap();
        let error = PendingApprovalStore::for_root(&root)
            .list()
            .unwrap_err()
            .to_string();
        assert!(error.contains("must be a regular file"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn concurrent_resolves_of_the_same_approval_let_exactly_one_win() {
        let root = std::sync::Arc::new(temp_root());
        let store = std::sync::Arc::new(PendingApprovalStore::for_root(&root));
        let created = store
            .create(context(&root), "test-model".into(), None, vec![], 0, call(), "reason".into(), 20)
            .unwrap();

        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let store = std::sync::Arc::clone(&store);
                let barrier = std::sync::Arc::clone(&barrier);
                let id = created.approval_id.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    store.resolve(&id, i % 2 == 0, format!("human:{i}")).is_ok()
                })
            })
            .collect();
        let successes = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .filter(|ok| *ok)
            .count();
        assert_eq!(
            successes, 1,
            "exactly one of 8 truly concurrent resolves must win; the rest must see resolved=true and fail"
        );
        let final_state = store.get(&created.approval_id).unwrap();
        assert!(final_state.resolved);
        assert!(final_state.decision.is_some());
        fs::remove_dir_all(root.as_path()).ok();
    }
}
