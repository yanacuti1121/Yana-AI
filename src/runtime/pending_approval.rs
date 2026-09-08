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
            approval.approval_id,
            approval.context.agent_id.as_deref().unwrap_or("human"),
            approval.pending_call.name
        );
        println!("  reason: {}", approval.authority_reason);
        println!("  expires at: {}", approval.expires_at);
    }
    Ok(())
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
        let result = super::execute_approved_tool(
            &super::YanaAuthorityChain,
            executor.as_ref(),
            &approval.context,
            &approval.pending_call,
            cancellation,
            emit,
        )?;
        push_tool_result(&mut messages, &result);
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
