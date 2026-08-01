//! Rust port of core/hooks/token-budget-guard.sh — same two JSON state files
//! (token-budget.json / circuit-state.json), same field names, same circuit
//! breaker thresholds. Ported as-is, including two quirks present in the
//! original bash/node script (kept intentionally, not "fixed", so behavior
//! stays identical whether a session hits the bash hook or this one):
//!
//!   1. The half-open decision compares elapsed time against the flat
//!      `YANA_CIRCUIT_COOLDOWN` env value (default 60s), not the escalating
//!      `cooldown_seconds` that gets *stored* on the circuit (60/300/1800s
//!      via open_count). The stored value is informational only.
//!   2. The "CIRCUIT BREAKER TRIGGERED" box prints that same flat cooldown
//!      in its "tool BLOCKED for Ns" line, not the escalating one either.

use chrono::Utc;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn env_str(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

enum CircuitStatus {
    Closed,
    HalfOpen,
    Open(u64),
}

pub fn cmd_token_budget(tool: Option<String>) -> i32 {
    if std::env::var("YANA_BUDGET_BYPASS").ok().as_deref() == Some("1") {
        println!("[token-budget-guard] BYPASS active");
        return 0;
    }

    let budget_path = env_str("YANA_TOKEN_BUDGET", "core/memory/L2_session/token-budget.json");
    let circuit_path = env_str("YANA_CIRCUIT_STATE", "core/memory/L2_session/circuit-state.json");
    let max_loop_tokens = env_u64("YANA_MAX_LOOP_TOKENS", 50_000);
    let max_attempts = env_u64("YANA_MAX_FIX_ATTEMPTS", 5);
    let cooldown_seconds = env_u64("YANA_CIRCUIT_COOLDOWN", 60);
    let log_file = env_str("YANA_LOG", "/tmp/yana-ai-audit.log");
    let fast_tier_model = env_str("YANA_FAST_TIER_MODEL", "claude-haiku-4-5-20251001");

    let tool_name = tool
        .or_else(|| std::env::var("CLAUDE_TOOL_NAME").ok())
        .unwrap_or_else(|| "unknown".to_string());

    // ADR-008 — the entire read(budget+circuit) -> decide -> write unit
    // below is one locked critical section, keyed on budget_path. This is
    // the file core/hooks/risk-scorer.sh (Python) also writes on the same
    // PreToolUse event, with no prior coordination between the two; and
    // this Rust path is what most invocations actually hit (the bash/node
    // script execs straight into it whenever yana-rt is on PATH — see
    // core/hooks/token-budget-guard.sh's own comment), so locking only
    // the bash/node fallback would leave the cross-language race open in
    // the common case. On a lock timeout, degrade to running unlocked
    // rather than hard-blocking the tool call over a budget-tracking
    // hook's own contention — this hook's own long-standing convention
    // (see the `2>/dev/null || true` pattern throughout the original bash
    // script) is to fail open on infrastructure problems, not to let them
    // block real work.
    let params = TokenBudgetParams {
        tool_name: &tool_name,
        budget_path: &budget_path,
        circuit_path: &circuit_path,
        max_loop_tokens,
        max_attempts,
        cooldown_seconds,
        log_file: &log_file,
        fast_tier_model: &fast_tier_model,
    };
    let lock_name = crate::guard::lock::lock_name_for(&budget_path);
    match crate::guard::lock::with_lock(&lock_name, std::time::Duration::from_secs(10), || {
        run_critical_section(&params)
    }) {
        Ok(code) => code,
        Err(lock_err) => {
            eprintln!("[token-budget-guard] lock unavailable, proceeding unlocked (degraded): {lock_err:#}");
            run_critical_section(&params)
        }
    }
}

struct TokenBudgetParams<'a> {
    tool_name: &'a str,
    budget_path: &'a str,
    circuit_path: &'a str,
    max_loop_tokens: u64,
    max_attempts: u64,
    cooldown_seconds: u64,
    log_file: &'a str,
    fast_tier_model: &'a str,
}

fn run_critical_section(p: &TokenBudgetParams) -> i32 {
    let TokenBudgetParams {
        tool_name, budget_path, circuit_path, max_loop_tokens,
        max_attempts, cooldown_seconds, log_file, fast_tier_model,
    } = *p;

    let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let now_epoch = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

    let mut budget = load_or_init(&budget_path, || {
        json!({
            "session_start": timestamp,
            "total_tokens_used": 0,
            "actions": [],
            "loop_attempts": {},
            "fast_tier_triggered": false,
        })
    });
    let mut circuits = load_or_init(&circuit_path, || json!({ "circuits": {} }));

    let status = circuit_status_for(&circuits, &tool_name, now_epoch, cooldown_seconds);

    if let CircuitStatus::Open(remaining) = status {
        print_open_box(&tool_name, remaining, &fast_tier_model);
        append_log(&log_file, &format!(
            "[{timestamp}] CIRCUIT-OPEN tool='{tool_name}' cooldown_remaining={remaining}s"
        ));
        return 1;
    }

    let total_tokens = budget.get("total_tokens_used").and_then(Value::as_u64).unwrap_or(0);
    let loop_count = budget
        .get("loop_attempts")
        .and_then(|v| v.get(&tool_name))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    if loop_count >= max_attempts {
        print_trigger_box(&tool_name, loop_count, max_attempts, total_tokens, cooldown_seconds, &fast_tier_model);

        let prev_open_count = circuits
            .get("circuits")
            .and_then(|c| c.get(&tool_name))
            .and_then(|e| e.get("open_count"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let open_count = prev_open_count + 1;
        let stored_cooldown = match open_count {
            1 => 60,
            2 => 300,
            _ => 1800,
        };
        ensure_object(&mut circuits, "circuits");
        circuits["circuits"][tool_name] = json!({
            "state": "open",
            "opened_at": timestamp,
            "opened_at_epoch": now_epoch,
            "open_count": open_count,
            "cooldown_seconds": stored_cooldown,
            "reason": format!("Loop: {tool_name} called >={max_attempts} times without success"),
        });
        write_json(&circuit_path, &circuits);

        budget["fast_tier_triggered"] = json!(true);
        budget["fast_tier_tool"] = json!(tool_name);
        write_json(&budget_path, &budget);

        append_log(&log_file, &format!(
            "[{timestamp}] CIRCUIT-TRIGGERED tool='{tool_name}' loop_count={loop_count} tokens={total_tokens}"
        ));
        return 1; // HARD BLOCK
    }

    if total_tokens > max_loop_tokens {
        println!("[token-budget-guard] BUDGET WARNING: {total_tokens} tokens used (limit: {max_loop_tokens})");
        println!("[token-budget-guard] Run /cost-report to review ROI before continuing");
    }

    if matches!(status, CircuitStatus::HalfOpen) {
        if let Some(entry) = circuits.get_mut("circuits").and_then(|c| c.get_mut(&tool_name)) {
            entry["state"] = json!("closed");
            entry["closed_at"] = json!(Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
            write_json(&circuit_path, &circuits);
        }
        println!("[token-budget-guard] Circuit CLOSED for {tool_name} — probe succeeded");
    }

    ensure_object(&mut budget, "loop_attempts");
    let new_count = budget["loop_attempts"].get(tool_name).and_then(Value::as_u64).unwrap_or(0) + 1;
    budget["loop_attempts"][tool_name] = json!(new_count);
    write_json(&budget_path, &budget);

    println!("[token-budget-guard] OK — {tool_name} (attempt {} / {max_attempts})", loop_count + 1);
    0
}

fn circuit_status_for(circuits: &Value, tool: &str, now_epoch: u64, cooldown_seconds: u64) -> CircuitStatus {
    let info = circuits.get("circuits").and_then(|c| c.get(tool));
    let state = info.and_then(|i| i.get("state")).and_then(Value::as_str).unwrap_or("closed");
    match state {
        "open" => {
            let opened_at_epoch = info.and_then(|i| i.get("opened_at_epoch")).and_then(Value::as_u64).unwrap_or(0);
            let elapsed = now_epoch.saturating_sub(opened_at_epoch);
            if elapsed >= cooldown_seconds {
                CircuitStatus::HalfOpen
            } else {
                CircuitStatus::Open(cooldown_seconds - elapsed)
            }
        }
        "half-open" => CircuitStatus::HalfOpen,
        _ => CircuitStatus::Closed,
    }
}

/// Ensures `parent[key]` is a JSON object, replacing it if it was missing or
/// a non-object value. Mirrors the bash/node `d.circuits || (d.circuits = {})`
/// idiom used throughout the original script.
fn ensure_object(parent: &mut Value, key: &str) {
    if !parent.get(key).is_some_and(Value::is_object) {
        parent[key] = json!({});
    }
}

fn load_or_init(path: &str, default: impl Fn() -> Value) -> Value {
    if let Ok(raw) = fs::read_to_string(path) {
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
            return parsed;
        }
    }
    let value = default();
    write_json(path, &value);
    value
}

/// Atomic write (temp file + `rename`), not a direct `fs::write` — same
/// fix as `src/mission/mod.rs::save()` and for the same reason: `fs::write`
/// truncates before writing, so an UNLOCKED reader of this file
/// (`core/scripts/session-checkpoint.sh` reads `token-budget.json` this
/// way on purpose — no lock, just a snapshot copy + one field read) can
/// occasionally see a torn/partial write mid-truncation. The ADR-008 lock
/// this function is called under only serializes this process against
/// other *locked* writers; it does nothing for a reader that was never
/// part of the lock in the first place. `rename()` on the same filesystem
/// is atomic, so any such reader always sees either the fully-old or
/// fully-new file.
fn write_json(path: &str, value: &Value) {
    if let Some(parent) = Path::new(path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(value).unwrap_or_default();
    let tmp_path = format!("{path}.tmp.{}", std::process::id());
    if fs::write(&tmp_path, json).is_ok() {
        let _ = fs::rename(&tmp_path, path);
    }
}

fn append_log(log_file: &str, line: &str) {
    use std::io::Write;
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = writeln!(f, "{line}");
    }
}

fn print_open_box(tool: &str, remaining: u64, fast_tier_model: &str) {
    println!("╔══════════════════════════════════════════════════════╗");
    println!("║  [token-budget-guard] CIRCUIT BREAKER — OPEN         ║");
    println!("╚══════════════════════════════════════════════════════╝");
    println!("  Tool     : {tool}");
    println!("  State    : OPEN (cooldown: {remaining}s remaining)");
    println!("  Action   : HARD BLOCKED — loop detected, circuit is open");
    println!("  Fix      : Wait for cooldown, then retry with a different strategy");
    println!("  Fast tier: Switch model to {fast_tier_model} to reduce cost");
}

fn print_trigger_box(tool: &str, loop_count: u64, max_attempts: u64, tokens: u64, cooldown_seconds: u64, fast_tier_model: &str) {
    println!("╔══════════════════════════════════════════════════════╗");
    println!("║  [token-budget-guard] CIRCUIT BREAKER TRIGGERED      ║");
    println!("╚══════════════════════════════════════════════════════╝");
    println!("  Tool       : {tool}");
    println!("  Loop count : {loop_count} / {max_attempts} (threshold exceeded)");
    println!("  Tokens used: {tokens}");
    println!("  Action     : Circuit OPENED — tool BLOCKED for {cooldown_seconds}s");
    println!();
    println!("  ── Fast-Tier Recommendation ──────────────────────────");
    println!("  Switch model to: {fast_tier_model}");
    println!("  Reason: Sonnet costs accumulating on a stuck loop.");
    println!("  Command: Set ANTHROPIC_MODEL={fast_tier_model} in your env");
    println!();
    println!("  ── Recovery Options ──────────────────────────────────");
    println!("  1. Stop the loop — pick a completely different approach");
    println!("  2. Use /tree-of-thoughts to re-plan from scratch");
    println!("  3. Escalate to human: too complex for auto-fix");
    println!();
}
