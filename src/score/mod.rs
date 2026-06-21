use anyhow::Result;
use clap::Subcommand;

const SEV_DEDUCT: &[(&str, i32)] = &[
    ("CRITICAL", 30), ("HIGH", 20), ("MEDIUM", 10), ("MED", 10), ("LOW", 3),
];

#[derive(Subcommand, Debug)]
pub enum ScoreAction {
    /// Show audit score and risk level
    Show {
        #[arg(default_value = ".")] target: String,
        /// Full deduction breakdown per finding
        #[arg(long)] explain: bool,
        /// Output as JSON
        #[arg(long)] json: bool,
        /// Scanner rules directory
        #[arg(long, default_value = "scanner")] scanner_dir: String,
    },
}

pub fn dispatch(action: ScoreAction) {
    let result = match action {
        ScoreAction::Show { target, explain, json, scanner_dir } =>
            cmd_score(&target, explain, json, &scanner_dir),
    };
    if let Err(e) = result {
        eprintln!("[score] error: {e}");
        std::process::exit(1);
    }
}

fn deduct(sev: &str) -> i32 {
    let s = sev.to_uppercase();
    SEV_DEDUCT.iter().find(|(k, _)| *k == s).map(|(_, v)| *v).unwrap_or(0)
}

fn risk_level(score: i32) -> &'static str {
    if score >= 85 { "LOW" } else if score >= 60 { "MEDIUM" } else if score >= 30 { "HIGH" } else { "CRITICAL" }
}

fn risk_color(risk: &str) -> &'static str {
    match risk { "CRITICAL" | "HIGH" => "\x1b[31m", "MEDIUM" => "\x1b[33m", _ => "\x1b[32m" }
}

fn cmd_score(target: &str, explain: bool, as_json: bool, scanner_dir: &str) -> Result<()> {
        // Run scan internally
    let diff_files: Option<std::collections::HashSet<String>> = None;
    let report = crate::scanner::run_audit(
        target, scanner_dir, diff_files.as_ref(), &[], None, false,
    );

    // Calculate score
    let mut score = 100i32;
    let mut deductions: Vec<(String, i32, String, String, String)> = Vec::new(); // sev, deduct, id, file, desc

    for f in &report.findings {
        let d = deduct(&f.severity);
        if d > 0 {
            score -= d;
            deductions.push((
                f.severity.clone(), d,
                f.id.clone(), f.file.clone(),
                f.description.chars().take(50).collect(),
            ));
        }
    }
    let score = score.max(0);
    let risk = risk_level(score);

    if as_json {
        let out = serde_json::json!({
            "score": score,
            "risk_level": risk,
            "target": target,
            "files_scanned": report.scan_stats.files_scanned,
            "summary": {
                "critical": report.summary.critical,
                "high": report.summary.high,
                "medium": report.summary.medium,
                "low": report.summary.low,
            },
            "deductions": deductions.iter().map(|(sev, d, id, file, desc)| serde_json::json!({
                "severity": sev, "deduct": d, "id": id, "file": file, "description": desc
            })).collect::<Vec<_>>()
        });
        println!("{}", serde_json::to_string_pretty(&out)?);
        return Ok(());
    }

    let rc = risk_color(risk);
    println!("\n  Yana AI Score Report");
    println!("  Target: {}  ·  {} files scanned\n", target, report.scan_stats.files_scanned);

    if explain {
        println!("  Score Breakdown");
        println!("  Start ......................................... \x1b[1m100\x1b[0m\n");
        if deductions.is_empty() {
            println!("  \x1b[2mNo deductions — clean repo\x1b[0m");
        } else {
            let mut running = 100i32;
            for (sev, d, id, file, desc) in &deductions {
                running -= d;
                let sc = risk_color(sev);
                println!("  {}\x1b[1m-{}\x1b[0m{:<8}  {}{:<10}\x1b[0m {}  \x1b[2m{}\x1b[0m  \x1b[2m→ {}\x1b[0m",
                    sc, d, "", sc, sev, id, desc, running);
            }
        }
        println!("\n  {}", "─".repeat(55));
        println!("  Final ......................................... {}{}/100\x1b[0m  {}{}\x1b[0m\n",
            rc, score, rc, risk);
    } else {
        println!("  Score:    {}\x1b[1m{} / 100\x1b[0m", rc, score);
        println!("  Risk:     {}\x1b[1m{}\x1b[0m\n", rc, risk);
        let s = &report.summary;
        println!("  Findings: \x1b[31m{} critical\x1b[0m  \x1b[31m{} high\x1b[0m  \x1b[33m{} medium\x1b[0m  {} low\n",
            s.critical, s.high, s.medium, s.low);
        if explain || (!deductions.is_empty()) {
            println!("  \x1b[2mRun with --explain for full deduction breakdown.\x1b[0m\n");
        }
    }
    Ok(())
}
