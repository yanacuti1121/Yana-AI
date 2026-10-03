//! Behavior tests for the scanner report renderers (console, markdown, SARIF)
//! and the JSON output: what a reader (or a CI tool parsing SARIF/JSON) can
//! rely on, not the exact wording of every line.

use super::mod_types::*;
use super::render::{build_json_output, render_console, render_markdown, render_sarif};
use serde_json::Value;
use std::collections::HashMap;

/// Console truncation limits for the description and the fix hint.
const DESC_CAP: usize = 80;
const FIX_CAP: usize = 100;
const ESC: char = '\x1b';

fn finding(id: &str, sev: &str, file: &str, line: Option<u32>) -> Finding {
    Finding {
        id: id.into(), severity: sev.into(), category: "code".into(), file: file.into(), line,
        rule: format!("code/{}", id.to_lowercase()), reason: format!("reason-{id}"),
        message: String::new(), fix: format!("fix-{id}"), confidence: "HIGH".into(),
        matched_value: String::new(), description: String::new(),
    }
}

fn report(risk: &str, findings: Vec<Finding>) -> ScanReport {
    let count = |s: &str| findings.iter().filter(|f| f.severity == s).count();
    let summary = SummaryCount {
        total: findings.len(), critical: count("CRITICAL"), high: count("HIGH"),
        medium: count("MEDIUM"), low: count("LOW"), info: count("INFO"),
    };
    ScanReport {
        schema_version: "0.1.0".into(), generated_at: "2026-01-01T00:00:00Z".into(),
        target: "/repo".into(), yana_ai_version: "9.9.9".into(), score: 77, risk_level: risk.into(),
        status: "findings".into(), summary,
        scan_stats: ScanStats { files_scanned: 5, files_skipped: 0, files_ignored: 0, scanners_run: 2, checks_applied: 9, duration_ms: 1 },
        analytics: Analytics { by_category: HashMap::new(), top_rules: vec![], files_with_findings: 0, files_clean: 5, hit_rate_pct: 0.0 },
        findings,
    }
}

// ── console ──────────────────────────────────────────────────────────────────

#[test]
fn console_quiet_is_a_single_plain_line_with_score_risk_and_counts() {
    let r = report("HIGH", vec![finding("A", "HIGH", "a.py", Some(3))]);
    for no_color in [true, false] {
        let out = render_console(&r, no_color, true);
        assert_eq!(out.lines().count(), 1);
        assert!(out.contains("Score: 77/100") && out.contains("Risk: HIGH") && out.contains("1 findings"));
        assert!(!out.contains(ESC));
    }
}

#[test]
fn console_no_color_has_no_escape_codes_and_color_mode_does() {
    let r = report("CRITICAL", vec![finding("A", "CRITICAL", "a.py", Some(1))]);
    assert!(!render_console(&r, true, false).contains(ESC));
    assert!(render_console(&r, false, false).contains(ESC));
}

#[test]
fn console_only_info_findings_reads_as_no_significant_findings() {
    let out = render_console(&report("LOW", vec![finding("I", "INFO", "a.py", None)]), true, false);
    assert!(out.contains("No significant findings"));
    assert!(!out.contains("[INFO"));
}

#[test]
fn console_lists_severity_id_and_file_with_line_when_known() {
    let r = report("HIGH", vec![finding("EVAL1", "HIGH", "pkg/a.py", Some(7)), finding("CFG1", "LOW", "b.json", None)]);
    let out = render_console(&r, true, false);
    assert!(out.contains("[HIGH    ] EVAL1  pkg/a.py:7"));
    assert!(out.contains("[LOW     ] CFG1  b.json"));
    assert!(!out.contains("b.json:"));
}

#[test]
fn console_prefers_description_and_falls_back_to_reason() {
    let mut with_desc = finding("D1", "HIGH", "a.py", None);
    with_desc.description = "long description".into();
    let out = render_console(&report("HIGH", vec![with_desc, finding("R1", "HIGH", "b.py", None)]), true, false);
    assert!(out.contains("long description"));
    assert!(out.contains("reason-R1"));
    assert!(!out.contains("reason-D1"));
}

#[test]
fn console_truncates_long_text_on_char_boundaries_without_panicking() {
    let mut f = finding("U1", "HIGH", "a.py", None);
    f.description = "é".repeat(DESC_CAP + 40);
    f.fix = "🔥".repeat(FIX_CAP + 40);
    let out = render_console(&report("HIGH", vec![f]), true, false);
    assert!(out.contains(&"é".repeat(DESC_CAP)));
    assert!(!out.contains(&"é".repeat(DESC_CAP + 1)));
    assert!(!out.contains(&"🔥".repeat(FIX_CAP + 1)));
}

#[test]
fn console_omits_the_fix_line_when_there_is_no_fix() {
    let mut f = finding("N1", "HIGH", "a.py", None);
    f.fix = String::new();
    assert!(!render_console(&report("HIGH", vec![f]), true, false).contains("Fix:"));
}

#[test]
fn console_summary_names_only_nonzero_severities() {
    let r = report("HIGH", vec![finding("A", "HIGH", "a", None), finding("B", "LOW", "b", None)]);
    let out = render_console(&r, true, false);
    let summary = out.lines().find(|l| l.contains("Summary:")).unwrap();
    assert!(summary.contains("1 high") && summary.contains("1 low"));
    assert!(!summary.contains("critical") && !summary.contains("medium"));
}

#[test]
fn console_top_finding_line_needs_more_than_one_occurrence() {
    let mut r = report("HIGH", vec![finding("A", "HIGH", "a", None)]);
    r.analytics.top_rules = vec![TopRule { id: "A".into(), severity: "HIGH".into(), count: 1, category: "code".into() }];
    assert!(!render_console(&r, true, false).contains("Top finding"));
    r.analytics.top_rules[0].count = 3;
    assert!(render_console(&r, true, false).contains("Top finding: A"));
}

// ── markdown ─────────────────────────────────────────────────────────────────

#[test]
fn markdown_without_significant_findings_says_so_and_skips_info() {
    let md = render_markdown(&report("LOW", vec![finding("I", "INFO", "a.py", None)]));
    assert!(md.contains("No significant findings."));
    assert!(!md.contains("#### I"));
}

#[test]
fn markdown_groups_findings_under_severity_headings_in_order() {
    let r = report("HIGH", vec![
        finding("L1", "LOW", "l.py", None), finding("C1", "CRITICAL", "c.py", None), finding("H1", "HIGH", "h.py", None),
    ]);
    let md = render_markdown(&r);
    let pos = |needle: &str| md.find(needle).unwrap_or_else(|| panic!("missing {needle}"));
    assert!(pos("### Critical") < pos("#### C1"));
    assert!(pos("#### C1") < pos("### High"));
    assert!(pos("### High") < pos("#### H1"));
    assert!(pos("#### H1") < pos("### Low"));
    assert!(!md.contains("### Medium"));
}

#[test]
fn markdown_formats_file_with_and_without_a_line() {
    let md = render_markdown(&report("HIGH", vec![finding("A", "HIGH", "a.py", Some(9)), finding("B", "HIGH", "b.py", None)]));
    assert!(md.contains("`a.py`:9"));
    assert!(md.contains("| **File** | `b.py` |"));
}

#[test]
fn markdown_risk_note_and_next_steps_follow_the_risk_level() {
    for (level, urgent) in [("CRITICAL", true), ("HIGH", true), ("MEDIUM", false), ("LOW", false), ("weird", false)] {
        let md = render_markdown(&report(level, vec![]));
        assert_eq!(md.contains("Fix all CRITICAL and HIGH findings"), urgent, "{level}");
        assert_eq!(md.contains("Review MEDIUM findings"), !urgent, "{level}");
    }
    assert!(render_markdown(&report("MEDIUM", vec![])).contains("> **MEDIUM**"));
    assert!(render_markdown(&report("weird", vec![])).contains("> **LOW**"));
}

// ── SARIF ────────────────────────────────────────────────────────────────────

fn sarif(r: &ScanReport) -> Value {
    serde_json::from_str(&render_sarif(r)).expect("render_sarif must emit valid JSON")
}

#[test]
fn sarif_declares_version_and_tool_and_carries_score() {
    let v = sarif(&report("HIGH", vec![]));
    assert_eq!(v["version"], "2.1.0");
    assert_eq!(v["runs"][0]["tool"]["driver"]["name"], "yana-ai");
    assert_eq!(v["runs"][0]["tool"]["driver"]["version"], "9.9.9");
    assert_eq!(v["runs"][0]["properties"]["score"], 77);
    assert!(v["runs"][0]["results"].as_array().unwrap().is_empty());
}

#[test]
fn sarif_maps_severity_to_level() {
    let sevs = [("CRITICAL", "error"), ("HIGH", "error"), ("MEDIUM", "warning"), ("LOW", "note"), ("INFO", "none"), ("WEIRD", "warning")];
    let findings = sevs.iter().enumerate().map(|(i, (s, _))| finding(&format!("F{i}"), s, "a.py", None)).collect();
    let v = sarif(&report("HIGH", findings));
    for (i, (_, level)) in sevs.iter().enumerate() {
        assert_eq!(v["runs"][0]["results"][i]["level"], *level, "{}", sevs[i].0);
    }
}

#[test]
fn sarif_rule_index_points_at_the_matching_rule_and_rules_are_unique() {
    let r = report("HIGH", vec![
        finding("R1", "HIGH", "a.py", Some(1)), finding("R2", "LOW", "b.py", Some(2)), finding("R1", "HIGH", "c.py", Some(3)),
    ]);
    let v = sarif(&r);
    let rules = v["runs"][0]["tool"]["driver"]["rules"].as_array().unwrap();
    assert_eq!(rules.len(), 2);
    for res in v["runs"][0]["results"].as_array().unwrap() {
        let idx = res["ruleIndex"].as_u64().unwrap() as usize;
        assert_eq!(rules[idx]["id"], res["ruleId"]);
    }
}

#[test]
fn sarif_location_has_region_only_with_a_line_and_normalizes_backslashes() {
    let v = sarif(&report("HIGH", vec![finding("A", "HIGH", "dir\\a.py", Some(4)), finding("B", "HIGH", "b.py", None)]));
    let res = &v["runs"][0]["results"];
    assert_eq!(res[0]["locations"][0]["physicalLocation"]["artifactLocation"]["uri"], "dir/a.py");
    assert_eq!(res[0]["locations"][0]["physicalLocation"]["region"]["startLine"], 4);
    assert!(res[1]["locations"][0]["physicalLocation"].get("region").is_none());
}

// ── build_json_output ────────────────────────────────────────────────────────

#[test]
fn json_output_uses_the_target_and_status_arguments() {
    let v = build_json_output(&report("HIGH", vec![]), "/other", 2, "findings");
    assert_eq!(v["target"], "/other");
    assert_eq!((v["status"].as_str(), v["exit_code"].as_i64()), (Some("findings"), Some(2)));
    assert_eq!(v["command"], "audit");
}

#[test]
fn json_output_lowercases_severity_and_falls_back_for_message() {
    let mut a = finding("A", "HIGH", "a.py", Some(2));
    a.message = "msg".into();
    let mut b = finding("B", "LOW", "b.py", None);
    b.message = String::new();
    let mut c = finding("C", "LOW", "c.py", None);
    c.message = String::new();
    c.reason = String::new();
    let v = build_json_output(&report("HIGH", vec![a, b, c]), "/r", 0, "findings");
    let f = &v["findings"];
    assert_eq!(f[0]["severity"], "high");
    assert_eq!((f[0]["message"].as_str(), f[1]["message"].as_str(), f[2]["message"].as_str()), (Some("msg"), Some("reason-B"), Some("C")));
}

#[test]
fn json_output_omits_optional_keys_when_empty() {
    let mut f = finding("A", "HIGH", "", None);
    f.category = String::new();
    f.fix = String::new();
    let v = build_json_output(&report("HIGH", vec![f]), "/r", 0, "findings");
    let item = v["findings"][0].as_object().unwrap();
    for key in ["file", "line", "rule", "fix"] {
        assert!(!item.contains_key(key), "{key} should be omitted");
    }
}

#[test]
fn json_output_summary_counts_findings_and_severities() {
    let v = build_json_output(&report("HIGH", vec![finding("A", "HIGH", "a", None), finding("B", "LOW", "b", None)]), "/r", 0, "findings");
    assert_eq!(v["summary"]["total_findings"], 2);
    assert_eq!(v["summary"]["by_severity"]["high"], 1);
    assert_eq!(v["summary"]["by_severity"]["low"], 1);
}
