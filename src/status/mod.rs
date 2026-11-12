//! `yana-rt status`: one read-only snapshot of what is running and what is waiting on a person.
//!
//! Studio, the notch app, the menu bar and the terminal all read this one answer instead of each
//! re-reading its own files. Nothing here changes state: it lists, it never approves, denies or
//! starts anything. Where a source cannot be read the field is `null` and named in `unavailable`,
//! so a consumer can say "unknown" instead of showing a calm "nothing pending" nobody verified.

mod audit;
mod engines;
#[cfg(test)]
mod tests;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::path::{Path, PathBuf};

use audit::AuditEntry;
use engines::RunningEngine;

const SCHEMA: u32 = 1;
const AUDIT_TAIL: usize = 4;
/// A denial this recent still counts as "just happened" for the headline state.
const RECENT_DENY_SECONDS: i64 = 5;
const HALT_LOCK: &str = ".claude/state/GIAMTHI_HALT.lock";
const AUDIT_LOG: &str = ".claude/state/audit-chain.log";
const ID_CHARS: usize = 24;
const REASON_CHARS: usize = 80;

/// Headline, worst first: a halt outranks a question, a question outranks a denial.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Halted,
    Ask,
    Deny,
    Run,
    Idle,
    Unknown,
}

/// A pause waiting for a person. The stored record also holds the whole conversation and the raw
/// tool call; neither is copied here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PendingSummary {
    pub id: String,
    pub capability: String,
    pub reason: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct Snapshot {
    pub schema: u32,
    pub generated_at: String,
    pub state: State,
    /// Things that need a person, in the order they should be looked at.
    pub attention: Vec<&'static str>,
    pub engines: Option<Vec<RunningEngine>>,
    pub approvals: Option<Vec<PendingSummary>>,
    pub audit: Option<Vec<AuditEntry>>,
    pub halted: bool,
    pub unavailable: Vec<&'static str>,
}

fn clean(text: &str, limit: usize) -> String {
    let flat: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let flat = flat.trim();
    if flat.chars().count() > limit {
        let cut: String = flat.chars().take(limit - 1).collect();
        format!("{cut}…")
    } else {
        flat.to_string()
    }
}

fn recently_denied(audit: &[AuditEntry], now: DateTime<Utc>) -> bool {
    audit.first().is_some_and(|entry| {
        entry.is_deny()
            && DateTime::parse_from_rfc3339(&entry.ts)
                .is_ok_and(|ts| (now - ts.with_timezone(&Utc)).num_seconds() < RECENT_DENY_SECONDS)
    })
}

/// Headline state and the attention list from what could be read.
pub fn derive(
    halted: bool,
    approvals: Option<&[PendingSummary]>,
    audit: Option<&[AuditEntry]>,
    engines: Option<&[RunningEngine]>,
    now: DateTime<Utc>,
) -> (State, Vec<&'static str>) {
    let pending = approvals.is_some_and(|list| !list.is_empty());
    let denied = audit.is_some_and(|list| recently_denied(list, now));
    let mut attention = Vec::new();
    if halted {
        attention.push("halted");
    }
    if pending {
        attention.push("approval_pending");
    }
    if denied {
        attention.push("recently_denied");
    }
    let state = if halted {
        State::Halted
    } else if approvals.is_none() {
        State::Unknown
    } else if pending {
        State::Ask
    } else if denied {
        State::Deny
    } else {
        match engines {
            Some(list) if !list.is_empty() => State::Run,
            Some(_) => State::Idle,
            None => State::Unknown,
        }
    };
    (state, attention)
}

fn pending_approvals(root: &Path, now: DateTime<Utc>) -> Result<Vec<PendingSummary>> {
    let store = crate::runtime::PendingApprovalStore::for_root(root);
    Ok(store
        .list()?
        .into_iter()
        .filter(|item| !item.resolved && item.expires_at > now)
        .map(|item| PendingSummary {
            id: clean(&item.approval_id, ID_CHARS),
            capability: clean(&item.pending_call.name, ID_CHARS),
            reason: clean(&item.authority_reason, REASON_CHARS),
            expires_at: item.expires_at.to_rfc3339(),
        })
        .collect())
}

pub fn collect(root: &Path, now: DateTime<Utc>) -> Snapshot {
    let mut unavailable = Vec::new();
    let approvals = pending_approvals(root, now).ok();
    if approvals.is_none() {
        unavailable.push("approvals");
    }
    let audit = match audit::tail(&root.join(AUDIT_LOG), AUDIT_TAIL) {
        Ok(entries) => Some(entries.unwrap_or_default()),
        Err(_) => {
            unavailable.push("audit");
            None
        }
    };
    let engines = engines::scan();
    if engines.is_none() {
        unavailable.push("engines");
    }
    let halted = root.join(HALT_LOCK).exists();
    let (state, attention) = derive(halted, approvals.as_deref(), audit.as_deref(), engines.as_deref(), now);
    Snapshot {
        schema: SCHEMA,
        generated_at: now.to_rfc3339(),
        state,
        attention,
        engines,
        approvals,
        audit,
        halted,
        unavailable,
    }
}

fn render(snapshot: &Snapshot) -> String {
    let mut out = format!("state: {:?}\n", snapshot.state).to_lowercase();
    match &snapshot.engines {
        Some(list) if !list.is_empty() => {
            let names: Vec<String> = list.iter().map(|e| format!("{} x{}", e.name, e.count)).collect();
            out.push_str(&format!("running: {}\n", names.join(", ")));
        }
        Some(_) => out.push_str("running: none\n"),
        None => out.push_str("running: unknown\n"),
    }
    for item in snapshot.approvals.iter().flatten() {
        out.push_str(&format!("waiting: #{} {} ({})\n", item.id, item.capability, item.reason));
    }
    if snapshot.halted {
        out.push_str("halted: Giám Thị lock is present\n");
    }
    if !snapshot.unavailable.is_empty() {
        out.push_str(&format!("unavailable: {}\n", snapshot.unavailable.join(", ")));
    }
    out
}

/// `yana-rt status [--json] [--root <path>]`.
pub fn dispatch(json: bool, root: Option<PathBuf>) -> Result<()> {
    let root = match root {
        Some(root) => root,
        None => std::env::current_dir().context("cannot resolve project root")?,
    };
    let snapshot = collect(&root, Utc::now());
    if json {
        println!("{}", serde_json::to_string_pretty(&snapshot)?);
    } else {
        print!("{}", render(&snapshot));
    }
    Ok(())
}
