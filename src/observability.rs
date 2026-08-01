//! `yana-rt observability` — read-only summary over `.claude/state/audit-chain.log`,
//! the hash-chained JSONL `audit-log.sh` already writes on every tool call.
//! Adds no new data collection and no new hook: this only reads what already
//! exists. Deliberately not an OpenTelemetry client — see
//! `core/rules/55-observability-telemetry-law.md`'s own rewrite history for
//! why a prior version of this repo described a full OTel pipeline that was
//! never actually implemented. The `audit.<field>` labels in the printed
//! output borrow OTel's namespaced-metric naming convention (via
//! openinterpreter/codex-rs's `codex.tool.call`-style names) purely as a
//! display convention, not a metrics pipeline.

use clap::Subcommand;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Subcommand, Debug)]
pub enum ObservabilityAction {
    /// Tool-call activity summary from the audit chain (most recent calls)
    Show {
        /// Summarize the most recent N log lines, not the whole (large,
        /// ever-growing) file.
        #[arg(long, default_value_t = 500)]
        last: usize,
        #[arg(long)]
        json: bool,
    },
    /// Same data, grouped by one field
    Breakdown {
        /// tool | hook | decision | agent
        #[arg(default_value = "tool")]
        by: String,
        #[arg(long, default_value_t = 500)]
        last: usize,
    },
}

/// Mirrors audit-log.sh's real JSONL schema exactly (verified against live
/// entries in .claude/state/audit-chain.log this session, not assumed from
/// the rule doc alone). `input` and the hash-chain fields are read but
/// unused here — this is a summary view, not a chain-integrity check
/// (that's `core/scripts/verify-audit-chain.sh`'s job, not this one's).
#[derive(Debug, Deserialize)]
struct AuditEntry {
    #[allow(dead_code)]
    ts: String,
    hook: String,
    tool: String,
    agent: String,
    decision: String,
}

fn audit_log_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join(".claude").join("state").join("audit-chain.log")
}

/// Reads the LAST `last` lines only — this file is large (6,500+ real lines
/// in this repo alone) and grows on every tool call; a dashboard re-reading
/// the whole file every invocation doesn't scale and isn't the point,
/// recent activity is. Malformed lines are skipped rather than failing the
/// whole read, matching cost.rs::read_ledger's same tolerant-parse pattern.
fn read_recent_entries(last: usize) -> Vec<AuditEntry> {
    let path = audit_log_path();
    if !path.exists() {
        return vec![];
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(last);
    lines[start..]
        .iter()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn tally<'a>(entries: &'a [AuditEntry], key_fn: impl Fn(&'a AuditEntry) -> &'a str) -> HashMap<String, u64> {
    let mut m: HashMap<String, u64> = HashMap::new();
    for e in entries {
        *m.entry(key_fn(e).to_string()).or_insert(0) += 1;
    }
    m
}

fn sorted_desc(m: &HashMap<String, u64>) -> Vec<(String, u64)> {
    let mut rows: Vec<(String, u64)> = m.iter().map(|(k, v)| (k.clone(), *v)).collect();
    rows.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    rows
}

pub fn cmd_observability_show(last: usize, json: bool) {
    let entries = read_recent_entries(last);
    if entries.is_empty() {
        if json {
            println!("{{\"total\":0,\"by_decision\":{{}},\"by_tool\":{{}},\"by_hook\":{{}}}}");
        } else {
            println!(
                "No audit data. Expected at .claude/state/audit-chain.log — \
                 audit-log.sh (PostToolUse hook) writes this on every tool call."
            );
        }
        return;
    }

    let by_decision = tally(&entries, |e| e.decision.as_str());
    let by_tool = tally(&entries, |e| e.tool.as_str());
    let by_hook = tally(&entries, |e| e.hook.as_str());

    if json {
        let obj = serde_json::json!({
            "total": entries.len(),
            "by_decision": by_decision,
            "by_tool": by_tool,
            "by_hook": by_hook,
        });
        println!("{}", serde_json::to_string_pretty(&obj).unwrap());
        return;
    }

    println!("Audit Activity  (last {} calls)", entries.len());
    println!("{}", "─".repeat(54));

    let deny = by_decision.get("deny").copied().unwrap_or(0);
    let warn = by_decision.get("warn").copied().unwrap_or(0);
    let allow = by_decision.get("allow").copied().unwrap_or(0);
    println!("  audit.decision.allow   {allow:>6}");
    println!("  audit.decision.deny    {deny:>6}");
    println!("  audit.decision.warn    {warn:>6}");

    println!("{}", "─".repeat(54));
    println!("  Top tools:");
    for (name, count) in sorted_desc(&by_tool).into_iter().take(10) {
        println!("    audit.tool.{name:<20} {count:>6}");
    }

    println!("{}", "─".repeat(54));
    println!("  Top hooks (which hook is actually deciding, live):");
    for (name, count) in sorted_desc(&by_hook).into_iter().take(10) {
        println!("    audit.hook.{name:<20} {count:>6}");
    }

    println!("{}", "─".repeat(54));
    println!("  See `yana-rt cost show` for per-call token/duration/cost — this");
    println!("  view is tool-call activity only, no timing data (audit-chain.log");
    println!("  has no per-entry duration field).");
}

pub fn cmd_observability_breakdown(by: String, last: usize) {
    let entries = read_recent_entries(last);
    if entries.is_empty() {
        println!("No audit data.");
        return;
    }

    let m = match by.as_str() {
        "hook" => tally(&entries, |e| e.hook.as_str()),
        "decision" => tally(&entries, |e| e.decision.as_str()),
        "agent" => tally(&entries, |e| e.agent.as_str()),
        _ => tally(&entries, |e| e.tool.as_str()),
    };
    let rows = sorted_desc(&m);

    println!("Breakdown by {by}  (last {} calls)", entries.len());
    println!("{:<30} {:>8}", "NAME", "CALLS");
    println!("{}", "─".repeat(40));
    for (name, count) in &rows {
        println!("{name:<30} {count:>8}");
    }
    println!("{}", "─".repeat(40));
    println!("{:<30} {:>8}", "TOTAL", entries.len());
}
