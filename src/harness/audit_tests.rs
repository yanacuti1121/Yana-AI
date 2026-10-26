use super::audit::{self, Severity};
use super::inventory::scan;
use std::fs;
use std::path::Path;

fn write(dir: &Path, rel: &str, body: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

fn agent(name: &str, extra: &str) -> String {
    format!("---\nname: {name}\ndescription: does {name}\n{extra}---\n# {name}\n")
}

fn audit_dir(dir: &Path) -> audit::Report {
    audit::run(&scan(dir))
}

fn codes(report: &audit::Report) -> Vec<&'static str> {
    report.findings.iter().map(|f| f.code).collect()
}

#[test]
fn a_clean_project_has_no_findings_and_exit_code_zero() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/agents/a.md",
        &agent("a", "tools: Read, Grep\n"),
    );
    write(dir.path(), "core/skills/s/SKILL.md", &agent("s", ""));
    let report = audit_dir(dir.path());
    assert!(report.findings.is_empty(), "{:?}", report.findings);
    assert_eq!(
        (report.agents, report.skills, report.exit_code()),
        (1, 1, 0)
    );
}

#[test]
fn h002_flags_each_dead_api_line_and_honours_the_allow_marker() {
    let dir = tempfile::tempdir().unwrap();
    let body = "---\nname: team\ndescription: d\n---\nCall TeamCreate here.\nSet CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1\nTeamDelete is gone <!-- harness-allow: H002 -->\n";
    write(dir.path(), "core/skills/team/SKILL.md", body);
    let report = audit_dir(dir.path());
    let hits: Vec<_> = report
        .findings
        .iter()
        .filter(|f| f.code == "H002")
        .collect();
    assert_eq!(
        hits.iter().map(|f| f.line).collect::<Vec<_>>(),
        [Some(5), Some(6)]
    );
    assert!(hits.iter().all(|f| f.severity == Severity::Error));
    assert_eq!(report.exit_code(), 1);
}

#[test]
fn h003_flags_a_reviewer_with_write_tools_but_not_an_implementer() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/agents/code-auditor.md",
        &agent("code-auditor", "tools: Read, Write, Edit\n"),
    );
    write(
        dir.path(),
        "core/agents/arch-reviewer.md",
        &agent("arch-reviewer", "tools: Read, MultiEdit\n"),
    );
    write(
        dir.path(),
        "core/agents/ok-auditor.md",
        &agent("ok-auditor", "tools: Read, Grep\n"),
    );
    write(
        dir.path(),
        "core/agents/backend-developer.md",
        &agent("backend-developer", "tools: Read, Write, Edit\n"),
    );
    let report = audit_dir(dir.path());
    let mut flagged: Vec<_> = report
        .findings
        .iter()
        .filter(|f| f.code == "H003")
        .map(|f| f.path.as_str())
        .collect();
    flagged.sort();
    assert_eq!(
        flagged,
        [
            "core/agents/arch-reviewer.md",
            "core/agents/code-auditor.md"
        ]
    );
    assert_eq!(report.exit_code(), 0, "H003 is a warning");
}

#[test]
fn h005_flags_both_files_that_share_a_name_within_one_tree_only() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "core/agents/x/a.md", &agent("same", ""));
    write(dir.path(), "core/agents/y/b.md", &agent("same", ""));
    write(dir.path(), ".claude/agents/c.md", &agent("same", ""));
    let report = audit_dir(dir.path());
    let dup: Vec<_> = report
        .findings
        .iter()
        .filter(|f| f.code == "H005")
        .map(|f| f.path.as_str())
        .collect();
    assert_eq!(dup, ["core/agents/x/a.md", "core/agents/y/b.md"]);
    assert!(report
        .findings
        .iter()
        .filter(|f| f.code == "H005")
        .all(|f| f.severity == Severity::Error));
}

#[test]
fn h006_flags_a_skill_over_the_line_limit_but_not_one_at_the_limit() {
    let dir = tempfile::tempdir().unwrap();
    let filler = |count: usize| "line\n".repeat(count);
    write(
        dir.path(),
        "core/skills/long/SKILL.md",
        &format!("---\nname: long\ndescription: d\n---\n{}", filler(217)),
    );
    write(
        dir.path(),
        "core/skills/edge/SKILL.md",
        &format!("---\nname: edge\ndescription: d\n---\n{}", filler(216)),
    );
    let report = audit_dir(dir.path());
    let flagged: Vec<_> = report
        .findings
        .iter()
        .filter(|f| f.code == "H006")
        .map(|f| f.path.as_str())
        .collect();
    assert_eq!(flagged, ["core/skills/long/SKILL.md"]);
}

#[test]
fn h007_flags_a_mirror_whose_content_differs_but_ignores_files_present_on_one_side() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "core/skills/s/SKILL.md", &agent("s", ""));
    write(
        dir.path(),
        ".claude/skills/s/SKILL.md",
        &format!("{}extra\n", agent("s", "")),
    );
    write(dir.path(), "core/skills/same/SKILL.md", &agent("same", ""));
    write(
        dir.path(),
        ".claude/skills/same/SKILL.md",
        &agent("same", ""),
    );
    write(dir.path(), "core/skills/only/SKILL.md", &agent("only", ""));
    let report = audit_dir(dir.path());
    let drift: Vec<_> = report
        .findings
        .iter()
        .filter(|f| f.code == "H007")
        .map(|f| f.path.as_str())
        .collect();
    assert_eq!(drift, [".claude/skills/s/SKILL.md"]);
}

#[test]
fn h009_accepts_the_vendor_prefix_convention_but_not_other_name_mismatches() {
    let dir = tempfile::tempdir().unwrap();
    write(
        dir.path(),
        "core/skills/mattpocock--tdd/SKILL.md",
        &agent("tdd", ""),
    );
    write(
        dir.path(),
        "core/skills/mattpocock--tdd-extra/SKILL.md",
        &agent("tdd", ""),
    );
    write(
        dir.path(),
        "core/skills/wrong/SKILL.md",
        &agent("right", ""),
    );
    let report = audit_dir(dir.path());
    let flagged: Vec<_> = report
        .findings
        .iter()
        .filter(|f| f.code == "H009")
        .map(|f| f.path.as_str())
        .collect();
    assert_eq!(
        flagged,
        [
            "core/skills/mattpocock--tdd-extra/SKILL.md",
            "core/skills/wrong/SKILL.md"
        ]
    );
}

#[test]
fn h005_is_a_warning_for_skills_and_an_error_for_agents() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "core/skills/tdd/SKILL.md", &agent("tdd", ""));
    write(
        dir.path(),
        "core/skills/mattpocock--tdd/SKILL.md",
        &agent("tdd", ""),
    );
    let report = audit_dir(dir.path());
    assert!(report
        .findings
        .iter()
        .all(|f| f.code != "H005" || f.severity == Severity::Warning));
    assert_eq!(report.exit_code(), 0);
}

#[test]
fn h009_reports_missing_fields_missing_block_and_a_skill_name_that_differs_from_its_directory() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "core/agents/no-block.md", "# no frontmatter\n");
    write(
        dir.path(),
        "core/agents/no-desc.md",
        "---\nname: no-desc\n---\n",
    );
    write(
        dir.path(),
        "core/skills/dir-name/SKILL.md",
        &agent("other-name", ""),
    );
    let report = audit_dir(dir.path());
    let messages: Vec<_> = report
        .findings
        .iter()
        .filter(|f| f.code == "H009")
        .map(|f| f.message.as_str())
        .collect();
    assert_eq!(messages.len(), 3, "{messages:?}");
    assert!(messages.iter().any(|m| m.contains("no closed")));
    assert!(messages.iter().any(|m| m.contains("missing `description`")));
    assert!(messages
        .iter()
        .any(|m| m.contains("differs from its directory")));
}

#[test]
fn findings_come_out_sorted_and_the_json_shape_is_stable() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "core/agents/b.md", "# none\n");
    write(dir.path(), "core/agents/a.md", "# none\n");
    let report = audit_dir(dir.path());
    let paths: Vec<_> = report.findings.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(paths, ["core/agents/a.md", "core/agents/b.md"]);
    let json: serde_json::Value = serde_json::to_value(&report).unwrap();
    assert_eq!(json["schema_version"], 1);
    assert_eq!(json["errors"], 2);
    assert_eq!(json["findings"][0]["code"], "H009");
    assert_eq!(json["findings"][0]["severity"], "error");
    assert!(codes(&report).iter().all(|code| code.starts_with('H')));
}

#[test]
fn an_unreadable_root_is_an_error_not_an_empty_report() {
    assert!(super::audit_project(Path::new("/definitely/not/here")).is_err());
}
