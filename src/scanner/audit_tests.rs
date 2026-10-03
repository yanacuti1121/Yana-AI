//! Behavior tests for the scanner's scoring, analytics and audit pipeline
//! (`run_audit`, `run_check`, `build_analytics`, `compute_risk_level`).
//!
//! Scoring is asserted through relationships (an INFO finding never lowers the
//! score, one rule is charged once, a critical outweighs a low) rather than by
//! freezing the current cost table, so re-tuning the costs does not break them.

use super::{build_analytics, compute_risk_level, run_audit, run_check, severity_cost, severity_order, Finding};
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tempfile::{tempdir, TempDir};

/// Cap `build_analytics` applies to the top-rules list.
const TOP_RULES_CAP: usize = 10;

fn finding(id: &str, severity: &str, category: &str, file: &str) -> Finding {
    Finding {
        id: id.into(),
        severity: severity.into(),
        category: category.into(),
        file: file.into(),
        line: Some(1),
        rule: String::new(),
        reason: String::new(),
        message: String::new(),
        fix: String::new(),
        confidence: "HIGH".into(),
        matched_value: String::new(),
        description: String::new(),
    }
}

fn write(dir: &Path, rel: &str, body: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

/// One `*.py` rule set with a check per (id, severity, pattern).
fn rules_yaml(scope: &str, checks: &[(&str, &str, &str)]) -> String {
    let mut y = format!("scope: {scope}\nfile_patterns: ['**/*.py']\nchecks:\n");
    for (id, sev, pat) in checks {
        y.push_str(&format!(
            "  - id: {id}\n    severity: {sev}\n    reason: r-{id}\n    fix: f-{id}\n    match:\n      pattern: '{pat}'\n"
        ));
    }
    y
}

/// (target dir, scanner-rules dir) with the given files and one rules file.
fn fixture(files: &[(&str, &str)], rules: &str) -> (TempDir, TempDir) {
    let target = tempdir().unwrap();
    let scanners = tempdir().unwrap();
    for (rel, body) in files {
        write(target.path(), rel, body);
    }
    write(scanners.path(), "r.yml", rules);
    (target, scanners)
}

fn audit(t: &TempDir, s: &TempDir) -> super::ScanReport {
    run_audit(t.path().to_str().unwrap(), s.path().to_str().unwrap(), None, &[], None, false)
}

// ── compute_risk_level / severity helpers ────────────────────────────────────

#[test]
fn risk_level_boundaries() {
    let cases = [
        (100, "LOW"), (90, "LOW"), (89, "MEDIUM"), (70, "MEDIUM"),
        (69, "HIGH"), (40, "HIGH"), (39, "CRITICAL"), (0, "CRITICAL"),
    ];
    for (score, level) in cases {
        assert_eq!(compute_risk_level(score), level, "score {score}");
    }
}

#[test]
fn severity_cost_grows_with_severity_and_unknown_is_free() {
    assert!(severity_cost("CRITICAL") > severity_cost("HIGH"));
    assert!(severity_cost("HIGH") > severity_cost("MEDIUM"));
    assert!(severity_cost("MEDIUM") > severity_cost("LOW"));
    assert!(severity_cost("LOW") > severity_cost("INFO"));
    assert_eq!(severity_cost("INFO"), 0);
    assert_eq!(severity_cost("not-a-severity"), 0);
}

#[test]
fn severity_order_ranks_critical_first_and_unknown_last() {
    let ranked = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
    for pair in ranked.windows(2) {
        assert!(severity_order(pair[0]) < severity_order(pair[1]), "{pair:?}");
    }
    assert_eq!(severity_order("weird"), severity_order("INFO"));
}

// ── build_analytics ──────────────────────────────────────────────────────────

#[test]
fn analytics_counts_categories_and_files_with_findings() {
    let fs_ = vec![
        finding("A", "HIGH", "code", "a.py"),
        finding("B", "LOW", "code", "a.py"),
        finding("C", "MEDIUM", "config", "b.json"),
    ];
    let a = build_analytics(&fs_, 4);
    assert_eq!(a.by_category["code"], 2);
    assert_eq!(a.by_category["config"], 1);
    assert_eq!(a.files_with_findings, 2);
    assert_eq!(a.files_clean, 2);
    assert!((a.hit_rate_pct - 50.0).abs() < f64::EPSILON);
}

#[test]
fn analytics_info_only_files_are_not_files_with_findings() {
    let a = build_analytics(&[finding("I", "INFO", "code", "a.py")], 1);
    assert_eq!(a.files_with_findings, 0);
    assert_eq!(a.files_clean, 1);
}

#[test]
fn analytics_with_no_scanned_files_does_not_divide_by_zero_or_underflow() {
    let a = build_analytics(&[finding("A", "HIGH", "code", "a.py"), finding("B", "HIGH", "code", "b.py")], 0);
    assert_eq!(a.files_clean, 0);
    assert_eq!(a.hit_rate_pct, 0.0);
}

#[test]
fn analytics_hit_rate_is_rounded_to_one_decimal() {
    let a = build_analytics(&[finding("A", "HIGH", "code", "a.py")], 3);
    assert!((a.hit_rate_pct - 33.3).abs() < f64::EPSILON);
}

#[test]
fn analytics_top_rules_sort_by_severity_then_count_and_are_capped() {
    let mut fs_ = vec![finding("LOWMANY", "LOW", "c", "a")];
    fs_.extend((0..5).map(|i| finding("LOWMANY", "LOW", "c", &format!("f{i}"))));
    fs_.push(finding("CRIT", "CRITICAL", "c", "a"));
    fs_.push(finding("HIGHONE", "HIGH", "c", "a"));
    fs_.extend((0..2).map(|i| finding("HIGHTWO", "HIGH", "c", &format!("g{i}"))));
    let a = build_analytics(&fs_, 10);
    let order: Vec<&str> = a.top_rules.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(order, vec!["CRIT", "HIGHTWO", "HIGHONE", "LOWMANY"]);
    assert_eq!(a.top_rules[3].count, 6);

    let many: Vec<Finding> = (0..TOP_RULES_CAP + 5)
        .map(|i| finding(&format!("R{i}"), "LOW", "c", "a"))
        .collect();
    assert_eq!(build_analytics(&many, 1).top_rules.len(), TOP_RULES_CAP);
}

// ── run_check ────────────────────────────────────────────────────────────────

#[test]
fn run_check_fills_defaults_for_a_minimal_check() {
    let out = run_check("x", &json!({"match": {"pattern": "x"}}), "code", "a.py", ".");
    assert_eq!(out.len(), 1);
    let f = &out[0];
    assert_eq!((f.id.as_str(), f.severity.as_str()), ("UNKNOWN", "INFO"));
    assert_eq!(f.category, "code");
    assert_eq!(f.rule, "code/unknown");
    assert_eq!(f.confidence, "HIGH");
    assert_eq!(f.message, "UNKNOWN");
    assert_eq!(f.line, Some(1));
}

#[test]
fn run_check_message_prefers_message_then_reason_then_id() {
    let base = |extra: serde_json::Value| {
        let mut c = json!({"id": "R1", "match": {"pattern": "x"}});
        c.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        run_check("x", &c, "s", "a.py", ".")[0].message.clone()
    };
    assert_eq!(base(json!({"message": "m", "reason": "r"})), "m");
    assert_eq!(base(json!({"reason": "r"})), "r");
    assert_eq!(base(json!({})), "R1");
}

#[test]
fn run_check_routes_json_type_to_the_json_engine() {
    let check = json!({"id": "J", "severity": "HIGH",
                       "match": {"type": "json", "path": "$.a", "condition": "missing"}});
    let out = run_check("{}", &check, "config", "s.json", ".");
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].line, None);
}

#[test]
fn run_check_target_only_applies_to_the_named_file() {
    let check = json!({"id": "T", "target": "./cfg/settings.json", "match": {"pattern": "x"}});
    assert!(run_check("x", &check, "s", "other.json", ".").is_empty());
    assert_eq!(run_check("x", &check, "s", "cfg/settings.json", ".").len(), 1);
    assert_eq!(run_check("x", &check, "s", "sub/cfg/settings.json", ".").len(), 1);
}

// ── run_audit: end to end on a temp tree ─────────────────────────────────────

#[test]
fn audit_of_a_clean_tree_is_clean_with_full_score() {
    let (t, s) = fixture(&[("a.py", "print('hi')\n")], &rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]));
    let r = audit(&t, &s);
    assert_eq!((r.status.as_str(), r.score, r.risk_level.as_str()), ("clean", 100, "LOW"));
    assert_eq!(r.summary.total, 0);
    assert_eq!(r.scan_stats.files_scanned, 1);
}

#[test]
fn audit_reports_findings_with_relative_paths_and_lowers_the_score() {
    let (t, s) = fixture(&[("pkg/a.py", "x = 1\ny = eval(z)\n")], &rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]));
    let r = audit(&t, &s);
    assert_eq!(r.status, "findings");
    assert_eq!(r.findings.len(), 1);
    assert_eq!(r.findings[0].file, "pkg/a.py");
    assert_eq!(r.findings[0].line, Some(2));
    assert_eq!(r.summary.high, 1);
    assert_eq!(r.score, 100 - severity_cost("HIGH"));
}

#[test]
fn audit_charges_each_rule_once_however_many_hits() {
    let one = "eval(a)\n";
    let many = "eval(a)\neval(b)\neval(c)\n";
    let rules = rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]);
    let (t1, s1) = fixture(&[("a.py", one)], &rules);
    let (t2, s2) = fixture(&[("a.py", many), ("b.py", many)], &rules);
    let (r1, r2) = (audit(&t1, &s1), audit(&t2, &s2));
    assert_eq!(r1.score, r2.score);
    assert_eq!(r2.summary.total, 6);
}

#[test]
fn audit_info_findings_do_not_change_score_or_status() {
    let (t, s) = fixture(&[("a.py", "TODO here\n")], &rules_yaml("code", &[("NOTE1", "INFO", "TODO")]));
    let r = audit(&t, &s);
    assert_eq!(r.status, "clean");
    assert_eq!(r.score, 100);
    assert_eq!(r.summary.info, 1);
}

#[test]
fn audit_score_never_drops_below_zero() {
    let checks = [("C1", "CRITICAL", "aaa"), ("C2", "CRITICAL", "bbb"), ("C3", "CRITICAL", "ccc"), ("C4", "CRITICAL", "ddd")];
    let (t, s) = fixture(&[("a.py", "aaa bbb ccc ddd\n")], &rules_yaml("code", &checks));
    let r = audit(&t, &s);
    assert_eq!(r.score, 0);
    assert_eq!(r.risk_level, "CRITICAL");
}

#[test]
fn audit_findings_are_sorted_most_severe_first() {
    let checks = [("L1", "LOW", "low"), ("C1", "CRITICAL", "crit"), ("H1", "HIGH", "high")];
    let (t, s) = fixture(&[("a.py", "low\nhigh\ncrit\n")], &rules_yaml("code", &checks));
    let sev: Vec<String> = audit(&t, &s).findings.into_iter().map(|f| f.severity).collect();
    assert_eq!(sev, vec!["CRITICAL", "HIGH", "LOW"]);
}

#[test]
fn audit_ignore_ids_removes_findings_and_their_score_cost() {
    let (t, s) = fixture(&[("a.py", "eval(x)\n")], &rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]));
    let r = run_audit(t.path().to_str().unwrap(), s.path().to_str().unwrap(), None, &["EVAL1".to_string()], None, false);
    assert!(r.findings.is_empty());
    assert_eq!((r.status.as_str(), r.score), ("clean", 100));
}

#[test]
fn audit_diff_files_limits_the_scan_and_counts_skips() {
    let rules = rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]);
    let (t, s) = fixture(&[("a.py", "eval(x)\n"), ("b.py", "eval(y)\n")], &rules);
    let only_a: HashSet<String> = ["a.py".to_string()].into_iter().collect();
    let r = run_audit(t.path().to_str().unwrap(), s.path().to_str().unwrap(), Some(&only_a), &[], None, false);
    assert_eq!(r.findings.len(), 1);
    assert_eq!(r.findings[0].file, "a.py");
    assert_eq!(r.scan_stats.files_skipped, 1);
}

#[test]
fn audit_honours_the_yana_aiignore_file() {
    let rules = rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]);
    let (t, s) = fixture(&[("a.py", "eval(x)\n"), ("b.py", "eval(y)\n"), (".yana-aiignore", "b.py  # skip\n")], &rules);
    let r = audit(&t, &s);
    assert_eq!(r.findings.len(), 1);
    assert_eq!(r.findings[0].file, "a.py");
    assert_eq!(r.scan_stats.files_ignored, 1);
}

#[test]
fn audit_only_category_runs_just_that_rule_set() {
    let (t, s) = fixture(&[("a.py", "eval(x)\nsecret\n")], &rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]));
    write(s.path(), "other.yml", &rules_yaml("secrets", &[("SEC1", "HIGH", "secret")]));
    let r = run_audit(t.path().to_str().unwrap(), s.path().to_str().unwrap(), None, &[], Some("secrets"), false);
    let ids: Vec<&str> = r.findings.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(ids, vec!["SEC1"]);
}

#[test]
fn audit_include_skills_adds_the_extra_patterns_only_when_asked() {
    let yaml = "scope: code\nfile_patterns: ['src/**/*.py']\nfile_patterns_extra: ['skills/**/*.py']\n\
                checks:\n  - id: EVAL1\n    severity: HIGH\n    match:\n      pattern: 'eval\\('\n";
    let (t, s) = fixture(&[("skills/x.py", "eval(x)\n")], yaml);
    let (tp, sp) = (t.path().to_str().unwrap(), s.path().to_str().unwrap());
    assert!(run_audit(tp, sp, None, &[], None, false).findings.is_empty());
    assert_eq!(run_audit(tp, sp, None, &[], None, true).findings.len(), 1);
}

#[test]
fn audit_check_with_a_target_scans_that_file_and_missing_targets_are_ignored() {
    let yaml = [
        "scope: config",
        "checks:",
        "  - id: T1",
        "    severity: HIGH",
        "    target: settings.json",
        "    match:",
        "      type: json",
        "      path: $.a",
        "      condition: missing",
        "",
    ]
    .join("\n");
    let (t, s) = fixture(&[("settings.json", "{}")], &yaml);
    let r = audit(&t, &s);
    assert_eq!(r.findings.len(), 1);
    assert_eq!(r.findings[0].file, "settings.json");

    let (t2, s2) = fixture(&[("other.json", "{}")], &yaml);
    assert!(audit(&t2, &s2).findings.is_empty());
}

#[cfg(unix)]
#[test]
fn audit_reports_unreadable_files_as_info_instead_of_failing() {
    use std::os::unix::fs::PermissionsExt;
    let (t, s) = fixture(&[("a.py", "eval(x)\n")], &rules_yaml("code", &[("EVAL1", "HIGH", r"eval\(")]));
    let path = t.path().join("a.py");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    let readable_anyway = fs::read(&path).is_ok(); // running as root
    let r = audit(&t, &s);
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    if readable_anyway {
        return;
    }
    assert!(r.findings.iter().any(|f| f.id == "SCAN_SKIP" && f.severity == "INFO"));
    assert_eq!(r.status, "clean");
}
