//! `yana-rt authority check`: ask the real authority chain for one decision.
//!
//! This is the deterministic, model-free door to `YanaAuthorityChain` for any
//! engine's hook or adapter (Claude Code, Cursor, Codex, a shell script). It
//! asks for a REAL decision: the lease invocation budget is consumed and a
//! decision receipt is recorded, exactly as when `yana-rt chat` or the MCP
//! server calls the same chain.
//!
//! Two properties are deliberate:
//! - The turn is never human-initiated. A caller that is not a human at a
//!   terminal cannot claim to be one by passing a flag, and there is no
//!   `--human-approved` option: the post-approval path (`authorize_approved_tool`)
//!   is not reachable from here.
//! - Only exit code 0 means "allowed". Every other code, including errors
//!   and usage mistakes, must be treated by the caller as "not allowed", so a
//!   failure can never turn into a silent pass.

use super::{AuthorityDecision, RuntimeAuthority, TurnContext, TurnOrigin, YanaAuthorityChain};
use crate::model::tool::ToolCall;
use crate::session_context::SessionContext;
use anyhow::{bail, Context, Result};
use std::path::Path;

/// The only code that means the call may proceed.
pub(crate) const EXIT_ALLOW: i32 = 0;
/// The authority chain refused the call.
pub(crate) const EXIT_DENY: i32 = 2;
/// A person must decide before the call may proceed.
pub(crate) const EXIT_APPROVAL_REQUIRED: i32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CheckVerdict {
    Allow,
    Deny,
    ApprovalRequired,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct CheckOutcome {
    pub verdict: CheckVerdict,
    pub reason: Option<String>,
    pub authority: Option<String>,
    /// Correlates an Allow to its decision receipt and, later, its execution receipt.
    pub decision_id: Option<String>,
}

impl CheckOutcome {
    pub(crate) fn exit_code(&self) -> i32 {
        match self.verdict {
            CheckVerdict::Allow => EXIT_ALLOW,
            CheckVerdict::Deny => EXIT_DENY,
            CheckVerdict::ApprovalRequired => EXIT_APPROVAL_REQUIRED,
        }
    }
}

/// Accepts the lower-case names of `TurnOrigin`. Unknown names are an error,
/// never a default, so a typo cannot silently change who is asking.
pub(crate) fn parse_origin(raw: &str) -> Result<TurnOrigin> {
    Ok(match raw.trim().to_ascii_lowercase().as_str() {
        "terminal" => TurnOrigin::Terminal,
        "desktop" => TurnOrigin::Desktop,
        "remote" => TurnOrigin::Remote,
        "claude" => TurnOrigin::Claude,
        "codex" => TurnOrigin::Codex,
        "cursor" => TurnOrigin::Cursor,
        "scheduler" => TurnOrigin::Scheduler,
        "governor" => TurnOrigin::Governor,
        "subagent" => TurnOrigin::Subagent,
        "api" => TurnOrigin::Api,
        "mcp" => TurnOrigin::Mcp,
        other => bail!(
            "unknown origin '{other}'; expected one of: terminal, desktop, remote, claude, \
             codex, cursor, scheduler, governor, subagent, api, mcp"
        ),
    })
}

/// Runs the real, unmodified authority chain for one capability call.
pub(crate) fn check(
    root: &Path,
    subject: &str,
    origin: TurnOrigin,
    tool: &str,
    arguments_json: &str,
) -> CheckOutcome {
    let session = SessionContext::new(
        format!("authority-check-{}", uuid::Uuid::new_v4()),
        root.to_path_buf(),
        "authority-check",
        "n/a",
        false,
    );
    let mut context = TurnContext::new(session, origin, false);
    context.agent_id = Some(subject.to_string());
    let call = ToolCall {
        id: uuid::Uuid::new_v4().to_string(),
        name: tool.to_string(),
        arguments_json: arguments_json.to_string(),
    };

    match YanaAuthorityChain.authorize_tool(&context, &call) {
        AuthorityDecision::Allow { decision_id } => CheckOutcome {
            verdict: CheckVerdict::Allow,
            reason: None,
            authority: None,
            decision_id,
        },
        AuthorityDecision::Deny { authority, reason } => CheckOutcome {
            verdict: CheckVerdict::Deny,
            reason: Some(reason),
            authority: Some(authority.label().to_string()),
            decision_id: None,
        },
        AuthorityDecision::HumanApprovalRequired { authority, reason } => CheckOutcome {
            verdict: CheckVerdict::ApprovalRequired,
            reason: Some(reason),
            authority: Some(authority.label().to_string()),
            decision_id: None,
        },
    }
}

/// CLI entry. Returns the process exit code; `Err` is a usage or internal
/// error and the caller maps it to a non-zero, non-allow code.
pub fn cmd_authority_check(
    subject: String,
    origin: String,
    tool: String,
    arguments_json: String,
    json: bool,
) -> Result<i32> {
    if subject.trim().is_empty() {
        bail!("--subject must not be empty");
    }
    let origin = parse_origin(&origin)?;
    serde_json::from_str::<serde_json::Value>(&arguments_json)
        .context("--arguments-json must be valid JSON")?;
    let root = std::env::current_dir().context("cannot resolve project root")?;

    let outcome = check(&root, subject.trim(), origin, &tool, &arguments_json);
    if json {
        println!("{}", serde_json::to_string_pretty(&outcome)?);
    } else {
        let label = match outcome.verdict {
            CheckVerdict::Allow => "ALLOW",
            CheckVerdict::Deny => "DENY",
            CheckVerdict::ApprovalRequired => "APPROVAL_REQUIRED",
        };
        println!("{label}");
        if let Some(reason) = &outcome.reason {
            println!("  reason: {reason}");
        }
        if let Some(decision_id) = &outcome.decision_id {
            println!("  decision: {decision_id}");
        }
    }
    Ok(outcome.exit_code())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::lease::LeaseStore;
    use crate::runtime::receipt::{read_receipts, ReceiptDecision};

    /// The HALT check fails closed unless the project carries the flock
    /// protocol marker, so a test project needs one (same as `runtime::tests`).
    fn project() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join(yana_rt::flock_v1::PROTOCOL_FILE);
        std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
        std::fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        root
    }

    fn grant(root: &Path, subject: &str, allow: &[&str], deny: &[&str], budget: Option<u32>) {
        LeaseStore::for_root(root)
            .grant(
                subject.into(),
                "command.execute".into(),
                allow.iter().map(|s| s.to_string()).collect(),
                deny.iter().map(|s| s.to_string()).collect(),
                "human".into(),
                20,
                budget,
                None,
            )
            .unwrap();
    }

    fn run(root: &Path, subject: &str, command: &str) -> CheckOutcome {
        let args = serde_json::json!({ "command": command }).to_string();
        check(root, subject, TurnOrigin::Cursor, "run_command", &args)
    }

    #[test]
    fn read_only_capability_is_allowed_for_a_non_human_caller() {
        let root = project();
        let outcome = check(root.path(), "agent:cursor", TurnOrigin::Cursor, "read_file", "{}");
        assert_eq!(outcome.verdict, CheckVerdict::Allow);
        assert_eq!(outcome.exit_code(), EXIT_ALLOW);
        assert!(outcome.decision_id.is_some());
    }

    #[test]
    fn command_without_a_lease_is_denied_never_allowed() {
        let root = project();
        let outcome = run(root.path(), "agent:cursor", "npm test");
        assert_eq!(outcome.verdict, CheckVerdict::Deny);
        assert_eq!(outcome.exit_code(), EXIT_DENY);
        assert!(outcome.reason.unwrap().contains("non-human-initiated"));
    }

    #[test]
    fn command_inside_the_lease_scope_is_allowed() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(5));
        let outcome = run(root.path(), "agent:cursor", "npm test --silent");
        assert_eq!(outcome.verdict, CheckVerdict::Allow);
        assert!(outcome.decision_id.is_some());
    }

    #[test]
    fn command_outside_the_lease_scope_is_denied() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(5));
        let outcome = run(root.path(), "agent:cursor", "rm -rf build");
        assert_eq!(outcome.verdict, CheckVerdict::Deny);
        assert_eq!(outcome.exit_code(), EXIT_DENY);
    }

    #[test]
    fn deny_list_wins_over_allow_list() {
        let root = project();
        grant(root.path(), "agent:cursor", &["git"], &["git push"], Some(5));
        assert_eq!(run(root.path(), "agent:cursor", "git status").verdict, CheckVerdict::Allow);
        assert_eq!(run(root.path(), "agent:cursor", "git push origin main").verdict, CheckVerdict::Deny);
    }

    #[test]
    fn lease_belongs_to_one_subject() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(5));
        let outcome = run(root.path(), "agent:someone-else", "npm test");
        assert_eq!(outcome.verdict, CheckVerdict::Deny);
    }

    #[test]
    fn exhausted_invocation_budget_denies_the_next_call() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(1));
        assert_eq!(run(root.path(), "agent:cursor", "npm test").verdict, CheckVerdict::Allow);
        assert_eq!(run(root.path(), "agent:cursor", "npm test").verdict, CheckVerdict::Deny);
    }

    #[test]
    fn unknown_tool_is_denied() {
        let root = project();
        let outcome = check(root.path(), "agent:cursor", TurnOrigin::Cursor, "no_such_tool", "{}");
        assert_eq!(outcome.verdict, CheckVerdict::Deny);
    }

    #[test]
    fn a_halted_project_denies_every_call_even_with_a_valid_lease() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(5));
        // Same path as `os::supervisor::HALT_PATH` (private there). If it ever
        // moves, this test fails loudly instead of silently passing.
        let halt = root.path().join(".claude/state/GIAMTHI_HALT.lock");
        std::fs::create_dir_all(halt.parent().unwrap()).unwrap();
        std::fs::write(halt, "halted for test").unwrap();

        let read = check(root.path(), "agent:cursor", TurnOrigin::Cursor, "read_file", "{}");
        let command = run(root.path(), "agent:cursor", "npm test");
        assert_eq!(read.verdict, CheckVerdict::Deny);
        assert_eq!(command.verdict, CheckVerdict::Deny);
        assert!(command.reason.unwrap().contains("HALT"));
    }

    #[test]
    fn every_decision_leaves_a_receipt() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(5));
        run(root.path(), "agent:cursor", "npm test");
        run(root.path(), "agent:cursor", "rm -rf build");
        let receipts = read_receipts(root.path());
        assert_eq!(receipts.len(), 2);
        assert!(matches!(receipts[0].decision, ReceiptDecision::Allow));
        assert!(matches!(receipts[1].decision, ReceiptDecision::Deny));
        assert!(receipts[0].lease_id.is_some());
    }

    // A receipt must say WHICH rule refused the call, not only that it was refused.

    fn denial_reason(outcome: CheckOutcome) -> String {
        assert_eq!(outcome.verdict, CheckVerdict::Deny);
        outcome.reason.unwrap()
    }

    #[test]
    fn denial_says_no_lease_was_granted() {
        let root = project();
        let reason = denial_reason(run(root.path(), "agent:cursor", "npm test"));
        assert!(reason.contains("no lease granted to 'agent:cursor'"), "{reason}");
    }

    #[test]
    fn denial_names_the_deny_list_entry() {
        let root = project();
        grant(root.path(), "agent:cursor", &["git"], &["git push"], Some(5));
        let reason = denial_reason(run(root.path(), "agent:cursor", "git push origin main"));
        assert!(reason.contains("deny list ('git push')"), "{reason}");
    }

    #[test]
    fn denial_says_the_command_is_outside_the_lease_scope() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(5));
        let reason = denial_reason(run(root.path(), "agent:cursor", "rm -rf build"));
        assert!(reason.contains("outside the lease scope"), "{reason}");
    }

    #[test]
    fn denial_says_the_invocation_budget_is_exhausted() {
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(1));
        run(root.path(), "agent:cursor", "npm test");
        let reason = denial_reason(run(root.path(), "agent:cursor", "npm test"));
        assert!(reason.contains("invocation budget exhausted"), "{reason}");
    }

    #[test]
    fn denial_says_the_lease_was_revoked() {
        let root = project();
        let store = LeaseStore::for_root(root.path());
        let lease = store
            .grant(
                "agent:cursor".into(),
                "command.execute".into(),
                vec!["npm".into()],
                vec![],
                "human".into(),
                20,
                None,
                None,
            )
            .unwrap();
        store.revoke(&lease.id).unwrap();
        let reason = denial_reason(run(root.path(), "agent:cursor", "npm test"));
        assert!(reason.contains("revoked"), "{reason}");
    }

    #[test]
    fn denial_says_the_lease_has_expired() {
        let root = project();
        // Zero minutes: expires the moment it is granted.
        LeaseStore::for_root(root.path())
            .grant(
                "agent:cursor".into(),
                "command.execute".into(),
                vec!["npm".into()],
                vec![],
                "human".into(),
                0,
                None,
                None,
            )
            .unwrap();
        let reason = denial_reason(run(root.path(), "agent:cursor", "npm test"));
        assert!(reason.contains("expired"), "{reason}");
    }

    #[test]
    fn the_reason_never_changes_the_verdict() {
        // Explaining a denial is read-only: it must not consume budget or flip a decision.
        let root = project();
        grant(root.path(), "agent:cursor", &["npm test"], &[], Some(1));
        run(root.path(), "agent:cursor", "rm -rf build");
        run(root.path(), "agent:cursor", "rm -rf build");
        assert_eq!(run(root.path(), "agent:cursor", "npm test").verdict, CheckVerdict::Allow);
    }

    #[test]
    fn origin_names_parse_and_unknown_names_are_errors() {
        assert_eq!(parse_origin("Cursor").unwrap(), TurnOrigin::Cursor);
        assert_eq!(parse_origin(" claude ").unwrap(), TurnOrigin::Claude);
        assert!(parse_origin("human").is_err());
        assert!(parse_origin("").is_err());
    }

    #[test]
    fn cmd_rejects_empty_subject_and_malformed_arguments() {
        assert!(cmd_authority_check("  ".into(), "api".into(), "read_file".into(), "{}".into(), true).is_err());
        assert!(cmd_authority_check("agent:x".into(), "api".into(), "read_file".into(), "{not json".into(), true).is_err());
        assert!(cmd_authority_check("agent:x".into(), "robot".into(), "read_file".into(), "{}".into(), true).is_err());
    }
}
