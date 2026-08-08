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

    let project_root = match yana_rt::flock_v1::project_root_from_env() {
        Ok(root) => root,
        Err(error) => {
            eprintln!("[token-budget-guard] {error:#}");
            return 1;
        }
    };
    let default_budget = project_root.join("core/memory/L2_session/token-budget.json");
    let default_circuit = project_root.join("core/memory/L2_session/circuit-state.json");
    let budget_path = std::env::var("YANA_TOKEN_BUDGET")
        .unwrap_or_else(|_| default_budget.to_string_lossy().into_owned());
    let circuit_path = std::env::var("YANA_CIRCUIT_STATE")
        .unwrap_or_else(|_| default_circuit.to_string_lossy().into_owned());
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
    match yana_rt::flock_v1::with_lock(
        "key/state/token-budget.json",
        &project_root,
        std::time::Duration::from_secs(10),
        || {
            run_critical_section(&params)
        },
    ) {
        Ok(code) => code,
        Err(lock_err) => {
            eprintln!("[token-budget-guard] lock unavailable: {lock_err:#}");
            1
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
        append_log(&log_file, &format!(
            "[{timestamp}] CIRCUIT-OPEN tool='{tool_name}' cooldown_remaining={remaining}s"
        ));
        // BUG FIX (2026-08-09): this used to print_open_box() (a
        // human-readable ASCII box on stdout) and `return 1`. Claude Code's
        // PreToolUse hook contract only recognizes exit 2 + a
        // hookSpecificOutput JSON object as an actual "deny" — any other
        // exit code is treated as a hook error and the tool call proceeds
        // anyway (confirmed by direct reproduction: this path printed
        // "HARD BLOCKED" while the tool call ran regardless). Switched to
        // the same deny_json() the destructive-command guard uses, so
        // circuit-open decisions actually block instead of just logging
        // their own name.
        return super::deny_json(&format!(
            "[token-budget-guard] Circuit breaker OPEN for '{tool_name}' — too many \
             consecutive attempts detected. Blocked for {remaining}s more (cooldown). \
             Switch to {fast_tier_model} for faster/cheaper retries, or wait out the cooldown."
        ));
    }

    let total_tokens = budget.get("total_tokens_used").and_then(Value::as_u64).unwrap_or(0);
    let loop_count = budget
        .get("loop_attempts")
        .and_then(|v| v.get(&tool_name))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    if loop_count >= max_attempts {
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
        // Same exit-code bug as the CircuitStatus::Open branch above: this
        // must deny with exit 2 + JSON, not `return 1` (see the 2026-08-09
        // fix note there for why exit 1 doesn't actually block).
        return super::deny_json(&format!(
            "[token-budget-guard] Circuit breaker OPENED for '{tool_name}' — called \
             {loop_count}/{max_attempts} times without success (loop detected). Blocked for \
             {stored_cooldown}s. Switch to {fast_tier_model} for faster/cheaper retries, or \
             stop and re-plan with a different approach."
        ));
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for the 2026-08-09 fix: a circuit-OPEN decision
    /// must return exit 2 (the only code Claude Code's PreToolUse hook
    /// contract recognizes as "deny"), not a plain `1` that gets treated
    /// as a hook error and lets the tool call through anyway. Exercises
    /// `run_critical_section` directly, bypassing the flock-v1 lock
    /// wrapper in `cmd_token_budget` (that lock's own file-based state is
    /// environment-dependent and orthogonal to this exit-code contract).
    #[test]
    fn circuit_open_denies_with_exit_2() {
        let dir = std::env::temp_dir().join(format!(
            "yana-token-budget-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let budget_path = dir.join("budget.json");
        let circuit_path = dir.join("circuit.json");

        std::fs::write(&budget_path, r#"{"total_tokens_used":0,"loop_attempts":{}}"#).unwrap();
        let now_epoch = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let circuit_json = json!({
            "circuits": {
                "Bash": { "state": "open", "opened_at_epoch": now_epoch }
            }
        });
        std::fs::write(&circuit_path, circuit_json.to_string()).unwrap();

        let log_path = dir.join("audit.log");
        let params = TokenBudgetParams {
            tool_name: "Bash",
            budget_path: budget_path.to_str().unwrap(),
            circuit_path: circuit_path.to_str().unwrap(),
            max_loop_tokens: 50_000,
            max_attempts: 5,
            cooldown_seconds: 60,
            log_file: log_path.to_str().unwrap(),
            fast_tier_model: "claude-haiku-4-5-20251001",
        };

        let code = run_critical_section(&params);
        assert_eq!(code, 2, "circuit-open must return exit 2 (deny), not {code}");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Same bug, other branch: a loop-count trip (circuit going from
    /// closed to open on THIS call, not already open) also used to
    /// `return 1` instead of denying with exit 2.
    #[test]
    fn circuit_trigger_denies_with_exit_2() {
        let dir = std::env::temp_dir().join(format!(
            "yana-token-budget-test-trigger-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let budget_path = dir.join("budget.json");
        let circuit_path = dir.join("circuit.json");

        // loop_attempts already at the max_attempts threshold -> this call
        // is the one that trips the circuit from closed to open.
        std::fs::write(
            &budget_path,
            r#"{"total_tokens_used":0,"loop_attempts":{"Bash":5}}"#,
        )
        .unwrap();
        std::fs::write(&circuit_path, r#"{"circuits":{}}"#).unwrap();

        let log_path = dir.join("audit.log");
        let params = TokenBudgetParams {
            tool_name: "Bash",
            budget_path: budget_path.to_str().unwrap(),
            circuit_path: circuit_path.to_str().unwrap(),
            max_loop_tokens: 50_000,
            max_attempts: 5,
            cooldown_seconds: 60,
            log_file: log_path.to_str().unwrap(),
            fast_tier_model: "claude-haiku-4-5-20251001",
        };

        let code = run_critical_section(&params);
        assert_eq!(code, 2, "circuit-trigger must return exit 2 (deny), not {code}");

        std::fs::remove_dir_all(&dir).ok();
    }
}
