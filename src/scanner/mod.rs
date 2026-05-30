pub mod mod_types;
mod rules;
mod matchers;
pub mod files;
pub mod render;

pub use mod_types::*;

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Instant;
use chrono::Utc;

const SEVERITY_COST: &[(&str, u32)] = &[
    ("CRITICAL", 30), ("HIGH", 20), ("MEDIUM", 10), ("LOW", 3), ("INFO", 0),
];

fn severity_cost(sev: &str) -> u32 {
    SEVERITY_COST.iter().find(|(s, _)| *s == sev).map(|(_, c)| *c).unwrap_or(0)
}

fn severity_order(sev: &str) -> usize {
    match sev { "CRITICAL" => 0, "HIGH" => 1, "MEDIUM" => 2, "LOW" => 3, _ => 4 }
}

pub fn compute_risk_level(score: u32) -> &'static str {
    if score >= 90 { "LOW" } else if score >= 70 { "MEDIUM" } else if score >= 40 { "HIGH" } else { "CRITICAL" }
}

fn build_analytics(findings: &[Finding], files_scanned: usize) -> Analytics {
    let mut by_category: HashMap<String, usize> = HashMap::new();
    let mut rule_counts: HashMap<String, (String, String, usize)> = HashMap::new();
    for f in findings {
        *by_category.entry(f.category.clone()).or_insert(0) += 1;
        let entry = rule_counts.entry(f.id.clone()).or_insert((f.severity.clone(), f.category.clone(), 0));
        entry.2 += 1;
    }
    let mut top_rules: Vec<TopRule> = rule_counts.into_iter()
        .map(|(id, (severity, category, count))| TopRule { id, severity, count, category })
        .collect();
    top_rules.sort_by_key(|r| (severity_order(&r.severity), std::cmp::Reverse(r.count)));
    top_rules.truncate(10);

    let files_with_findings = findings.iter()
        .filter(|f| f.severity != "INFO")
        .map(|f| &f.file).collect::<HashSet<_>>().len();
    let files_clean = files_scanned.saturating_sub(files_with_findings);
    let hit_rate = if files_scanned > 0 {
        (files_with_findings as f64 / files_scanned as f64 * 100.0 * 10.0).round() / 10.0
    } else { 0.0 };

    Analytics { by_category, top_rules, files_with_findings, files_clean, hit_rate_pct: hit_rate }
}

pub fn run_audit(
    target: &str,
    scanner_dir: &str,
    diff_files: Option<&HashSet<String>>,
    ignore_ids: &[String],
    only_category: Option<&str>,
) -> ScanReport {
    let start = Instant::now();
    let rule_sets = rules::load_scanner_rules(scanner_dir);
    let ignore_patterns = files::load_yamtamignore(target);

    if rule_sets.is_empty() {
        eprintln!("[error] No scanner rules found in {scanner_dir}");
        std::process::exit(3);
    }

    // Canonicalize target so strip_prefix works correctly against absolute paths
    // returned by resolve_files() (which calls canonicalize internally).
    let canon_target = std::fs::canonicalize(target)
        .unwrap_or_else(|_| Path::new(target).to_path_buf());

    let mut all_findings: Vec<Finding> = Vec::new();
    let mut files_scanned: HashSet<String> = HashSet::new();
    let mut files_skipped = 0usize;
    let mut files_ignored = 0usize;
    let mut checks_applied = 0usize;

    for rule_set in &rule_sets {
        if let Some(cat) = only_category {
            if rule_set.scope != cat { continue; }
        }

        // Handle per-check target overrides
        for check in &rule_set.checks {
            let specific_target = check.get("target").and_then(|v| v.as_str()).unwrap_or("");
            if specific_target.is_empty() { continue; }
            let clean = specific_target.trim_start_matches("./").trim_start_matches('/');
            let explicit_path = canon_target.join(clean);
            if !explicit_path.is_file() { continue; }
            let rel = explicit_path.strip_prefix(&canon_target).unwrap_or(&explicit_path)
                .to_string_lossy().to_string();
            if let Some(df) = diff_files { if !df.contains(&rel) { files_skipped += 1; continue; } }
            if files::is_ignored(&rel, &ignore_patterns) { files_ignored += 1; continue; }
            let content = match files::read_file_safe(&explicit_path) {
                Some(c) => c, None => continue,
            };
            let hits = run_check(&content, check, &rule_set.scope, &rel, target);
            all_findings.extend(hits);
            files_scanned.insert(rel);
            checks_applied += 1;
        }

        if !rule_set.file_patterns.is_empty() {
            // resolve_files uses Rust's glob crate for exclusion, but that crate's `**` requires
            // at least one path component — it won't exclude files directly under a dir.
            // Re-apply the rule's exclude_patterns via is_ignored() which uses regex-based
            // glob_match where `**` → `.*`, correctly matching direct children too.
            let target_files = files::resolve_files(target, &rule_set.file_patterns, &[]);
            for fp in target_files {
                let rel = fp.strip_prefix(&canon_target).unwrap_or(&fp).to_string_lossy().to_string();
                if let Some(df) = diff_files { if !df.contains(&rel) { files_skipped += 1; continue; } }
                if files::is_ignored(&rel, &ignore_patterns) { files_ignored += 1; continue; }
                if files::is_ignored(&rel, &rule_set.exclude_patterns) { files_ignored += 1; continue; }
                let content = match files::read_file_safe(&fp) {
                    Some(c) => c,
                    None => {
                        all_findings.push(Finding {
                            id: "SCAN_SKIP".into(), severity: "INFO".into(),
                            category: rule_set.scope.clone(), file: rel.clone(),
                            line: None, rule: "scanner/file-unreadable".into(),
                            reason: "File could not be read (permissions or encoding)".into(),
                            message: "File could not be read".into(),
                            fix: "Check file permissions.".into(),
                            confidence: "HIGH".into(), matched_value: String::new(), description: String::new(),
                        });
                        continue;
                    }
                };
                for check in &rule_set.checks {
                    // Skip checks with specific target (handled above)
                    if check.get("target").and_then(|v| v.as_str()).is_some() { continue; }
                    all_findings.extend(run_check(&content, check, &rule_set.scope, &rel, target));
                }
                files_scanned.insert(rel);
                checks_applied += rule_set.checks.len();
            }
        }
    }

    // Filter ignored IDs
    all_findings.retain(|f| !ignore_ids.contains(&f.id));

    // Deduplicate (same id + file + line)
    let mut seen: HashSet<(String, String, Option<u32>)> = HashSet::new();
    all_findings.retain(|f| seen.insert((f.id.clone(), f.file.clone(), f.line)));

    // Score
    let mut scored_rules: HashSet<String> = HashSet::new();
    let mut score: i32 = 100;
    for f in &all_findings {
        if f.severity != "INFO" && !scored_rules.contains(&f.id) {
            score -= severity_cost(&f.severity) as i32;
            scored_rules.insert(f.id.clone());
        }
    }
    let score = score.max(0) as u32;

    // Summary
    let mut summary = SummaryCount { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for f in &all_findings {
        summary.total += 1;
        match f.severity.as_str() {
            "CRITICAL" => summary.critical += 1, "HIGH"   => summary.high += 1,
            "MEDIUM"   => summary.medium += 1,   "LOW"    => summary.low += 1,
            _          => summary.info += 1,
        }
    }

    // Sort by severity
    all_findings.sort_by_key(|f| severity_order(&f.severity));

    let files_scanned_count = files_scanned.len();
    let analytics = build_analytics(&all_findings, files_scanned_count);
    let status = if all_findings.iter().any(|f| f.severity != "INFO") { "findings" } else { "clean" };

    ScanReport {
        schema_version: "0.1.0".into(),
        generated_at: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        target: target.to_string(),
        yamtam_version: "0.16.0".into(),
        score,
        risk_level: compute_risk_level(score).to_string(),
        status: status.to_string(),
        summary,
        scan_stats: ScanStats {
            files_scanned: files_scanned_count,
            files_skipped,
            files_ignored,
            scanners_run: rule_sets.len(),
            checks_applied,
            duration_ms: start.elapsed().as_millis() as u64,
        },
        analytics,
        findings: all_findings,
    }
}

fn run_check(content: &str, check: &serde_json::Value, scope: &str, rel: &str, target: &str) -> Vec<Finding> {
    // Check specific target
    if let Some(specific) = check.get("target").and_then(|v| v.as_str()) {
        let clean = specific.trim_start_matches("./").trim_start_matches('/');
        if rel != clean && !rel.ends_with(clean) { return vec![]; }
    }

    let match_block = check.get("match").filter(|v| v.is_object());
    let match_type = match_block
        .and_then(|m| m.get("type")).and_then(|t| t.as_str())
        .unwrap_or("regex");

    let hits = match match_type {
        "json"  => matchers::run_json_match(content, check),
        _       => matchers::run_regex_match(content, check),
    };

    let id       = check.get("id").and_then(|v| v.as_str()).unwrap_or("UNKNOWN");
    let severity = check.get("severity").and_then(|v| v.as_str()).unwrap_or("INFO");
    let reason   = check.get("reason").and_then(|v| v.as_str()).unwrap_or("");
    let fix      = check.get("fix").and_then(|v| v.as_str()).unwrap_or("");
    let desc     = check.get("description").and_then(|v| v.as_str()).unwrap_or("");
    let msg      = check.get("message").and_then(|v| v.as_str())
        .or_else(|| check.get("reason").and_then(|v| v.as_str()))
        .unwrap_or(id);

    hits.into_iter().map(|h| Finding {
        id: id.to_string(), severity: severity.to_string(), category: scope.to_string(),
        file: rel.to_string(), line: h.line,
        rule: format!("{scope}/{}", id.to_lowercase()),
        reason: reason.to_string(), message: msg.to_string(), fix: fix.to_string(),
        confidence: "HIGH".to_string(), matched_value: h.matched_value,
        description: desc.to_string(),
    }).collect()
}

pub use files::get_diff_files;
