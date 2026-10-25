//! Deterministic checks over an [`Inventory`]. No model, no network, no writes (I1, I6).
//!
//! Codes: H002 dead API, H003 reviewer agent holds write tools, H005 duplicate name,
//! H006 oversized skill, H007 mirror drift, H009 bad frontmatter. H001, H004 and H008 are
//! reserved: they were dropped from the design because a machine cannot judge them.

use super::inventory::{Entry, Inventory, Kind};
use serde::Serialize;
use std::collections::BTreeMap;

pub const SCHEMA_VERSION: u32 = 1;
/// A skill longer than this is flagged (the limit in `rule-consistency-policy.md`).
const MAX_SKILL_LINES: usize = 220;
/// Calls and flags of the removed experimental agent-teams API.
const DEAD_API: [&str; 3] = [
    "TeamCreate",
    "TeamDelete",
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
];
/// A line carrying this marker is exempt from H002 (a migration guide may name the old API).
const ALLOW_MARKER: &str = "harness-allow: H002";
/// Tools that let an agent change files.
const WRITE_TOOLS: [&str; 4] = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
/// Agents whose name ends like this are reviewers and must stay read-only (`subagent-policy.md`).
const REVIEWER_SUFFIXES: [&str; 2] = ["-auditor", "-reviewer"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize)]
pub struct Finding {
    pub code: &'static str,
    pub severity: Severity,
    pub path: String,
    pub line: Option<usize>,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct Report {
    pub schema_version: u32,
    pub agents: usize,
    pub skills: usize,
    pub skipped: Vec<(String, String)>,
    pub errors: usize,
    pub warnings: usize,
    pub findings: Vec<Finding>,
}

impl Report {
    /// 0 when clean or warnings only, 1 when any error was found.
    pub fn exit_code(&self) -> i32 {
        i32::from(self.errors > 0)
    }
}

fn finding(
    code: &'static str,
    severity: Severity,
    entry: &Entry,
    line: Option<usize>,
    message: String,
) -> Finding {
    Finding {
        code,
        severity,
        path: entry.path.clone(),
        line,
        message,
    }
}

fn dead_api(entry: &Entry, out: &mut Vec<Finding>) {
    for (index, line) in entry.text.lines().enumerate() {
        if line.contains(ALLOW_MARKER) {
            continue;
        }
        if let Some(api) = DEAD_API.iter().find(|api| line.contains(**api)) {
            out.push(finding(
                "H002",
                Severity::Error,
                entry,
                Some(index + 1),
                format!("mentions `{api}`, part of the removed agent-teams API"),
            ));
        }
    }
}

fn is_reviewer(entry: &Entry) -> bool {
    let name = entry.frontmatter.name.as_deref().unwrap_or("");
    entry.kind == Kind::Agent
        && REVIEWER_SUFFIXES
            .iter()
            .any(|suffix| name.ends_with(suffix))
}

fn reviewer_writes(entry: &Entry, out: &mut Vec<Finding>) {
    if !is_reviewer(entry) {
        return;
    }
    let held: Vec<&str> = entry
        .frontmatter
        .tools
        .iter()
        .map(String::as_str)
        .filter(|tool| WRITE_TOOLS.contains(tool))
        .collect();
    if !held.is_empty() {
        out.push(finding(
            "H003",
            Severity::Warning,
            entry,
            None,
            format!(
                "reviewer agent holds write tools ({}) although subagents are read-only by policy",
                held.join(", ")
            ),
        ));
    }
}

fn frontmatter(entry: &Entry, out: &mut Vec<Finding>) {
    let front = &entry.frontmatter;
    if !front.present {
        out.push(finding(
            "H009",
            Severity::Error,
            entry,
            None,
            "no closed `---` frontmatter block".into(),
        ));
        return;
    }
    for (field, value) in [("name", &front.name), ("description", &front.description)] {
        if value.is_none() {
            out.push(finding(
                "H009",
                Severity::Error,
                entry,
                None,
                format!("frontmatter is missing `{field}`"),
            ));
        }
    }
    if let (Some(name), Some(dir)) = (&front.name, &entry.dir_name) {
        // Vendored skills keep their source name under a prefix: `mattpocock--tdd` or
        // `scientific-db-pubmed-database` holding `name: tdd` / `name: pubmed-database` is the convention.
        if name != dir && !dir.ends_with(&format!("-{name}")) {
            out.push(finding(
                "H009",
                Severity::Error,
                entry,
                None,
                format!("skill name `{name}` differs from its directory `{dir}`"),
            ));
        }
    }
}

fn duplicates(inventory: &Inventory, out: &mut Vec<Finding>) {
    let mut seen: BTreeMap<(Kind, &str, &str), Vec<&Entry>> = BTreeMap::new();
    for entry in &inventory.entries {
        if let Some(name) = entry.frontmatter.name.as_deref() {
            seen.entry((entry.kind, entry.root, name))
                .or_default()
                .push(entry);
        }
    }
    for ((kind, _, name), group) in seen {
        if group.len() < 2 {
            continue;
        }
        let paths: Vec<&str> = group.iter().map(|entry| entry.path.as_str()).collect();
        // An agent name is the identifier a subagent is started by, so a clash is an error. Skills are
        // started by directory name; a repeated `name:` there only makes trigger matching ambiguous.
        let severity = if kind == Kind::Agent {
            Severity::Error
        } else {
            Severity::Warning
        };
        for entry in &group {
            out.push(finding(
                "H005",
                severity,
                entry,
                None,
                format!(
                    "{} name `{name}` is defined {} times: {}",
                    kind.label(),
                    group.len(),
                    paths.join(", ")
                ),
            ));
        }
    }
}

fn mirror_drift(inventory: &Inventory, out: &mut Vec<Finding>) {
    let mut by_rel: BTreeMap<(Kind, &str), Vec<&Entry>> = BTreeMap::new();
    for entry in &inventory.entries {
        by_rel
            .entry((entry.kind, entry.rel.as_str()))
            .or_default()
            .push(entry);
    }
    for ((kind, rel), group) in by_rel {
        let (Some(source), Some(mirror)) = (
            group.iter().find(|e| e.root == "core"),
            group.iter().find(|e| e.root == ".claude"),
        ) else {
            continue;
        };
        if source.sha256 != mirror.sha256 {
            out.push(finding(
                "H007",
                Severity::Warning,
                mirror,
                None,
                format!(
                    "{} `{rel}` differs from its source {}",
                    kind.label(),
                    source.path
                ),
            ));
        }
    }
}

pub fn run(inventory: &Inventory) -> Report {
    let mut findings = Vec::new();
    for entry in &inventory.entries {
        dead_api(entry, &mut findings);
        reviewer_writes(entry, &mut findings);
        frontmatter(entry, &mut findings);
        if entry.kind == Kind::Skill && entry.lines > MAX_SKILL_LINES {
            findings.push(finding(
                "H006",
                Severity::Warning,
                entry,
                None,
                format!("{} lines, limit {MAX_SKILL_LINES}", entry.lines),
            ));
        }
    }
    duplicates(inventory, &mut findings);
    mirror_drift(inventory, &mut findings);
    findings.sort_by(|a, b| (a.code, &a.path, a.line).cmp(&(b.code, &b.path, b.line)));
    let errors = findings
        .iter()
        .filter(|f| f.severity == Severity::Error)
        .count();
    Report {
        schema_version: SCHEMA_VERSION,
        agents: inventory
            .entries
            .iter()
            .filter(|e| e.kind == Kind::Agent)
            .count(),
        skills: inventory
            .entries
            .iter()
            .filter(|e| e.kind == Kind::Skill)
            .count(),
        skipped: inventory.skipped.clone(),
        errors,
        warnings: findings.len() - errors,
        findings,
    }
}
