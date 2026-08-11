use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_LEDGER_ENTRY_BYTES: usize = 64 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CostEntry {
    pub id: String,
    pub ts: String,
    pub task: String,
    pub tier: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct AccountingEntry {
    ts: String,
    cost_usd: f64,
}

fn tier_rates(tier: &str) -> (f64, f64) {
    match tier {
        "fast" => (0.00025, 0.00125),
        "standard" => (0.003, 0.015),
        "strong" => (0.015, 0.075),
        _ => (0.003, 0.015),
    }
}

fn ledger_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    ledger_path_for(&base)
}

pub(crate) fn ledger_path_for(root: &Path) -> PathBuf {
    root.join(".yana-ai").join("ledger.jsonl")
}

/// Strict reader for policy and health decisions. Unlike the legacy summary
/// view, this never drops malformed entries or substitutes an empty ledger for
/// an I/O error.
fn read_ledger_strict(root: &Path) -> Result<Vec<AccountingEntry>> {
    let path = ledger_path_for(root);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(error)
                .with_context(|| format!("cannot inspect cost ledger {}", path.display()))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!("cost ledger must be a regular file: {}", path.display());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = options
        .open(&path)
        .with_context(|| format!("cannot open cost ledger {}", path.display()))?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .with_context(|| format!("cannot read cost ledger {}", path.display()))?;
    text.lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| {
            let entry: AccountingEntry = serde_json::from_str(line).with_context(|| {
                format!("invalid cost ledger entry {}:{}", path.display(), index + 1)
            })?;
            if !entry.cost_usd.is_finite() || entry.cost_usd < 0.0 {
                bail!("invalid cost value at {}:{}", path.display(), index + 1);
            }
            Ok(entry)
        })
        .collect()
}

pub(crate) fn daily_cost_usd(root: &Path, now: DateTime<Utc>) -> Result<f64> {
    let date = now.format("%Y-%m-%d").to_string();
    Ok(read_ledger_strict(root)?
        .into_iter()
        .filter(|entry| entry.ts.starts_with(&date))
        .map(|entry| entry.cost_usd)
        .sum())
}

fn read_ledger() -> Vec<CostEntry> {
    let path = ledger_path();
    if !path.exists() {
        return vec![];
    }
    fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn append_entry_at(root: &Path, entry: &CostEntry) -> Result<()> {
    let path = ledger_path_for(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("cannot create cost ledger directory {}", parent.display()))?;
    }
    let mut line = serde_json::to_vec(entry).context("cannot serialize cost ledger entry")?;
    line.push(b'\n');
    if line.len() > MAX_LEDGER_ENTRY_BYTES {
        bail!(
            "cost ledger entry exceeds {} byte limit",
            MAX_LEDGER_ENTRY_BYTES
        );
    }
    let mut options = fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options
        .open(&path)
        .with_context(|| format!("cannot open cost ledger {}", path.display()))?;
    if !file.metadata()?.is_file() {
        bail!("cost ledger must be a regular file: {}", path.display());
    }
    let written = file
        .write(&line)
        .with_context(|| format!("cannot append cost ledger {}", path.display()))?;
    if written != line.len() {
        bail!(
            "short cost ledger append at {}: wrote {written} of {} bytes",
            path.display(),
            line.len()
        );
    }
    Ok(())
}

/// Called by runtime event producers when real token counts are present.
/// Returns `Ok(false)` when the payload has no complete token pair.
pub fn track_from_payload(event_type: &str, payload: &serde_json::Value) -> Result<bool> {
    let input_tokens = match payload.get("input_tokens").and_then(|v| v.as_u64()) {
        Some(n) => n,
        None => return Ok(false),
    };
    let output_tokens = match payload.get("output_tokens").and_then(|v| v.as_u64()) {
        Some(n) => n,
        None => return Ok(false),
    };
    let task = payload
        .get("task")
        .and_then(|v| v.as_str())
        .unwrap_or(event_type)
        .to_string();
    let tier = payload
        .get("tier")
        .and_then(|v| v.as_str())
        .unwrap_or("standard")
        .to_string();
    let model = payload
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let dur = payload.get("duration_ms").and_then(|v| v.as_u64());

    let (rate_in, rate_out) = tier_rates(&tier);
    let cost_usd =
        (input_tokens as f64 / 1000.0) * rate_in + (output_tokens as f64 / 1000.0) * rate_out;
    let cost_usd = (cost_usd * 1_000_000.0).round() / 1_000_000.0;

    let entry = CostEntry {
        id: Uuid::new_v4().to_string(),
        ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        task,
        tier,
        model,
        input_tokens,
        output_tokens,
        cost_usd,
        duration_ms: dur,
    };
    let root = std::env::current_dir().context("cannot resolve cost ledger project root")?;
    append_entry_at(&root, &entry)?;
    Ok(true)
}

pub fn cmd_cost_log(
    task: String,
    tier: String,
    model: String,
    input_tokens: u64,
    output_tokens: u64,
    duration_ms: Option<u64>,
) -> Result<()> {
    let (rate_in, rate_out) = tier_rates(&tier);
    let cost_usd =
        (input_tokens as f64 / 1000.0) * rate_in + (output_tokens as f64 / 1000.0) * rate_out;
    let cost_usd = (cost_usd * 1_000_000.0).round() / 1_000_000.0;
    let entry = CostEntry {
        id: Uuid::new_v4().to_string(),
        ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        task,
        tier,
        model,
        input_tokens,
        output_tokens,
        cost_usd,
        duration_ms,
    };
    let root = std::env::current_dir().context("cannot resolve cost ledger project root")?;
    append_entry_at(&root, &entry)?;
    println!(
        "✓ logged  ${cost_usd:.6}  ({} in + {} out)",
        entry.input_tokens, entry.output_tokens
    );
    Ok(())
}

pub fn cmd_cost_show() {
    let entries = read_ledger();
    if entries.is_empty() {
        println!("No cost data.\nLog with: yana-rt cost log <task> <tier> <model> <in> <out>");
        return;
    }
    let total_cost: f64 = entries.iter().map(|e| e.cost_usd).sum();
    let total_tok: u64 = entries
        .iter()
        .map(|e| e.input_tokens + e.output_tokens)
        .sum();

    println!("Cost Summary  ({} calls)", entries.len());
    println!("{}", "─".repeat(54));
    for tier in &["fast", "standard", "strong"] {
        let te: Vec<&CostEntry> = entries.iter().filter(|e| e.tier == *tier).collect();
        if te.is_empty() {
            continue;
        }
        let tc: f64 = te.iter().map(|e| e.cost_usd).sum();
        let tt: u64 = te.iter().map(|e| e.input_tokens + e.output_tokens).sum();
        println!(
            "  {:<10}  {:>4} calls  {:>9} tok  ${tc:.6}",
            tier,
            te.len(),
            tt
        );
    }
    println!("{}", "─".repeat(54));
    println!(
        "  TOTAL       {:>4} calls  {:>9} tok  ${total_cost:.6}",
        entries.len(),
        total_tok
    );
}

pub fn cmd_cost_breakdown(by: String) {
    let entries = read_ledger();
    if entries.is_empty() {
        println!("No cost data.");
        return;
    }

    let mut groups: HashMap<String, (u64, u64, u64, f64)> = HashMap::new();
    for e in &entries {
        let key = match by.as_str() {
            "model" => e.model.clone(),
            "task" => e.task.clone(),
            _ => e.tier.clone(),
        };
        let rec = groups.entry(key).or_insert((0, 0, 0, 0.0));
        rec.0 += 1;
        rec.1 += e.input_tokens;
        rec.2 += e.output_tokens;
        rec.3 += e.cost_usd;
    }
    let mut rows: Vec<(String, u64, u64, u64, f64)> = groups
        .into_iter()
        .map(|(k, (calls, tin, tout, cost))| (k, calls, tin, tout, cost))
        .collect();
    rows.sort_by(|a, b| b.4.partial_cmp(&a.4).unwrap_or(std::cmp::Ordering::Equal));

    println!("Breakdown by {by}");
    println!(
        "{:<26} {:>6} {:>11} {:>12}",
        "NAME", "CALLS", "TOKENS", "COST USD"
    );
    println!("{}", "─".repeat(58));
    for (name, calls, tin, tout, cost) in &rows {
        println!("{:<26} {:>6} {:>11} ${cost:.6}", name, calls, tin + tout);
    }
    let total: f64 = rows.iter().map(|r| r.4).sum();
    println!("{}", "─".repeat(58));
    println!(
        "{:<26} {:>6} {:>11} ${total:.6}",
        "TOTAL",
        rows.iter().map(|r| r.1).sum::<u64>(),
        rows.iter().map(|r| r.2 + r.3).sum::<u64>()
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("yana-cost-{}", Uuid::new_v4()))
    }

    fn entry(ts: &str, cost_usd: f64) -> CostEntry {
        CostEntry {
            id: Uuid::new_v4().to_string(),
            ts: ts.to_string(),
            task: "test".to_string(),
            tier: "standard".to_string(),
            model: "mock".to_string(),
            input_tokens: 1,
            output_tokens: 1,
            cost_usd,
            duration_ms: None,
        }
    }

    #[test]
    fn strict_daily_cost_uses_only_requested_day() {
        let root = root();
        let path = ledger_path_for(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let lines = [
            serde_json::to_string(&entry("2026-08-11T01:00:00Z", 0.25)).unwrap(),
            serde_json::to_string(&entry("2026-08-10T23:00:00Z", 9.0)).unwrap(),
            serde_json::to_string(&entry("2026-08-11T02:00:00Z", 0.75)).unwrap(),
        ];
        fs::write(&path, format!("{}\n", lines.join("\n"))).unwrap();
        let now = DateTime::parse_from_rfc3339("2026-08-11T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(daily_cost_usd(&root, now).unwrap(), 1.0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn strict_reader_rejects_corruption() {
        let root = root();
        let path = ledger_path_for(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "not-json\n").unwrap();
        let error = read_ledger_strict(&root).unwrap_err().to_string();
        assert!(error.contains("invalid cost ledger entry"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn strict_reader_rejects_symlink() {
        use std::os::unix::fs::symlink;

        let root = root();
        let path = ledger_path_for(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let target = root.join("outside-ledger");
        fs::write(&target, "").unwrap();
        symlink(&target, &path).unwrap();
        let error = read_ledger_strict(&root).unwrap_err().to_string();
        assert!(error.contains("must be a regular file"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_appends_preserve_every_json_line() {
        use std::sync::Arc;

        let root = Arc::new(root());
        for round in 0..10 {
            let handles: Vec<_> = (0..32)
                .map(|worker| {
                    let root = Arc::clone(&root);
                    std::thread::spawn(move || {
                        let mut item = entry("2026-08-11T12:00:00Z", 0.001);
                        item.id = format!("{round}-{worker}");
                        append_entry_at(&root, &item).unwrap();
                    })
                })
                .collect();
            for handle in handles {
                handle.join().unwrap();
            }
        }
        let text = fs::read_to_string(ledger_path_for(&root)).unwrap();
        let parsed: Vec<CostEntry> = text
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(parsed.len(), 320);
        let ids: std::collections::HashSet<_> = parsed.iter().map(|item| &item.id).collect();
        assert_eq!(ids.len(), 320);
        fs::remove_dir_all(root.as_ref()).unwrap();
    }
}
