use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CostEntry {
    pub id:            String,
    pub ts:            String,
    pub task:          String,
    pub tier:          String,
    pub model:         String,
    pub input_tokens:  u64,
    pub output_tokens: u64,
    pub cost_usd:      f64,
    pub duration_ms:   Option<u64>,
}

fn tier_rates(tier: &str) -> (f64, f64) {
    match tier {
        "fast"     => (0.00025, 0.00125),
        "standard" => (0.003,   0.015),
        "strong"   => (0.015,   0.075),
        _          => (0.003,   0.015),
    }
}

fn ledger_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join(".yana-ai").join("ledger.jsonl")
}

fn read_ledger() -> Vec<CostEntry> {
    let path = ledger_path();
    if !path.exists() { return vec![]; }
    fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn append_entry(entry: &CostEntry) {
    let path = ledger_path();
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).ok(); }
    let line = serde_json::to_string(entry).expect("serialize failed");
    let mut file = fs::OpenOptions::new().create(true).append(true).open(&path)
        .expect("open ledger failed");
    writeln!(file, "{line}").expect("write failed");
}

/// Called from bus emit — silently logs if payload has input_tokens + output_tokens.
/// Returns true if a cost entry was recorded.
pub fn track_from_payload(event_type: &str, payload: &serde_json::Value) -> bool {
    let input_tokens  = match payload.get("input_tokens").and_then(|v| v.as_u64()) {
        Some(n) => n,
        None    => return false,
    };
    let output_tokens = match payload.get("output_tokens").and_then(|v| v.as_u64()) {
        Some(n) => n,
        None    => return false,
    };
    let task  = payload.get("task").and_then(|v| v.as_str()).unwrap_or(event_type).to_string();
    let tier  = payload.get("tier").and_then(|v| v.as_str()).unwrap_or("standard").to_string();
    let model = payload.get("model").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    let dur   = payload.get("duration_ms").and_then(|v| v.as_u64());

    let (rate_in, rate_out) = tier_rates(&tier);
    let cost_usd = ((input_tokens as f64 / 1000.0) * rate_in
        + (output_tokens as f64 / 1000.0) * rate_out);
    let cost_usd = (cost_usd * 1_000_000.0).round() / 1_000_000.0;

    let entry = CostEntry {
        id: Uuid::new_v4().to_string(),
        ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        task, tier, model, input_tokens, output_tokens, cost_usd,
        duration_ms: dur,
    };
    append_entry(&entry);
    true
}

pub fn cmd_cost_log(
    task: String, tier: String, model: String,
    input_tokens: u64, output_tokens: u64, duration_ms: Option<u64>,
) {
    let (rate_in, rate_out) = tier_rates(&tier);
    let cost_usd = (input_tokens as f64 / 1000.0) * rate_in
        + (output_tokens as f64 / 1000.0) * rate_out;
    let cost_usd = (cost_usd * 1_000_000.0).round() / 1_000_000.0;
    let entry = CostEntry {
        id: Uuid::new_v4().to_string(),
        ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        task, tier, model, input_tokens, output_tokens, cost_usd, duration_ms,
    };
    append_entry(&entry);
    println!("✓ logged  ${cost_usd:.6}  ({} in + {} out)", entry.input_tokens, entry.output_tokens);
}

pub fn cmd_cost_show() {
    let entries = read_ledger();
    if entries.is_empty() {
        println!("No cost data.\nLog with: yana-rt cost log <task> <tier> <model> <in> <out>");
        return;
    }
    let total_cost: f64 = entries.iter().map(|e| e.cost_usd).sum();
    let total_tok: u64  = entries.iter().map(|e| e.input_tokens + e.output_tokens).sum();

    println!("Cost Summary  ({} calls)", entries.len());
    println!("{}", "─".repeat(54));
    for tier in &["fast", "standard", "strong"] {
        let te: Vec<&CostEntry> = entries.iter().filter(|e| e.tier == *tier).collect();
        if te.is_empty() { continue; }
        let tc: f64 = te.iter().map(|e| e.cost_usd).sum();
        let tt: u64 = te.iter().map(|e| e.input_tokens + e.output_tokens).sum();
        println!("  {:<10}  {:>4} calls  {:>9} tok  ${tc:.6}", tier, te.len(), tt);
    }
    println!("{}", "─".repeat(54));
    println!("  TOTAL       {:>4} calls  {:>9} tok  ${total_cost:.6}", entries.len(), total_tok);
}

pub fn cmd_cost_breakdown(by: String) {
    let entries = read_ledger();
    if entries.is_empty() { println!("No cost data."); return; }

    let mut groups: HashMap<String, (u64, u64, u64, f64)> = HashMap::new();
    for e in &entries {
        let key = match by.as_str() {
            "model" => e.model.clone(),
            "task"  => e.task.clone(),
            _       => e.tier.clone(),
        };
        let rec = groups.entry(key).or_insert((0, 0, 0, 0.0));
        rec.0 += 1; rec.1 += e.input_tokens; rec.2 += e.output_tokens; rec.3 += e.cost_usd;
    }
    let mut rows: Vec<(String, u64, u64, u64, f64)> = groups.into_iter()
        .map(|(k, (calls, tin, tout, cost))| (k, calls, tin, tout, cost))
        .collect();
    rows.sort_by(|a, b| b.4.partial_cmp(&a.4).unwrap_or(std::cmp::Ordering::Equal));

    println!("Breakdown by {by}");
    println!("{:<26} {:>6} {:>11} {:>12}", "NAME", "CALLS", "TOKENS", "COST USD");
    println!("{}", "─".repeat(58));
    for (name, calls, tin, tout, cost) in &rows {
        println!("{:<26} {:>6} {:>11} ${cost:.6}", name, calls, tin + tout);
    }
    let total: f64 = rows.iter().map(|r| r.4).sum();
    println!("{}", "─".repeat(58));
    println!("{:<26} {:>6} {:>11} ${total:.6}", "TOTAL",
        rows.iter().map(|r| r.1).sum::<u64>(),
        rows.iter().map(|r| r.2 + r.3).sum::<u64>());
}
