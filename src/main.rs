use chrono::Utc;
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

// ── CLI ──────────────────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(name = "yamtam-rt", version = "0.5.0", about = "YAMTAM Runtime — task lifecycle & evals")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Task lifecycle — create, track, complete
    Task {
        #[command(subcommand)]
        action: TaskAction,
    },
    /// Evaluate task evidence against schema
    Eval {
        #[command(subcommand)]
        action: EvalAction,
    },
}

#[derive(Subcommand)]
enum TaskAction {
    /// Create a new task
    Create {
        name: String,
        #[arg(long)]
        scope: Option<String>,
    },
    /// List all tasks
    List,
    /// Mark a task as done with evidence
    Done {
        id: String,
        #[arg(long)]
        evidence: String,
    },
    /// Show task details
    Status { id: String },
    /// Remove a task
    Drop { id: String },
}

#[derive(Subcommand)]
enum EvalAction {
    /// Validate task evidence against evidence schema
    Run { id: String },
    /// Show the evidence schema
    Schema,
}

// ── Data model ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
enum TaskStatus {
    Open,
    InProgress,
    Done,
    Blocked,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Open => write!(f, "open"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Done => write!(f, "done"),
            TaskStatus::Blocked => write!(f, "blocked"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Evidence {
    raw: String,
    signals: EvidenceSignals,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct EvidenceSignals {
    tests_passed: Option<u32>,
    tests_failed: Option<u32>,
    build_ok: bool,
    coverage_pct: Option<f32>,
    manual_note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Task {
    id: String,
    name: String,
    status: TaskStatus,
    scope: Option<String>,
    created_at: String,
    updated_at: String,
    evidence: Option<Evidence>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct TaskStore {
    tasks: HashMap<String, Task>,
}

// ── Storage ───────────────────────────────────────────────────────────────────

fn store_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join(".yamtam").join("tasks.json")
}

fn load_store() -> TaskStore {
    let path = store_path();
    if !path.exists() {
        return TaskStore::default();
    }
    let data = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

fn save_store(store: &TaskStore) {
    let path = store_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(store).expect("serialize failed");
    fs::write(&path, json).expect("write failed");
}

fn resolve_id<'a>(store: &'a TaskStore, prefix: &str) -> Option<&'a Task> {
    let matches: Vec<_> = store
        .tasks
        .values()
        .filter(|t| t.id.starts_with(prefix))
        .collect();
    if matches.len() == 1 { Some(matches[0]) } else { None }
}

fn resolve_id_key(store: &TaskStore, prefix: &str) -> Option<String> {
    let matches: Vec<String> = store
        .tasks
        .keys()
        .filter(|k| k.starts_with(prefix))
        .cloned()
        .collect();
    if matches.len() == 1 { Some(matches[0].clone()) } else { None }
}

fn now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

// ── Evidence parsing ──────────────────────────────────────────────────────────

fn find_number_before(text: &str, keyword: &str) -> Option<u32> {
    text.find(keyword).and_then(|pos| {
        text[..pos]
            .split_whitespace()
            .last()
            .and_then(|s| s.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().ok())
    })
}

fn find_coverage(text: &str) -> Option<f32> {
    // "87% coverage" or "coverage 87%"
    for part in text.split_whitespace() {
        if part.ends_with('%') {
            if let Ok(n) = part.trim_end_matches('%').parse::<f32>() {
                return Some(n);
            }
        }
    }
    None
}

fn parse_evidence(raw: &str) -> EvidenceSignals {
    let lower = raw.to_lowercase();
    let mut sig = EvidenceSignals::default();

    sig.tests_passed = find_number_before(&lower, "tests passed")
        .or_else(|| find_number_before(&lower, "test passed"))
        .or_else(|| find_number_before(&lower, "passed"));

    sig.tests_failed = find_number_before(&lower, "tests failed")
        .or_else(|| find_number_before(&lower, "test failed")
        .or_else(|| find_number_before(&lower, "failed")));

    sig.build_ok = lower.contains("exit 0")
        || lower.contains("build success")
        || lower.contains("0 error")
        || lower.contains("build ok");

    sig.coverage_pct = find_coverage(&lower);

    if sig.tests_passed.is_none() && !sig.build_ok && sig.coverage_pct.is_none() {
        sig.manual_note = Some(raw.to_string());
    }

    sig
}

// ── Eval ─────────────────────────────────────────────────────────────────────

fn evidence_schema() -> serde_json::Value {
    serde_json::json!({
        "title": "YAMTAM Evidence Schema v1",
        "required_one_of": ["tests_passed", "build_ok", "coverage_pct", "manual_note"],
        "rules": {
            "tests_failed": "must be 0 or absent",
            "coverage_pct": "warn if below 80"
        },
        "confidence_levels": {
            "tests_passed + build_ok": "HIGH",
            "tests_passed only":       "MEDIUM",
            "build_ok only":           "MEDIUM",
            "coverage_pct only":       "MEDIUM",
            "manual_note only":        "LOW"
        }
    })
}

fn eval_evidence(ev: &Evidence) -> (bool, String, &'static str) {
    let sig = &ev.signals;

    if sig.tests_failed.map(|n| n > 0).unwrap_or(false) {
        return (false, format!("{} tests failed", sig.tests_failed.unwrap()), "FAIL");
    }

    let has_signal = sig.tests_passed.is_some()
        || sig.build_ok
        || sig.coverage_pct.is_some()
        || sig.manual_note.is_some();

    if !has_signal {
        return (false, "no evidence signals detected".into(), "FAIL");
    }

    let confidence = if sig.tests_passed.is_some() && sig.build_ok {
        "HIGH"
    } else if sig.tests_passed.is_some() || sig.build_ok || sig.coverage_pct.is_some() {
        "MEDIUM"
    } else {
        "LOW"
    };

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

// ── Command handlers ──────────────────────────────────────────────────────────

fn cmd_task_create(name: String, scope: Option<String>) {
    let mut store = load_store();
    let id = Uuid::new_v4().to_string();
    let ts = now();

    let task = Task {
        id: id.clone(),
        name: name.clone(),
        status: TaskStatus::Open,
        scope: scope.clone(),
        created_at: ts.clone(),
        updated_at: ts,
        evidence: None,
    };

    store.tasks.insert(id.clone(), task);
    save_store(&store);

    println!("✓ created  {}", &id[..8]);
    println!("  name:  {name}");
    if let Some(s) = scope { println!("  scope: {s}"); }
}

fn cmd_task_list() {
    let store = load_store();
    if store.tasks.is_empty() {
        println!("No tasks. yamtam-rt task create \"description\"");
        return;
    }
    let mut tasks: Vec<&Task> = store.tasks.values().collect();
    tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at));

    println!("{:<10} {:<12} {}", "ID", "STATUS", "NAME");
    println!("{}", "─".repeat(55));
    for t in tasks {
        let icon = match t.status {
            TaskStatus::Open       => "○",
            TaskStatus::InProgress => "◉",
            TaskStatus::Done       => "✓",
            TaskStatus::Blocked    => "✗",
        };
        println!("{:<10} {icon} {:<10} {}", &t.id[..8], t.status.to_string(), t.name);
    }
}

fn cmd_task_done(id: String, evidence: String) {
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

    println!("✓ done  {}", &key[..8]);
    println!("  evidence: {evidence}");
    println!("  run: yamtam-rt eval run {}", &key[..8]);
}

fn cmd_task_status(id: String) {
    let store = load_store();
    let task = match resolve_id(&store, &id) {
        Some(t) => t,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    println!("Task {}", &task.id[..8]);
    println!("  name:    {}", task.name);
    println!("  status:  {}", task.status);
    println!("  created: {}", task.created_at);
    if let Some(s) = &task.scope { println!("  scope:   {s}"); }
    if let Some(ev) = &task.evidence { println!("  evidence: {}", ev.raw); }
}

fn cmd_task_drop(id: String) {
    let mut store = load_store();
    let key = match resolve_id_key(&store, &id) {
        Some(k) => k,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    store.tasks.remove(&key);
    save_store(&store);
    println!("✓ dropped {}", &key[..8]);
}

fn cmd_eval_run(id: String) {
    let store = load_store();
    let task = match resolve_id(&store, &id) {
        Some(t) => t,
        None => { eprintln!("error: no task matches '{id}'"); std::process::exit(1); }
    };
    let ev = match &task.evidence {
        Some(e) => e,
        None => {
            eprintln!("error: no evidence. run: yamtam-rt task done {} --evidence \"...\"", &task.id[..8]);
            std::process::exit(1);
        }
    };

    let (pass, detail, confidence) = eval_evidence(ev);
    let icon = if pass { "✓" } else { "✗" };
    let verdict = if pass { "PASS" } else { "FAIL" };

    println!("{icon} {verdict}  {}", &task.id[..8]);
    println!("  task:       {}", task.name);
    println!("  signals:    {detail}");
    println!("  confidence: {confidence}");

    if !pass { std::process::exit(1); }
}

fn cmd_eval_schema() {
    println!("{}", serde_json::to_string_pretty(&evidence_schema()).unwrap());
}

// ── main ─────────────────────────────────────────────────────────────────────

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Commands::Task { action } => match action {
            TaskAction::Create { name, scope } => cmd_task_create(name, scope),
            TaskAction::List                   => cmd_task_list(),
            TaskAction::Done { id, evidence }  => cmd_task_done(id, evidence),
            TaskAction::Status { id }          => cmd_task_status(id),
            TaskAction::Drop { id }            => cmd_task_drop(id),
        },
        Commands::Eval { action } => match action {
            EvalAction::Run { id } => cmd_eval_run(id),
            EvalAction::Schema     => cmd_eval_schema(),
        },
    }
}
