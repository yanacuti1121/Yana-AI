use crate::chat::provider::ask_once;
use crate::chat::try_select_provider;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

fn now() -> String { Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string() }

// ── Data model ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus { Open, InProgress, Done, Blocked }

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Open       => write!(f, "open"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Done       => write!(f, "done"),
            TaskStatus::Blocked    => write!(f, "blocked"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Evidence { pub raw: String, pub signals: EvidenceSignals }

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct EvidenceSignals {
    pub tests_passed: Option<u32>,
    pub tests_failed: Option<u32>,
    pub build_ok:     bool,
    pub coverage_pct: Option<f32>,
    pub manual_note:  Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String, pub name: String, pub status: TaskStatus,
    pub scope: Option<String>, pub created_at: String,
    pub updated_at: String, pub evidence: Option<Evidence>,
    /// Consecutive FAIL verdicts from `yana-rt eval judge` since the last
    /// PASS. `#[serde(default)]` so a `tasks.json` written before this field
    /// existed still deserializes (missing field -> 0), no migration script.
    #[serde(default)]
    pub eval_judge_attempts: u32,
    /// RFC3339 timestamp; `Some` while the judge breaker is open (blocking
    /// further `eval judge` calls until this time passes). `#[serde(default)]`
    /// for the same backward-compat reason as above (missing field -> None).
    #[serde(default)]
    pub eval_judge_breaker_until: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct TaskStore { pub tasks: HashMap<String, Task> }

// ── Storage ───────────────────────────────────────────────────────────────────

fn store_path() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join(".yana-ai").join("tasks.json")
}

pub fn load_store() -> TaskStore {
    let path = store_path();
    if !path.exists() { return TaskStore::default(); }
    serde_json::from_str(&fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default()
}

fn save_store(store: &TaskStore) {
    let path = store_path();
    if let Some(p) = path.parent() { fs::create_dir_all(p).ok(); }
    fs::write(&path, serde_json::to_string_pretty(store).expect("serialize failed"))
        .expect("write failed");
}

pub fn resolve_id<'a>(store: &'a TaskStore, prefix: &str) -> Option<&'a Task> {
    let m: Vec<_> = store.tasks.values().filter(|t| t.id.starts_with(prefix)).collect();
    if m.len() == 1 { Some(m[0]) } else { None }
}

fn resolve_id_key(store: &TaskStore, prefix: &str) -> Option<String> {
    let m: Vec<_> = store.tasks.keys().filter(|k| k.starts_with(prefix)).cloned().collect();
    if m.len() == 1 { Some(m[0].clone()) } else { None }
}

// ── Evidence ──────────────────────────────────────────────────────────────────

fn find_number_before(text: &str, kw: &str) -> Option<u32> {
    text.find(kw).and_then(|pos| {
        text[..pos].split_whitespace().last()
            .and_then(|s| s.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().ok())
    })
}

fn find_coverage(text: &str) -> Option<f32> {
    text.split_whitespace()
        .find(|p| p.ends_with('%'))
        .and_then(|p| p.trim_end_matches('%').parse().ok())
}

pub fn parse_evidence(raw: &str) -> EvidenceSignals {
    let lower = raw.to_lowercase();
    let mut sig = EvidenceSignals::default();
    sig.tests_passed = find_number_before(&lower, "tests passed")
        .or_else(|| find_number_before(&lower, "passed"));
    sig.tests_failed = find_number_before(&lower, "tests failed")
        .or_else(|| find_number_before(&lower, "failed"));
    sig.build_ok = lower.contains("exit 0") || lower.contains("build success")
        || lower.contains("0 error") || lower.contains("build ok");
    sig.coverage_pct = find_coverage(&lower);
    if sig.tests_passed.is_none() && !sig.build_ok && sig.coverage_pct.is_none() {
        sig.manual_note = Some(raw.to_string());
    }
    sig
}

pub fn evidence_schema() -> serde_json::Value {
    serde_json::json!({
        "title": "Yana AI Evidence Schema v1",
        "required_one_of": ["tests_passed","build_ok","coverage_pct","manual_note"],
        "rules": { "tests_failed": "must be 0 or absent", "coverage_pct": "warn if below 80" },
        "confidence_levels": {
            "tests_passed + build_ok": "HIGH", "tests_passed only": "MEDIUM",
            "build_ok only": "MEDIUM", "coverage_pct only": "MEDIUM", "manual_note only": "LOW"
        }
    })
}

pub fn eval_evidence(ev: &Evidence) -> (bool, String, &'static str) {
    let sig = &ev.signals;
    if sig.tests_failed.map(|n| n > 0).unwrap_or(false) {
        return (false, format!("{} tests failed", sig.tests_failed.unwrap()), "FAIL");
    }
    if !sig.tests_passed.is_some() && !sig.build_ok && sig.coverage_pct.is_none() && sig.manual_note.is_none() {
        return (false, "no evidence signals detected".into(), "FAIL");
    }
    let confidence = if sig.tests_passed.is_some() && sig.build_ok { "HIGH" }
        else if sig.tests_passed.is_some() || sig.build_ok || sig.coverage_pct.is_some() { "MEDIUM" }
        else { "LOW" };
    let mut parts = Vec::new();
    if let Some(n) = sig.tests_passed { parts.push(format!("{n} tests passed")); }
    if sig.build_ok { parts.push("build OK".into()); }
    if let Some(cov) = sig.coverage_pct {
        parts.push(format!("coverage {cov:.0}%"));
        if cov < 80.0 { parts.push("⚠ below 80%".into()); }
    }
    if let Some(note) = &sig.manual_note { parts.push(format!("note: {note}")); }
    (true, parts.join(" · "), confidence)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub fn cmd_task_create(name: String, scope: Option<String>) {
    let mut store = load_store();
    let id = Uuid::new_v4().to_string();
    let ts = now();
    store.tasks.insert(id.clone(), Task {
        id: id.clone(), name: name.clone(), status: TaskStatus::Open,
        scope: scope.clone(), created_at: ts.clone(), updated_at: ts, evidence: None,
        eval_judge_attempts: 0, eval_judge_breaker_until: None,
    });
    save_store(&store);
    println!("✓ created  {}", &id[..8]);
    println!("  name:  {name}");
    if let Some(s) = scope { println!("  scope: {s}"); }
}

pub fn cmd_task_list() {
    let store = load_store();
    if store.tasks.is_empty() { println!("No tasks. yana-rt task create \"description\""); return; }
    let mut tasks: Vec<&Task> = store.tasks.values().collect();
    tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    println!("{:<10} {:<12} {}", "ID", "STATUS", "NAME");
    println!("{}", "─".repeat(55));
    for t in tasks {
        let icon = match t.status {
            TaskStatus::Open => "○", TaskStatus::InProgress => "◉",
            TaskStatus::Done => "✓", TaskStatus::Blocked => "✗",
        };
        println!("{:<10} {icon} {:<10} {}", &t.id[..8], t.status.to_string(), t.name);
    }
}

pub fn cmd_task_done(id: String, evidence: String) {
    let mut store = load_store();
    let key = match resolve_id_key(&store, &id) {
        Some(k) => k,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    let signals = parse_evidence(&evidence);
    let task = store.tasks.get_mut(&key).unwrap();
    task.status = TaskStatus::Done;
    task.evidence = Some(Evidence { raw: evidence.clone(), signals });
    task.updated_at = now();
    save_store(&store);
    println!("✓ done  {}\n  evidence: {evidence}\n  run: yana-rt eval run {}", &key[..8], &key[..8]);
}

pub fn cmd_task_status(id: String) {
    let store = load_store();
    let task = match resolve_id(&store, &id) {
        Some(t) => t,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    println!("Task {}\n  name:    {}\n  status:  {}\n  created: {}",
        &task.id[..8], task.name, task.status, task.created_at);
    if let Some(s) = &task.scope { println!("  scope:   {s}"); }
    if let Some(ev) = &task.evidence { println!("  evidence: {}", ev.raw); }
}

pub fn cmd_task_drop(id: String) {
    let mut store = load_store();
    let key = match resolve_id_key(&store, &id) {
        Some(k) => k,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    store.tasks.remove(&key);
    save_store(&store);
    println!("✓ dropped {}", &key[..8]);
}

pub fn cmd_eval_run(id: String) {
    let store = load_store();
    let task = match resolve_id(&store, &id) {
        Some(t) => t,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    let ev = match &task.evidence {
        Some(e) => e,
        None => { eprintln!("error: no evidence. run: yana-rt task done {} --evidence \"...\"", &task.id[..8]); std::process::exit(1); }
    };
    let (pass, detail, confidence) = eval_evidence(ev);
    let icon = if pass { "✓" } else { "✗" };
    println!("{icon} {}  {}", if pass { "PASS" } else { "FAIL" }, &task.id[..8]);
    println!("  task:       {}\n  signals:    {detail}\n  confidence: {confidence}", task.name);
    if !pass { std::process::exit(1); }
}

pub fn cmd_eval_schema() {
    println!("{}", serde_json::to_string_pretty(&evidence_schema()).unwrap());
}

// ── Judge breaker ─────────────────────────────────────────────────────────────
//
// `yana-rt eval run` is a regex/keyword heuristic over hand-typed evidence
// text — it can be fooled by evidence that merely *mentions* the right
// words. `eval judge` asks an LLM for a second opinion instead. This
// breaker exists so a task stuck failing judge doesn't get re-judged on
// every retry forever — same 60s -> 300s -> 1800s escalating-cooldown shape
// as `chat/circuit_breaker.rs`'s `CircuitBreaker`, but reimplemented on
// plain persisted fields (not that struct) because a `Task` round-trips
// through `tasks.json` across separate `yana-rt` process invocations —
// there's no long-lived process here to hold an in-memory breaker instance
// between calls the way a single chat session does.

const JUDGE_MAX_ATTEMPTS: u32 = 5;
const JUDGE_COOLDOWN_INITIAL_SECS: i64 = 60;
const JUDGE_COOLDOWN_MAX_SECS: i64 = 1800;
const JUDGE_COOLDOWN_MULTIPLIER: i64 = 5;

pub enum BreakerState {
    Closed,
    Open { remaining_secs: i64 },
}

/// Cooldown for the current attempt count once it has crossed
/// `JUDGE_MAX_ATTEMPTS` (0 below the threshold — breaker stays closed).
/// Escalates by `JUDGE_COOLDOWN_MULTIPLIER` per attempt past the threshold,
/// capped at `JUDGE_COOLDOWN_MAX_SECS`: attempts 5/6/7/8 -> 60s/300s/1500s/1800s.
fn judge_cooldown_secs(attempts: u32) -> i64 {
    if attempts < JUDGE_MAX_ATTEMPTS { return 0; }
    let escalations = attempts - JUDGE_MAX_ATTEMPTS;
    let mut secs = JUDGE_COOLDOWN_INITIAL_SECS;
    for _ in 0..escalations {
        secs = (secs * JUDGE_COOLDOWN_MULTIPLIER).min(JUDGE_COOLDOWN_MAX_SECS);
    }
    secs
}

pub fn judge_breaker_state(task: &Task) -> BreakerState {
    if task.eval_judge_attempts < JUDGE_MAX_ATTEMPTS {
        return BreakerState::Closed;
    }
    let Some(until_str) = &task.eval_judge_breaker_until else { return BreakerState::Closed; };
    let Ok(until) = DateTime::parse_from_rfc3339(until_str) else { return BreakerState::Closed; };
    let remaining = until.with_timezone(&Utc).signed_duration_since(Utc::now()).num_seconds();
    if remaining > 0 { BreakerState::Open { remaining_secs: remaining } } else { BreakerState::Closed }
}

fn future_ts(secs_from_now: i64) -> String {
    (Utc::now() + Duration::seconds(secs_from_now)).format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// LLM-judge second opinion on a task's evidence. Does not attempt to fix
/// anything — `yana-rt` is a CLI tool, not a coding agent; the calling
/// agent session is the one that acts on a FAIL verdict (see the module
/// header of `chat/mod.rs` for the same "this binary doesn't execute
/// anything on the user's behalf" scope cut applied here to judging).
pub fn cmd_eval_judge(id: String, provider_name: Option<String>, model: Option<String>) {
    let store = load_store();
    let key = match resolve_id_key(&store, &id) {
        Some(k) => k,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    let task = store.tasks.get(&key).unwrap();

    let ev = match &task.evidence {
        Some(e) => e.clone(),
        None => {
            eprintln!("error: no evidence. run: yana-rt task done {} --evidence \"...\"", &task.id[..8]);
            std::process::exit(1);
        }
    };

    if let BreakerState::Open { remaining_secs } = judge_breaker_state(task) {
        eprintln!(
            "✗ judge breaker OPEN  {}\n  failed judge {} times in a row — retry in {}s",
            &task.id[..8], task.eval_judge_attempts, remaining_secs
        );
        std::process::exit(2);
    }

    let provider_name = provider_name.unwrap_or_else(|| "ollama".to_string());
    let provider = match try_select_provider(&provider_name) {
        Ok(p) => p,
        Err(msg) => { eprintln!("error: {msg}"); std::process::exit(1); }
    };
    let model = model.unwrap_or_else(|| provider.default_model().to_string());
    let api_key = if provider.requires_key() {
        match std::env::var(provider.env_var()) {
            Ok(k) if !k.is_empty() => Some(k),
            _ => {
                eprintln!(
                    "error: {} not set — export it, or run with --provider ollama for a local model",
                    provider.env_var()
                );
                std::process::exit(1);
            }
        }
    } else {
        None
    };

    let system = "You are an independent judge reviewing whether evidence \
        genuinely proves a task is complete — not just whether it contains \
        the right keywords. Reply with exactly one line: PASS or FAIL, \
        followed by a short reason on the same line.";
    let user_message = format!(
        "Task: {}\nScope: {}\nEvidence: {}\n\nDoes this evidence genuinely prove the task is done?",
        task.name,
        task.scope.as_deref().unwrap_or("none"),
        ev.raw,
    );

    let response = match ask_once(provider.as_ref(), api_key.as_deref(), &model, system, &user_message) {
        Ok(r) => r,
        Err(e) => { eprintln!("error: judge call failed: {e:#}"); std::process::exit(1); }
    };

    let first_line = response.lines().next().unwrap_or("").trim();
    let verdict = first_line.to_uppercase();
    let pass = verdict.starts_with("PASS");
    let fail = verdict.starts_with("FAIL");
    if !pass && !fail {
        eprintln!("error: judge gave an unparseable verdict: {first_line:?}");
        std::process::exit(1);
    }

    let mut store = store;
    let task = store.tasks.get_mut(&key).unwrap();
    if pass {
        task.eval_judge_attempts = 0;
        task.eval_judge_breaker_until = None;
    } else {
        task.eval_judge_attempts += 1;
        let cooldown = judge_cooldown_secs(task.eval_judge_attempts);
        if cooldown > 0 {
            task.eval_judge_breaker_until = Some(future_ts(cooldown));
        }
    }
    task.updated_at = now();
    let task_name = task.name.clone();
    save_store(&store);

    let icon = if pass { "✓" } else { "✗" };
    println!("{icon} {}  {}", if pass { "PASS" } else { "FAIL" }, &key[..8]);
    println!("  task:    {task_name}\n  verdict: {first_line}");
    if !pass {
        println!("  hint: yana-rt task done {} --evidence \"...\" then retry", &key[..8]);
        std::process::exit(1);
    }
}

#[cfg(test)]
mod judge_breaker_tests {
    use super::*;

    #[test]
    fn cooldown_is_zero_below_threshold() {
        for attempts in 0..JUDGE_MAX_ATTEMPTS {
            assert_eq!(judge_cooldown_secs(attempts), 0, "attempts={attempts}");
        }
    }

    #[test]
    fn cooldown_escalates_and_caps_at_max() {
        // Matches the plan's stated progression: 60s -> 300s -> capped.
        assert_eq!(judge_cooldown_secs(5), 60);
        assert_eq!(judge_cooldown_secs(6), 300);
        assert_eq!(judge_cooldown_secs(7), 1500);
        assert_eq!(judge_cooldown_secs(8), 1800);
        assert_eq!(judge_cooldown_secs(9), 1800, "stays capped, does not overflow");
    }

    fn task_with(attempts: u32, breaker_until: Option<String>) -> Task {
        Task {
            id: "test-id".into(), name: "test".into(), status: TaskStatus::Open,
            scope: None, created_at: now(), updated_at: now(), evidence: None,
            eval_judge_attempts: attempts, eval_judge_breaker_until: breaker_until,
        }
    }

    #[test]
    fn breaker_closed_below_threshold_even_with_future_timestamp() {
        // A future breaker_until with attempts < threshold shouldn't happen
        // in practice (cmd_eval_judge only ever sets one when it sets the
        // other), but the check must not trust breaker_until alone.
        let t = task_with(4, Some(future_ts(120)));
        assert!(matches!(judge_breaker_state(&t), BreakerState::Closed));
    }

    #[test]
    fn breaker_open_at_threshold_with_future_timestamp() {
        let t = task_with(5, Some(future_ts(120)));
        match judge_breaker_state(&t) {
            BreakerState::Open { remaining_secs } => assert!((115..=120).contains(&remaining_secs)),
            BreakerState::Closed => panic!("expected Open"),
        }
    }

    #[test]
    fn breaker_closed_once_timestamp_is_in_the_past() {
        let t = task_with(5, Some(future_ts(-10)));
        assert!(matches!(judge_breaker_state(&t), BreakerState::Closed));
    }

    #[test]
    fn breaker_closed_when_no_timestamp_recorded() {
        let t = task_with(5, None);
        assert!(matches!(judge_breaker_state(&t), BreakerState::Closed));
    }
}
