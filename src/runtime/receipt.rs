//! Authority Decision Receipt (Authority Hardening, item #3).
//!
//! A Capability Lease (or any other authority decision) must not become an
//! "invisible" grant of power. Every capability-scoped decision
//! `YanaAuthorityChain::capability_decision` makes — allow, deny, or
//! human-approval-required — is recorded here with enough evidence to
//! reconstruct *why* that specific invocation was permitted or refused,
//! not just that it was.
//!
//! This is deliberately a new, narrow module rather than an extension of
//! an existing one: `capability::evidence::ToolEvidence` records
//! per-tool-RESULT file-touch metadata (what a tool changed), and
//! `crate::evidence` is a Truth-Gate HMAC receipt keyed to defeat a model
//! *fabricating* a "done" claim — neither already records an
//! authority-decision trace, and stretching either to also mean this would
//! blur two already-distinct, working mechanisms. See
//! `docs/adr/` (Authority Hardening workstream) for the fuller comparison.
//!
//! Persistence follows `cost.rs`'s exact append-only JSONL pattern
//! (`.yana-ai/authority-receipts.jsonl`, `O_APPEND` + `O_NOFOLLOW` + capped
//! line size) rather than `lease.rs`'s read-modify-write-under-lock
//! pattern: a receipt is only ever appended, never mutated in place, so
//! there is no lost-update race to close and no `flock-v1` critical
//! section is needed — the same reasoning `cost.rs`'s own
//! `concurrent_appends_preserve_every_json_line` test already proves for
//! this exact append pattern under real thread concurrency.
//!
//! Recording is best-effort: a receipt-write failure (disk full, permission
//! denied) is logged and swallowed, never propagated into the authority
//! decision itself. Letting an observability-write failure flip or block a
//! real authorization would turn a logging outage into either a denial of
//! service or, worse, a bypass if ever mis-wired — the receipt is evidence
//! *about* the decision, not part of the decision.
//!
//! Known, honestly-documented limitation: `policy_snapshot` is always
//! `None` today. No policy-versioning or policy-hash primitive exists yet
//! anywhere in this codebase (confirmed by grep — `policy_hash`,
//! `policy_version`, `PolicySnapshot` all return zero hits outside this
//! comment) for `capability_decision` to snapshot. The field is kept in
//! the schema now so a future policy-versioning primitive only needs to
//! populate it, not add a new receipt field and migrate every existing
//! receipt reader.

use crate::runtime::authority::{AuthorityDecision, AuthorityLayer};
use crate::runtime::TurnContext;
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_RECEIPT_ENTRY_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) enum ReceiptDecision {
    Allow,
    Deny,
    HumanApprovalRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct AuthorityDecisionReceipt {
    pub decision_id: String,
    /// Correlates every capability decision made within one logical turn
    /// — including delegated subagent calls, which inherit their parent's
    /// `turn_id` (see `TurnContext::for_subagent`) rather than minting a
    /// fresh one, so a receipt reader can reconstruct the full causal
    /// chain for one human-initiated turn even across delegation.
    pub turn_id: String,
    /// `context.agent_id` for a delegated/subagent call, or `"human"` for
    /// a directly human-driven turn — never empty.
    pub subject: String,
    pub capability: String,
    pub workspace: PathBuf,
    pub decision: ReceiptDecision,
    /// Which authority layer produced this decision — `"giam_thi"` (HALT)
    /// or `"yana_control_plane"` (registry/lease/approval logic). Mirrors
    /// `AuthorityLayer::label()`.
    pub authority: String,
    pub reason: String,
    /// The specific lease that is the evidence behind an `Allow`, if this
    /// decision was satisfied by a Capability Lease rather than a
    /// no-approval-required capability or a live human click.
    pub lease_id: Option<String>,
    /// Always `None` today — see the module doc's "Known limitation".
    pub policy_snapshot: Option<String>,
    pub timestamp: DateTime<Utc>,
}

fn receipts_path(root: &Path) -> PathBuf {
    root.join(".yana-ai").join("authority-receipts.jsonl")
}

fn append_receipt_at(root: &Path, receipt: &AuthorityDecisionReceipt) -> Result<()> {
    let path = receipts_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "cannot create authority receipt directory {}",
                parent.display()
            )
        })?;
    }
    let mut line =
        serde_json::to_vec(receipt).context("cannot serialize authority decision receipt")?;
    line.push(b'\n');
    if line.len() > MAX_RECEIPT_ENTRY_BYTES {
        bail!(
            "authority decision receipt exceeds {} byte limit",
            MAX_RECEIPT_ENTRY_BYTES
        );
    }
    let mut options = fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options
        .open(&path)
        .with_context(|| format!("cannot open authority receipt log {}", path.display()))?;
    if !file.metadata()?.is_file() {
        bail!(
            "authority receipt log must be a regular file: {}",
            path.display()
        );
    }
    let written = file
        .write(&line)
        .with_context(|| format!("cannot append authority receipt log {}", path.display()))?;
    if written != line.len() {
        bail!(
            "short authority receipt append at {}: wrote {written} of {} bytes",
            path.display(),
            line.len()
        );
    }
    Ok(())
}

/// Reads every receipt ever appended for `root`, oldest first. Malformed
/// lines are skipped rather than failing the whole read — this is a
/// diagnostic/audit trail, not an authority source, so a single corrupted
/// line must not hide every receipt around it. (Contrast `lease.rs`'s
/// `read_leases`, which is intentionally a hard error on corruption
/// because leases *are* authority evidence.)
pub(crate) fn read_receipts(root: &Path) -> Vec<AuthorityDecisionReceipt> {
    let path = receipts_path(root);
    let Ok(text) = fs::read_to_string(&path) else {
        return vec![];
    };
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect()
}

fn decision_shape(decision: &AuthorityDecision) -> (ReceiptDecision, AuthorityLayer, String) {
    match decision {
        AuthorityDecision::Allow => (
            ReceiptDecision::Allow,
            AuthorityLayer::YanaControlPlane,
            "allowed".to_string(),
        ),
        AuthorityDecision::Deny { authority, reason } => {
            (ReceiptDecision::Deny, *authority, reason.clone())
        }
        AuthorityDecision::HumanApprovalRequired { authority, reason } => (
            ReceiptDecision::HumanApprovalRequired,
            *authority,
            reason.clone(),
        ),
    }
}

/// Builds and appends the receipt for one capability decision. Best-effort:
/// a write failure is logged to stderr and swallowed — see the module doc.
pub(crate) fn record(
    context: &TurnContext,
    capability: &str,
    decision: &AuthorityDecision,
    lease_id: Option<String>,
) {
    let (receipt_decision, authority, reason) = decision_shape(decision);
    let subject = context
        .agent_id
        .clone()
        .unwrap_or_else(|| "human".to_string());
    let receipt = AuthorityDecisionReceipt {
        decision_id: Uuid::new_v4().to_string(),
        turn_id: context.turn_id.clone(),
        subject,
        capability: capability.to_string(),
        workspace: context.session.repo_root.clone(),
        decision: receipt_decision,
        authority: authority.label().to_string(),
        reason,
        lease_id,
        policy_snapshot: None,
        timestamp: Utc::now(),
    };
    if let Err(error) = append_receipt_at(&context.session.repo_root, &receipt) {
        eprintln!("[yana-rt] warning: could not record authority decision receipt: {error:#}");
    }
}

/// `yana-rt authority receipts` — a receipt log a human never reads is the
/// exact "invisible grant of power" item #3 exists to prevent, so this is
/// wired up now rather than left as an internal-only read function.
/// Mirrors `capability::lease::cmd_lease_list`'s json/plain-text split.
pub fn cmd_authority_receipts(last: Option<usize>, json: bool) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let mut receipts = read_receipts(&root);
    if let Some(last) = last {
        let skip = receipts.len().saturating_sub(last);
        receipts.drain(..skip);
    }
    if json {
        println!("{}", serde_json::to_string_pretty(&receipts)?);
        return Ok(());
    }
    if receipts.is_empty() {
        println!("No authority decision receipts recorded yet.");
        return Ok(());
    }
    for receipt in &receipts {
        let decision_label = match receipt.decision {
            ReceiptDecision::Allow => "ALLOW",
            ReceiptDecision::Deny => "DENY",
            ReceiptDecision::HumanApprovalRequired => "APPROVAL_REQUIRED",
        };
        println!(
            "[{}] {decision_label:<18} subject={} capability={} authority={} turn={}",
            receipt.timestamp, receipt.subject, receipt.capability, receipt.authority, receipt.turn_id
        );
        println!("  reason: {}", receipt.reason);
        if let Some(lease_id) = &receipt.lease_id {
            println!("  lease:  {lease_id}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::{TurnContext, TurnOrigin};
    use crate::session_context::SessionContext;
    use std::path::PathBuf;

    fn temp_root() -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("yana-receipt-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
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
        TurnContext::new(session, TurnOrigin::Terminal, true)
    }

    #[test]
    fn allow_deny_and_approval_required_all_round_trip() {
        let root = temp_root();
        let ctx = context(&root);

        record(&ctx, "command.execute", &AuthorityDecision::Allow, None);
        record(
            &ctx,
            "command.execute",
            &AuthorityDecision::Deny {
                authority: AuthorityLayer::GiamThi,
                reason: "HALT active".into(),
            },
            None,
        );
        record(
            &ctx,
            "command.execute",
            &AuthorityDecision::HumanApprovalRequired {
                authority: AuthorityLayer::YanaControlPlane,
                reason: "needs a click".into(),
            },
            None,
        );

        let receipts = read_receipts(&root);
        assert_eq!(receipts.len(), 3);
        assert_eq!(receipts[0].decision, ReceiptDecision::Allow);
        assert_eq!(receipts[1].decision, ReceiptDecision::Deny);
        assert_eq!(receipts[1].authority, "giam_thi");
        assert_eq!(receipts[2].decision, ReceiptDecision::HumanApprovalRequired);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn allow_via_lease_records_the_lease_id() {
        let root = temp_root();
        let ctx = context(&root);
        record(
            &ctx,
            "command.execute",
            &AuthorityDecision::Allow,
            Some("abc12345".to_string()),
        );
        let receipts = read_receipts(&root);
        assert_eq!(receipts[0].lease_id.as_deref(), Some("abc12345"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn subject_defaults_to_human_when_no_agent_id_is_set() {
        let root = temp_root();
        let ctx = context(&root);
        assert!(ctx.agent_id.is_none());
        record(&ctx, "command.execute", &AuthorityDecision::Allow, None);
        let receipts = read_receipts(&root);
        assert_eq!(receipts[0].subject, "human");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn subagent_receipt_carries_the_agent_id_and_inherits_parent_turn_id() {
        let root = temp_root();
        let parent = context(&root);
        let child = parent.for_subagent("agent:test-fixer");
        assert_eq!(child.turn_id, parent.turn_id, "delegation must not mint a fresh turn_id");

        record(&child, "command.execute", &AuthorityDecision::Allow, None);
        let receipts = read_receipts(&root);
        assert_eq!(receipts[0].subject, "agent:test-fixer");
        assert_eq!(receipts[0].turn_id, parent.turn_id);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn missing_receipt_log_reads_as_empty_not_an_error() {
        let root = temp_root();
        assert!(read_receipts(&root).is_empty());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn a_malformed_line_is_skipped_not_fatal_to_the_rest_of_the_log() {
        let root = temp_root();
        let ctx = context(&root);
        record(&ctx, "command.execute", &AuthorityDecision::Allow, None);
        // Hand-corrupt a second line into the log.
        use std::io::Write as _;
        let mut file = fs::OpenOptions::new()
            .append(true)
            .open(receipts_path(&root))
            .unwrap();
        writeln!(file, "not valid json").unwrap();
        record(&ctx, "command.execute", &AuthorityDecision::Allow, None);

        let receipts = read_receipts(&root);
        assert_eq!(receipts.len(), 2, "the malformed line must be skipped, not fatal");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn concurrent_records_lose_none_of_them() {
        let root = std::sync::Arc::new(temp_root());
        let ctx = std::sync::Arc::new(context(&root));
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(16));
        let handles: Vec<_> = (0..16)
            .map(|_| {
                let root = std::sync::Arc::clone(&root);
                let ctx = std::sync::Arc::clone(&ctx);
                let barrier = std::sync::Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    record(&ctx, "command.execute", &AuthorityDecision::Allow, None);
                    let _ = &root;
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        let receipts = read_receipts(&root);
        assert_eq!(receipts.len(), 16, "append-only writes must not lose any concurrent receipt");
        fs::remove_dir_all(root.as_path()).ok();
    }
}
