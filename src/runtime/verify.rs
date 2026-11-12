//! `yana-rt authority verify`: do the execution receipts agree with the decision receipts?
//!
//! Read-only. It answers one question a person can act on: "did everything that ran have
//! an authority decision that allowed it?" It also reports log lines that cannot be read,
//! which `read_receipts` silently skips.
//!
//! Honest limit: this checks that the two logs are consistent with each other. It does NOT
//! make them tamper-proof. Someone who can write both files can edit them consistently and
//! pass. Detecting that needs a hash chain (and later a key), which is a separate change.
//!
//! Exit codes of the CLI: 0 intact, 2 problems found, 1 error. Only 0 means intact.

use super::receipt::{execution_receipts_path, receipts_path, AuthorityDecisionReceipt, ExecutionReceipt, ReceiptDecision};
use anyhow::{bail, Context, Result};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub(crate) const EXIT_INTACT: i32 = 0;
pub(crate) const EXIT_PROBLEMS: i32 = 2;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct Problem {
    pub code: &'static str,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct VerifyReport {
    pub decisions: usize,
    pub executions: usize,
    pub problems: Vec<Problem>,
}

impl VerifyReport {
    pub(crate) fn exit_code(&self) -> i32 {
        if self.problems.is_empty() {
            EXIT_INTACT
        } else {
            EXIT_PROBLEMS
        }
    }
}

/// Reads a JSONL log strictly: a missing file is empty, but a line that does not parse is
/// reported with its 1-based line number instead of being skipped.
fn read_strict<T: serde::de::DeserializeOwned>(path: &Path, unparseable: &'static str, problems: &mut Vec<Problem>) -> Result<Vec<T>> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_file() => {
            bail!("receipt log must be a regular file: {}", path.display())
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error).with_context(|| format!("cannot inspect {}", path.display())),
    }
    let text = fs::read_to_string(path).with_context(|| format!("cannot read {}", path.display()))?;
    let mut items = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<T>(line) {
            Ok(item) => items.push(item),
            Err(error) => problems.push(Problem {
                code: unparseable,
                detail: format!("line {} cannot be read: {error}", index + 1),
            }),
        }
    }
    Ok(items)
}

pub(crate) fn verify(root: &Path) -> Result<VerifyReport> {
    let mut problems = Vec::new();
    let decisions: Vec<AuthorityDecisionReceipt> =
        read_strict(&receipts_path(root), "unreadable_decision_line", &mut problems)?;
    let executions: Vec<ExecutionReceipt> =
        read_strict(&execution_receipts_path(root), "unreadable_execution_line", &mut problems)?;

    let mut by_id: HashMap<&str, &AuthorityDecisionReceipt> = HashMap::new();
    for decision in &decisions {
        if by_id.insert(decision.decision_id.as_str(), decision).is_some() {
            problems.push(Problem {
                code: "duplicate_decision_id",
                detail: format!("decision id {} appears more than once", decision.decision_id),
            });
        }
    }

    for execution in &executions {
        let who = format!("execution {}", execution.invocation_id);
        let Some(decision_id) = execution.authority_decision_id.as_deref() else {
            problems.push(Problem { code: "execution_without_decision_link", detail: format!("{who} has no decision link") });
            continue;
        };
        let Some(decision) = by_id.get(decision_id) else {
            problems.push(Problem {
                code: "execution_decision_missing",
                detail: format!("{who} points to decision {decision_id}, which is not in the log"),
            });
            continue;
        };
        if decision.decision != ReceiptDecision::Allow {
            problems.push(Problem {
                code: "execution_not_allowed",
                detail: format!("{who} ran under decision {decision_id}, which was {:?}, not Allow", decision.decision),
            });
        }
        if decision.turn_id != execution.turn_id || decision.subject != execution.subject || decision.workspace != execution.workspace {
            problems.push(Problem {
                code: "execution_mismatch",
                detail: format!("{who} does not match decision {decision_id} on turn, subject or workspace"),
            });
        }
        if execution.started_at < decision.timestamp {
            problems.push(Problem {
                code: "execution_before_decision",
                detail: format!("{who} started before decision {decision_id} was made"),
            });
        }
    }

    Ok(VerifyReport { decisions: decisions.len(), executions: executions.len(), problems })
}

/// CLI entry. Returns the process exit code; `Err` is an I/O or usage failure.
pub fn cmd_authority_verify(json: bool) -> Result<i32> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let report = verify(&root)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else if report.problems.is_empty() {
        println!(
            "INTACT: {} decision receipts, {} execution receipts; every execution traces to an allowing decision.",
            report.decisions, report.executions
        );
        println!("  note: this checks consistency between the logs, it is not tamper-proof.");
    } else {
        println!("PROBLEMS: {} found ({} decisions, {} executions)", report.problems.len(), report.decisions, report.executions);
        for problem in &report.problems {
            println!("  [{}] {}", problem.code, problem.detail);
        }
    }
    Ok(report.exit_code())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::tool::ToolCall;
    use crate::runtime::receipt::{read_receipts, record_execution};
    use crate::runtime::{AuthorityDecision, RuntimeAuthority, TurnContext, TurnOrigin, YanaAuthorityChain};
    use crate::session_context::SessionContext;
    use chrono::{Duration, Utc};

    fn context(root: &Path) -> TurnContext {
        let session = SessionContext::new("s", root.to_path_buf(), "p", "m", false);
        let mut context = TurnContext::new(session, TurnOrigin::Cursor, false);
        context.agent_id = Some("agent:cursor".into());
        context
    }

    fn call(tool: &str, command: &str) -> ToolCall {
        ToolCall { id: "c".into(), name: tool.into(), arguments_json: serde_json::json!({ "command": command }).to_string() }
    }

    /// Asks the real chain; returns the id of the decision receipt it recorded.
    fn decide(context: &TurnContext, tool: &str) -> (AuthorityDecision, String) {
        let decision = YanaAuthorityChain.authorize_tool(context, &call(tool, "npm test"));
        let id = read_receipts(&context.session.repo_root).last().unwrap().decision_id.clone();
        (decision, id)
    }

    fn execute(context: &TurnContext, decision_id: Option<String>) {
        let now = Utc::now();
        record_execution(context, decision_id, "read_file", "in", "out", false, now, now);
    }

    #[test]
    fn a_project_with_no_receipts_is_intact() {
        let root = tempfile::tempdir().unwrap();
        let report = verify(root.path()).unwrap();
        assert_eq!((report.decisions, report.executions), (0, 0));
        assert_eq!(report.exit_code(), EXIT_INTACT);
    }

    #[test]
    fn an_execution_under_an_allowing_decision_is_intact() {
        let root = tempfile::tempdir().unwrap();
        let context = context(root.path());
        let (decision, id) = decide(&context, "read_file");
        assert!(matches!(decision, AuthorityDecision::Allow { .. }));
        execute(&context, Some(id));
        let report = verify(root.path()).unwrap();
        assert_eq!((report.decisions, report.executions), (1, 1));
        assert!(report.problems.is_empty(), "{:?}", report.problems);
    }

    #[test]
    fn an_execution_under_a_denied_decision_is_a_problem() {
        let root = tempfile::tempdir().unwrap();
        let context = context(root.path());
        let (decision, id) = decide(&context, "run_command");
        assert!(matches!(decision, AuthorityDecision::Deny { .. }));
        execute(&context, Some(id));
        let report = verify(root.path()).unwrap();
        assert_eq!(report.exit_code(), EXIT_PROBLEMS);
        assert_eq!(report.problems[0].code, "execution_not_allowed");
    }

    #[test]
    fn an_execution_pointing_at_an_unknown_decision_is_a_problem() {
        let root = tempfile::tempdir().unwrap();
        execute(&context(root.path()), Some("no-such-decision".into()));
        let report = verify(root.path()).unwrap();
        assert_eq!(report.problems[0].code, "execution_decision_missing");
    }

    #[test]
    fn an_execution_with_no_decision_link_is_a_problem() {
        let root = tempfile::tempdir().unwrap();
        execute(&context(root.path()), None);
        let report = verify(root.path()).unwrap();
        assert_eq!(report.problems[0].code, "execution_without_decision_link");
    }

    #[test]
    fn deleting_the_decision_line_after_the_fact_is_caught() {
        let root = tempfile::tempdir().unwrap();
        let context = context(root.path());
        let (_, id) = decide(&context, "read_file");
        execute(&context, Some(id));
        fs::write(receipts_path(root.path()), "").unwrap();
        let report = verify(root.path()).unwrap();
        assert_eq!(report.exit_code(), EXIT_PROBLEMS);
        assert_eq!(report.problems[0].code, "execution_decision_missing");
    }

    #[test]
    fn a_line_that_cannot_be_read_is_reported_with_its_number() {
        let root = tempfile::tempdir().unwrap();
        let context = context(root.path());
        decide(&context, "read_file");
        let path = receipts_path(root.path());
        let mut text = fs::read_to_string(&path).unwrap();
        text.push_str("{ this is not json\n");
        fs::write(&path, text).unwrap();
        let report = verify(root.path()).unwrap();
        let problem = &report.problems[0];
        assert_eq!(problem.code, "unreadable_decision_line");
        assert!(problem.detail.contains("line 2"), "{}", problem.detail);
        assert_eq!(read_receipts(root.path()).len(), 1, "the lenient reader hides the bad line; verify must not");
    }

    #[test]
    fn a_duplicated_decision_id_is_a_problem() {
        let root = tempfile::tempdir().unwrap();
        decide(&context(root.path()), "read_file");
        let path = receipts_path(root.path());
        let line = fs::read_to_string(&path).unwrap();
        fs::write(&path, format!("{line}{line}")).unwrap();
        let report = verify(root.path()).unwrap();
        assert_eq!(report.problems[0].code, "duplicate_decision_id");
    }

    #[test]
    fn an_execution_by_a_different_subject_than_the_decision_is_a_problem() {
        let root = tempfile::tempdir().unwrap();
        let mut context = context(root.path());
        let (_, id) = decide(&context, "read_file");
        context.agent_id = Some("agent:someone-else".into());
        execute(&context, Some(id));
        let report = verify(root.path()).unwrap();
        assert!(report.problems.iter().any(|p| p.code == "execution_mismatch"));
    }

    #[test]
    fn an_execution_that_started_before_its_decision_is_a_problem() {
        let root = tempfile::tempdir().unwrap();
        let context = context(root.path());
        let (_, id) = decide(&context, "read_file");
        let early = Utc::now() - Duration::minutes(5);
        record_execution(&context, Some(id), "read_file", "in", "out", false, early, early);
        let report = verify(root.path()).unwrap();
        assert!(report.problems.iter().any(|p| p.code == "execution_before_decision"));
    }

    #[test]
    fn known_limit_a_consistent_edit_of_both_logs_is_not_detected() {
        // Turn a Deny into an Allow in the decision log while leaving everything else
        // consistent. Without a hash chain this passes. When the chain lands, this test
        // must be changed to expect a problem.
        let root = tempfile::tempdir().unwrap();
        let context = context(root.path());
        let (_, id) = decide(&context, "run_command");
        execute(&context, Some(id));
        let path = receipts_path(root.path());
        let edited = fs::read_to_string(&path).unwrap().replace("\"Deny\"", "\"Allow\"");
        fs::write(&path, edited).unwrap();
        assert!(verify(root.path()).unwrap().problems.is_empty());
    }
}
