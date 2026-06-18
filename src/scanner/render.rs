use super::mod_types::{ScanReport, Finding};
use std::collections::HashMap;

// ── ANSI helpers ──────────────────────────────────────────────────────────────

fn ansi(code: &str, text: &str, no_color: bool) -> String {
    if no_color { text.to_string() } else { format!("\x1b[{code}m{text}\x1b[0m") }
}

fn severity_code(sev: &str) -> &'static str {
    match sev {
        "CRITICAL" => "1;31", "HIGH" => "31",
        "MEDIUM"   => "33",   "LOW"  | "INFO" => "2",
        _          => "",
    }
}

fn risk_code(risk: &str) -> &'static str {
    match risk {
        "LOW"  => "32", "MEDIUM" => "33",
        "HIGH" | "CRITICAL" => "1;31", _ => "",
    }
}

// ── Console renderer ──────────────────────────────────────────────────────────

pub fn render_console(report: &ScanReport, no_color: bool, quiet: bool) -> String {
    let s = &report.summary;
    let risk  = &report.risk_level;
    let score = report.score;
    let stats = &report.scan_stats;
    let mut lines = Vec::new();

    if quiet {
        lines.push(format!(
            "Score: {}/100  |  Risk: {}  |  {} findings ({} critical · {} high · {} medium · {} low)",
            score, risk, s.total, s.critical, s.high, s.medium, s.low,
        ));
        return lines.join("\n");
    }

    let c  = |code: &str, t: &str| ansi(code, t, no_color);
    let dim = "2";

    lines.push(String::new());
    lines.push(c("1;36", "┌─────────────────────────────────────────────────────┐"));
    lines.push(c("1;36", "│  Yana AI Agent Audit Report                          │"));
    lines.push(c("1;36", "│  github.com/yanacuti1121/yana-ai          │"));
    lines.push(c("1;36", "└─────────────────────────────────────────────────────┘"));
    lines.push(String::new());
    lines.push(format!("  Target:   {}", report.target));
    lines.push(format!("  Scanned:  {} files  ·  {} scanners  ·  {} checks",
        stats.files_scanned, stats.scanners_run, stats.checks_applied));
    lines.push(String::new());
    lines.push(format!("  Score:    {}", c(&format!("1;{}", risk_code(risk)), &score.to_string())));
    lines.push(format!("  Risk:     {}", c(&format!("1;{}", risk_code(risk)), risk)));
    lines.push(String::new());

    let non_info: Vec<&Finding> = report.findings.iter().filter(|f| f.severity != "INFO").collect();
    if non_info.is_empty() {
        lines.push(c("32", "  ✓  No significant findings."));
    } else {
        lines.push(c(dim, &format!("  {}", "─".repeat(54))));
        for f in &non_info {
            let sev_label = format!("[{:<8}]", f.severity);
            let file_loc = if let Some(ln) = f.line {
                format!("{}:{ln}", f.file)
            } else { f.file.clone() };
            let desc = if f.description.is_empty() { &f.reason } else { &f.description };
            lines.push(format!("  {} {}  {}",
                c(severity_code(&f.severity), &sev_label),
                c("1", &f.id), file_loc));
            lines.push(format!("             {}", &desc.chars().take(80).collect::<String>()));
            if !f.fix.is_empty() {
                lines.push(c(dim, &format!("             Fix: {}", &f.fix.chars().take(100).collect::<String>())));
            }
            lines.push(String::new());
        }
        lines.push(c(dim, &format!("  {}", "─".repeat(54))));
        let mut parts = Vec::new();
        if s.critical > 0 { parts.push(c("1;31", &format!("{} critical", s.critical))); }
        if s.high     > 0 { parts.push(c("31",   &format!("{} high", s.high))); }
        if s.medium   > 0 { parts.push(c("33",   &format!("{} medium", s.medium))); }
        if s.low      > 0 { parts.push(c(dim,    &format!("{} low", s.low))); }
        lines.push(format!("  Summary:  {}", if parts.is_empty() { "none".to_string() } else { parts.join(" · ") }));
        lines.push(String::new());
        lines.push(c(dim, "  Run with --markdown report.md to export."));
        lines.push(c(dim, "  Run with --fail-on high for CI use."));
        lines.push(c(dim, "  Run with --json to get analytics."));
    }
    if let Some(top) = report.analytics.top_rules.first() {
        if top.count > 1 {
            lines.push(ansi(dim, &format!("  Top finding: {} × {} ({}) — run --json for full breakdown.",
                top.id, top.count, top.severity), no_color));
        }
    }
    lines.push(String::new());
    lines.join("\n")
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

pub fn render_markdown(report: &ScanReport) -> String {
    let s = &report.summary;
    let stats = &report.scan_stats;
    let findings: Vec<&Finding> = report.findings.iter().filter(|f| f.severity != "INFO").collect();

    let risk_note = match report.risk_level.as_str() {
        "CRITICAL" => "> **CRITICAL** — Severe agent safety risks. Address CRITICAL findings immediately.",
        "HIGH"     => "> **HIGH** — Significant risks that could allow an AI agent to cause serious damage.",
        "MEDIUM"   => "> **MEDIUM** — Some risks detected. Review findings and apply recommended fixes.",
        _          => "> **LOW** — Setup looks solid. A few minor improvements are available.",
    };

    let mut lines = vec![
        "# Yana AI Agent Audit Report".to_string(),
        String::new(),
        format!("> Generated by Yana AI v{}  ·  {}", report.yana_ai_version, report.generated_at),
        String::new(), "---".to_string(), String::new(),
        "## Score".to_string(), String::new(),
        "| | |".to_string(), "|---|---|".to_string(),
        format!("| **Score** | {} / 100 |", report.score),
        format!("| **Risk** | {} |", report.risk_level),
        format!("| **Files scanned** | {} |", stats.files_scanned),
        format!("| **Findings** | {} critical · {} high · {} medium · {} low |",
            s.critical, s.high, s.medium, s.low),
        String::new(),
        risk_note.to_string(), String::new(), "---".to_string(), String::new(),
        "## Findings".to_string(), String::new(),
    ];

    if findings.is_empty() {
        lines.push("No significant findings.".to_string());
    } else {
        for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"] {
            let sev_f: Vec<&&Finding> = findings.iter().filter(|f| f.severity == sev).collect();
            if sev_f.is_empty() { continue; }
            lines.push(format!("### {}", capitalize(sev)));
            lines.push(String::new());
            for f in sev_f {
                let file_loc = if let Some(ln) = f.line {
                    format!("`{}`:{ln}", f.file)
                } else { format!("`{}`", f.file) };
                let desc = if f.description.is_empty() { &f.reason } else { &f.description };
                lines.extend([
                    format!("#### {} — {}", f.id, desc),
                    String::new(), "| | |".to_string(), "|---|---|".to_string(),
                    format!("| **File** | {file_loc} |"),
                    format!("| **Rule** | `{}` |", f.rule),
                    format!("| **Confidence** | {} |", f.confidence),
                    String::new(),
                    "**Why this is a risk:**  ".to_string(), f.reason.clone(),
                    String::new(),
                    "**How to fix:**  ".to_string(), f.fix.clone(),
                    String::new(), "---".to_string(), String::new(),
                ]);
            }
        }
    }
    lines.extend(["## Next Steps".to_string(), String::new()]);
    if matches!(report.risk_level.as_str(), "CRITICAL" | "HIGH") {
        lines.extend(["1. Fix all CRITICAL and HIGH findings before using AI agents".to_string(),
            "2. Re-run `yana-ai audit .` to verify fixes".to_string(),
            "3. Add `yana-ai audit . --fail-on high` to your CI pipeline".to_string()]);
    } else {
        lines.extend(["1. Review MEDIUM findings and apply where practical".to_string(),
            "2. Add `yana-ai audit . --fail-on high` to your CI pipeline".to_string()]);
    }
    lines.extend([String::new(), "---".to_string(), String::new(),
        "*Report generated by [Yana AI](https://github.com/yanacuti1121/yana-ai)*".to_string()]);
    lines.join("\n")
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() { None => String::new(), Some(f) => f.to_uppercase().collect::<String>() + c.as_str().to_lowercase().as_str() }
}

// ── SARIF renderer ────────────────────────────────────────────────────────────

pub fn render_sarif(report: &ScanReport) -> String {
    let level_map: HashMap<&str, &str> = [
        ("CRITICAL", "error"), ("HIGH", "error"), ("MEDIUM", "warning"), ("LOW", "note"), ("INFO", "none"),
    ].into_iter().collect();

    let mut rules_seen: HashMap<String, serde_json::Value> = HashMap::new();
    for f in &report.findings {
        rules_seen.entry(f.id.clone()).or_insert_with(|| serde_json::json!({
            "id": f.id,
            "name": f.id,
            "shortDescription": { "text": if f.description.is_empty() { &f.reason } else { &f.description } },
            "fullDescription": { "text": f.reason },
            "help": { "text": f.fix, "markdown": f.fix },
            "properties": { "tags": [f.category], "severity": f.severity.to_lowercase() },
        }));
    }
    let rules_list: Vec<serde_json::Value> = rules_seen.values().cloned().collect();
    let rule_index: HashMap<String, usize> = rules_seen.keys().enumerate().map(|(i, k)| (k.clone(), i)).collect();

    let results: Vec<serde_json::Value> = report.findings.iter().map(|f| {
        let mut loc = serde_json::json!({
            "physicalLocation": {
                "artifactLocation": { "uri": f.file.replace('\\', "/"), "uriBaseId": "%SRCROOT%" }
            }
        });
        if let Some(ln) = f.line {
            loc["physicalLocation"]["region"] = serde_json::json!({ "startLine": ln });
        }
        serde_json::json!({
            "ruleId": f.id,
            "ruleIndex": rule_index.get(&f.id).copied().unwrap_or(0),
            "level": level_map.get(f.severity.as_str()).copied().unwrap_or("warning"),
            "message": { "text": f.reason },
            "locations": [loc],
        })
    }).collect();

    serde_json::to_string_pretty(&serde_json::json!({
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": { "driver": {
                "name": "yana-ai",
                "version": report.yana_ai_version,
                "informationUri": "https://github.com/yanacuti1121/yana-ai",
                "rules": rules_list,
            }},
            "results": results,
            "properties": { "score": report.score, "riskLevel": report.risk_level },
        }]
    })).unwrap_or_default()
}

// ── JSON output ───────────────────────────────────────────────────────────────

pub fn build_json_output(report: &ScanReport, target: &str, exit_code: i32, status: &str) -> serde_json::Value {
    let findings: Vec<serde_json::Value> = report.findings.iter().map(|f| {
        let mut item = serde_json::json!({
            "id": f.id,
            "severity": f.severity.to_lowercase(),
            "message": if !f.message.is_empty() { &f.message } else if !f.reason.is_empty() { &f.reason } else { &f.id },
        });
        if !f.file.is_empty() { item["file"] = serde_json::json!(f.file); }
        if let Some(ln) = f.line { item["line"] = serde_json::json!(ln); }
        if !f.category.is_empty() { item["rule"] = serde_json::json!(f.category); }
        if !f.fix.is_empty() { item["fix"] = serde_json::json!(f.fix); }
        item
    }).collect();
    let s = &report.summary;
    serde_json::json!({
        "schema_version": "1.0",
        "tool": "yana-ai",
        "command": "audit",
        "status": status,
        "exit_code": exit_code,
        "target": target,
        "score": report.score,
        "risk_level": report.risk_level,
        "summary": {
            "total_findings": findings.len(),
            "by_severity": { "critical": s.critical, "high": s.high, "medium": s.medium, "low": s.low },
        },
        "findings": findings,
    })
}
