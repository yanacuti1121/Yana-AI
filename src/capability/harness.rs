//! `harness.audit`: read-only audit of the agents and skills under the session root.
//!
//! Thin wrapper over `crate::harness` (the Rust core). The result is bounded so a repo with
//! thousands of vendored skills cannot flood a model's context: every error is kept, warnings are
//! cut at `MAX_WARNINGS`, and `truncated` says so.

use super::encode;
use super::error::CapabilityError;
use crate::harness::audit::{Finding, Severity};
use std::path::Path;

/// Warnings returned to a caller; the full list stays available through `yana-rt harness audit --all`.
// Only the MCP server calls `harness_audit`; a build without that feature has no caller.
#[cfg_attr(not(feature = "mcp"), allow(dead_code))]
const MAX_WARNINGS: usize = 100;

#[cfg_attr(not(feature = "mcp"), allow(dead_code))]
pub fn harness_audit(root: &Path) -> Result<String, CapabilityError> {
    let report =
        crate::harness::audit_project(root).map_err(|detail| CapabilityError::Io { detail })?;
    let errors: Vec<&Finding> = report
        .findings
        .iter()
        .filter(|f| f.severity == Severity::Error)
        .collect();
    let warnings: Vec<&Finding> = report
        .findings
        .iter()
        .filter(|f| f.severity == Severity::Warning)
        .collect();
    let truncated = warnings.len() > MAX_WARNINGS;
    let shown: Vec<&Finding> = errors
        .iter()
        .copied()
        .chain(warnings.iter().copied().take(MAX_WARNINGS))
        .collect();
    encode(
        "harness.audit",
        serde_json::json!({
            "schema_version": report.schema_version,
            "agents": report.agents,
            "skills": report.skills,
            "errors": report.errors,
            "warnings": report.warnings,
            "findings": shown,
            "skipped": report.skipped,
        }),
        truncated,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, rel: &str, body: &str) {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    #[test]
    fn reports_counts_and_findings_for_a_small_project() {
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "core/agents/a.md",
            "---\nname: a\ndescription: d\n---\n",
        );
        write(
            dir.path(),
            "core/skills/s/SKILL.md",
            "---\nname: s\ndescription: d\n---\nUse TeamCreate.\n",
        );
        let parsed: serde_json::Value =
            serde_json::from_str(&harness_audit(dir.path()).unwrap()).unwrap();
        assert_eq!(parsed["capability"], "harness.audit");
        assert_eq!(parsed["data"]["agents"], 1);
        assert_eq!(parsed["data"]["errors"], 1);
        assert_eq!(parsed["data"]["findings"][0]["code"], "H002");
        assert_eq!(parsed["truncated"], false);
    }

    #[test]
    fn caps_warnings_but_keeps_every_error() {
        let dir = tempfile::tempdir().unwrap();
        let long = format!(
            "---\nname: n\ndescription: d\n---\n{}",
            "line\n".repeat(230)
        );
        for index in 0..(MAX_WARNINGS + 20) {
            write(
                dir.path(),
                &format!("core/skills/s{index}/SKILL.md"),
                &long.replace("name: n", &format!("name: s{index}")),
            );
        }
        write(dir.path(), "core/skills/bad/SKILL.md", "# no frontmatter\n");
        let parsed: serde_json::Value =
            serde_json::from_str(&harness_audit(dir.path()).unwrap()).unwrap();
        let findings = parsed["data"]["findings"].as_array().unwrap();
        assert_eq!(parsed["truncated"], true);
        assert_eq!(parsed["data"]["warnings"], MAX_WARNINGS + 20);
        assert_eq!(
            findings.len(),
            1 + MAX_WARNINGS,
            "one error plus the capped warnings"
        );
        assert_eq!(findings[0]["severity"], "error");
    }

    #[test]
    fn an_unreadable_root_is_an_error() {
        assert!(harness_audit(Path::new("/definitely/not/here")).is_err());
    }
}
