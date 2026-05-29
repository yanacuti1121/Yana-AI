mod config;
mod cost;
mod plugin;

use chrono::Utc;
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
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
    /// Agent message bus — emit, read, reply, inbox
    Bus {
        #[command(subcommand)]
        action: BusAction,
    },
    /// L3 shared memory — workspace-level facts across sessions and agents
    Memory {
        #[command(subcommand)]
        action: MemoryAction,
    },
    /// Configuration — load/init yamtam settings for any repo
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
    /// Plugin hooks — register custom guards without forking
    Plugin {
        #[command(subcommand)]
        action: PluginAction,
    },
    /// Cost dashboard — token usage and spend tracking
    Cost {
        #[command(subcommand)]
        action: CostAction,
    },
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Show effective config for a repo
    Show {
        #[arg(long, default_value = ".")] dir: String,
    },
    /// Generate default .yamtam/settings.json
    Init {
        #[arg(long, default_value = ".")] dir: String,
    },
    /// Set a config key
    Set {
        key: String,
        value: String,
        #[arg(long, default_value = ".")] dir: String,
    },
}

#[derive(Subcommand)]
enum PluginAction {
    /// List registered plugins
    List,
    /// Register a custom guard script
    Add {
        name: String,
        script: String,
        #[arg(long, default_value = "")] description: String,
    },
    /// Remove a plugin
    Remove { name: String },
    /// Enable a plugin
    Enable { name: String },
    /// Disable a plugin
    Disable { name: String },
    /// Run a plugin
    Run {
        name: String,
        #[arg(long)] input: Option<String>,
    },
}

#[derive(Subcommand)]
enum CostAction {
    /// Show cost summary
    Show,
    /// Log a token usage entry
    Log {
        task: String,
        tier: String,
        model: String,
        input_tokens: u64,
        output_tokens: u64,
        #[arg(long)] duration_ms: Option<u64>,
    },
    /// Breakdown by tier, model, or task
    Breakdown {
        #[arg(default_value = "tier")] by: String,
    },
}

#[derive(Subcommand)]
enum MemoryAction {
    /// Store a fact in L3
    Store {
        key: String,
        value: String,
        #[arg(long)]
        tag: Vec<String>,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long, default_value = "medium")]
        confidence: String,
        #[arg(long, default_value = "both")]
        scope: String,
    },
    /// Get a fact by key
    Get { key: String },
    /// List facts
    List {
        #[arg(long)] tag: Option<String>,
        #[arg(long)] agent: Option<String>,
        #[arg(long, default_value_t = 20)] last: usize,
    },
    /// Promote a fact from L3 → L1 (writes .md file)
    Promote {
        key: String,
        #[arg(long, default_value = "memory/L1_atomic")]
        l1_dir: String,
    },
    /// Import L2 session facts into L3
    Import {
        #[arg(long, default_value = "memory/L2_session")]
        l2_dir: String,
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

#[derive(Subcommand)]
enum BusAction {
    /// Emit an event onto the bus
    Emit {
        from: String,
        to: String,
        #[arg(name = "type")]
        event_type: String,
        payload: String,
    },
    /// Read events from the bus
    Read {
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        since: Option<String>,
        #[arg(long)]
        reply_to: Option<String>,
        #[arg(long, default_value_t = 20)]
        last: usize,
    },
    /// Reply to an existing event
    Reply {
        original_id: String,
        from: String,
        payload: String,
    },
    /// Show inbox for an agent (messages addressed to it)
    Inbox { agent: String },
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

// ── L3 Memory data model ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct L3Fact {
    id: String,
    key: String,
    value: String,
    tags: Vec<String>,
    agent: Option<String>,
    confidence: String,
    scope: String,
    created_at: String,
    updated_at: String,
    promoted: bool,
}

fn l3_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join(".yamtam").join("l3.jsonl")
}

fn l3_read_all() -> Vec<L3Fact> {
    let path = l3_path();
    if !path.exists() { return vec![]; }
    fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn l3_write_all(facts: &[L3Fact]) {
    let path = l3_path();
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).ok(); }
    let content: String = facts.iter()
        .map(|f| serde_json::to_string(f).unwrap())
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&path, format!("{content}\n")).expect("write l3.jsonl failed");
}

fn l3_append(fact: &L3Fact) {
    let path = l3_path();
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).ok(); }
    let line = serde_json::to_string(fact).expect("serialize failed");
    let mut file = fs::OpenOptions::new().create(true).append(true).open(&path)
        .expect("open l3.jsonl failed");
    writeln!(file, "{line}").expect("write failed");
}

fn parse_frontmatter_field(content: &str, field: &str) -> Option<String> {
    let prefix = format!("{field}:");
    content.lines()
        .find(|l| l.trim_start().starts_with(&prefix))
        .map(|l| l.trim_start().trim_start_matches(&prefix).trim().trim_matches('"').to_string())
        .filter(|s| !s.is_empty())
}

// ── Bus data model ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BusEvent {
    id: String,
    ts: String,
    from: String,
    to: String,
    #[serde(rename = "type")]
    event_type: String,
    payload: serde_json::Value,
    reply_to: Option<String>,
}

// ── Storage ───────────────────────────────────────────────────────────────────

fn bus_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join(".yamtam").join("bus.jsonl")
}

fn bus_append(event: &BusEvent) {
    let path = bus_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let line = serde_json::to_string(event).expect("serialize failed");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .expect("open bus.jsonl failed");
    writeln!(file, "{line}").expect("write failed");
}

fn bus_read_all() -> Vec<BusEvent> {
    let path = bus_path();
    if !path.exists() { return vec![]; }
    fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

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

// ── Bus handlers ──────────────────────────────────────────────────────────────

fn cmd_bus_emit(from: String, to: String, event_type: String, payload: String) {
    let value: serde_json::Value = serde_json::from_str(&payload)
        .unwrap_or(serde_json::Value::String(payload));
    let event = BusEvent {
        id: Uuid::new_v4().to_string(),
        ts: now(),
        from: from.clone(),
        to: to.clone(),
        event_type: event_type.clone(),
        payload: value,
        reply_to: None,
    };
    bus_append(&event);
    // Auto-log to L3 for persistent cross-session audit
    let fact = L3Fact {
        id: Uuid::new_v4().to_string(),
        key: format!("bus:{}", &event.id[..8]),
        value: serde_json::to_string(&event).unwrap_or_default(),
        tags: vec!["bus".into(), event_type.clone()],
        agent: Some(from.clone()),
        confidence: "high".into(),
        scope: "both".into(),
        created_at: event.ts.clone(),
        updated_at: event.ts.clone(),
        promoted: false,
    };
    l3_append(&fact);
    println!("✓ emitted  {}", &event.id[..8]);
    println!("  from: {from}  →  to: {to}  type: {event_type}");
}

fn cmd_bus_read(agent: Option<String>, since: Option<String>, reply_to: Option<String>, last: usize) {
    let events = bus_read_all();
    let filtered: Vec<&BusEvent> = events.iter()
        .filter(|e| {
            if let Some(ref a) = agent {
                e.from == *a || e.to == *a || e.to == "*"
            } else { true }
        })
        .filter(|e| {
            if let Some(ref s) = since { e.ts.as_str() >= s.as_str() } else { true }
        })
        .filter(|e| {
            if let Some(ref r) = reply_to {
                e.reply_to.as_deref().map(|rt| rt.starts_with(r.as_str())).unwrap_or(false)
            } else { true }
        })
        .collect();

    let start = filtered.len().saturating_sub(last);
    let shown = &filtered[start..];

    if shown.is_empty() {
        println!("No events.");
        return;
    }
    println!("{:<10} {:<8} {:<16} {:<16} {}", "ID", "TIME", "FROM", "TO", "TYPE");
    println!("{}", "─".repeat(70));
    for e in shown {
        let t = &e.ts[11..16]; // HH:MM
        println!("{:<10} {:<8} {:<16} {:<16} {}", &e.id[..8], t, e.from, e.to, e.event_type);
        if e.payload != serde_json::Value::Null {
            println!("           payload: {}", serde_json::to_string(&e.payload).unwrap_or_default());
        }
        if let Some(ref r) = e.reply_to {
            println!("           reply_to: {}", &r[..8.min(r.len())]);
        }
    }
}

fn cmd_bus_reply(original_id: String, from: String, payload: String) {
    let events = bus_read_all();
    let original = events.iter().find(|e| e.id.starts_with(&original_id));
    let (to, orig_full_id) = match original {
        Some(e) => (e.from.clone(), e.id.clone()),
        None => {
            eprintln!("error: no event matches '{original_id}'");
            std::process::exit(1);
        }
    };
    let value: serde_json::Value = serde_json::from_str(&payload)
        .unwrap_or(serde_json::Value::String(payload));
    let event = BusEvent {
        id: Uuid::new_v4().to_string(),
        ts: now(),
        from: from.clone(),
        to: to.clone(),
        event_type: "reply".into(),
        payload: value,
        reply_to: Some(orig_full_id),
    };
    bus_append(&event);
    println!("✓ replied  {}", &event.id[..8]);
    println!("  from: {from}  →  to: {to}  (reply_to: {})", &original_id);
}

fn cmd_bus_inbox(agent: String) {
    let events = bus_read_all();
    let inbox: Vec<&BusEvent> = events.iter()
        .filter(|e| e.to == agent || e.to == "*")
        .collect();
    if inbox.is_empty() {
        println!("Inbox empty for '{agent}'.");
        return;
    }
    println!("Inbox: {agent}  ({} messages)", inbox.len());
    println!("{}", "─".repeat(60));
    for e in inbox {
        let t = &e.ts[11..16];
        println!("[{}] {} from {}  type: {}", &e.id[..8], t, e.from, e.event_type);
        println!("  {}", serde_json::to_string(&e.payload).unwrap_or_default());
    }
}

// ── Memory handlers ───────────────────────────────────────────────────────────

fn cmd_memory_store(key: String, value: String, tags: Vec<String>, agent: Option<String>, confidence: String, scope: String) {
    let mut facts = l3_read_all();
    if let Some(pos) = facts.iter().position(|f| f.key == key) {
        facts[pos].value = value; facts[pos].tags = tags; facts[pos].agent = agent;
        facts[pos].confidence = confidence; facts[pos].scope = scope;
        facts[pos].updated_at = now(); facts[pos].promoted = false;
        let fid = facts[pos].id[..8].to_string();
        l3_write_all(&facts);
        println!("✓ updated  L3:{fid}\n  key: {key}");
    } else {
        let fact = L3Fact {
            id: Uuid::new_v4().to_string(), key: key.clone(), value,
            tags, agent, confidence, scope,
            created_at: now(), updated_at: now(), promoted: false,
        };
        l3_append(&fact);
        println!("✓ stored   L3:{}\n  key: {key}", &fact.id[..8]);
    }
}

fn cmd_memory_get(key: String) {
    let facts = l3_read_all();
    let found: Vec<&L3Fact> = facts.iter()
        .filter(|f| f.key == key || f.key.starts_with(&key)).collect();
    if found.is_empty() { println!("Not found: '{key}'"); return; }
    for f in found {
        let p = if f.promoted { " [→L1]" } else { "" };
        println!("L3:{}{}\n  key:        {}\n  value:      {}\n  confidence: {}  scope: {}",
            &f.id[..8], p, f.key, f.value, f.confidence, f.scope);
        if !f.tags.is_empty() { println!("  tags:       {}", f.tags.join(", ")); }
        if let Some(ref a) = f.agent { println!("  agent:      {a}"); }
        println!("  updated:    {}", f.updated_at);
    }
}

fn cmd_memory_list(tag: Option<String>, agent: Option<String>, last: usize) {
    let facts = l3_read_all();
    let filtered: Vec<&L3Fact> = facts.iter()
        .filter(|f| tag.as_ref().map(|t| f.tags.iter().any(|ft| ft == t)).unwrap_or(true))
        .filter(|f| agent.as_ref().map(|a| f.agent.as_deref() == Some(a)).unwrap_or(true))
        .collect();
    let shown = &filtered[filtered.len().saturating_sub(last)..];
    if shown.is_empty() { println!("No facts in L3."); return; }
    println!("{:<10} {:<3} {:<28} {}", "ID", "P", "KEY", "VALUE");
    println!("{}", "─".repeat(72));
    for f in shown {
        let p = if f.promoted { "✓" } else { " " };
        let k = if f.key.len() > 26 { format!("{}…", &f.key[..25]) } else { f.key.clone() };
        let v = if f.value.len() > 28 { format!("{}…", &f.value[..27]) } else { f.value.clone() };
        println!("{:<10} {p}   {:<28} {}", &f.id[..8], k, v);
    }
    println!("\n{}/{} facts shown", shown.len(), facts.len());
}

fn cmd_memory_promote(key: String, l1_dir: String) {
    let mut facts = l3_read_all();
    let pos = match facts.iter().position(|f| f.key == key) {
        Some(i) => i,
        None => { eprintln!("error: key '{key}' not in L3"); std::process::exit(1); }
    };
    // Clone fields before mutating
    let fid        = facts[pos].id.clone();
    let fvalue     = facts[pos].value.clone();
    let fagent     = facts[pos].agent.clone();
    let fconf      = facts[pos].confidence.clone();
    let fscope     = facts[pos].scope.clone();
    let ftags      = facts[pos].tags.clone();
    let fupdated   = facts[pos].updated_at.clone();

    let l1_path = PathBuf::from(&l1_dir);
    fs::create_dir_all(&l1_path).ok();
    let slug: String = key.chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect();
    let filepath = l1_path.join(format!("{slug}.md"));
    let tags_yaml = if ftags.is_empty() { String::new() }
        else { format!("\ntags:       [{}]", ftags.join(", ")) };
    let content = format!(
        "---\nid:         {fid}\ntype:       fact\nstatement:  {fvalue}\nsource:     l3-promote:{}\nconfidence: {fconf}\nscope:      {fscope}{tags_yaml}\n---\n\n{fvalue}\n",
        fagent.as_deref().unwrap_or("unknown"),
    );
    fs::write(&filepath, content).expect("write L1 file failed");
    let mut idx_file = fs::OpenOptions::new().create(true).append(true)
        .open(l1_path.join("INDEX.md")).expect("open INDEX.md failed");
    writeln!(idx_file, "| {} | {key} | {fconf} | {fupdated} |", &fid[..8])
        .expect("write INDEX.md failed");
    facts[pos].promoted = true;
    facts[pos].updated_at = now();
    l3_write_all(&facts);
    println!("✓ promoted L3:{} → L1\n  file: {}", &fid[..8], filepath.display());
}

fn cmd_memory_import(l2_dir: String) {
    let dir = PathBuf::from(&l2_dir);
    if !dir.exists() { eprintln!("error: L2 dir not found: {l2_dir}"); std::process::exit(1); }
    let mut imported = 0;
    let existing_keys: Vec<String> = l3_read_all().into_iter().map(|f| f.key).collect();
    for entry in fs::read_dir(&dir).expect("read L2 dir").filter_map(|e| e.ok()) {
        let path = entry.path();
        let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        if !path.extension().map(|x| x == "md").unwrap_or(false) { continue; }
        if matches!(stem.as_str(), "SCHEMA" | "INDEX") { continue; }
        if existing_keys.contains(&stem) { continue; }
        let content = fs::read_to_string(&path).unwrap_or_default();
        let statement = match parse_frontmatter_field(&content, "statement") {
            Some(s) => s, None => continue,
        };
        let confidence = parse_frontmatter_field(&content, "confidence").unwrap_or_else(|| "low".into());
        let source = parse_frontmatter_field(&content, "source").unwrap_or_else(|| "l2-import".into());
        let fact = L3Fact {
            id: Uuid::new_v4().to_string(), key: stem, value: statement,
            tags: vec!["l2-import".into()], agent: Some(source),
            confidence, scope: "both".into(),
            created_at: now(), updated_at: now(), promoted: false,
        };
        l3_append(&fact);
        imported += 1;
    }
    println!("✓ imported {imported} facts L2 → L3");
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
        Commands::Config { action } => match action {
            ConfigAction::Show { dir }           => config::cmd_config_show(dir),
            ConfigAction::Init { dir }           => config::cmd_config_init(dir),
            ConfigAction::Set { key, value, dir } => config::cmd_config_set(dir, key, value),
        },
        Commands::Plugin { action } => match action {
            PluginAction::List                   => plugin::cmd_plugin_list(),
            PluginAction::Add { name, script, description } =>
                plugin::cmd_plugin_add(name, script, description),
            PluginAction::Remove { name }        => plugin::cmd_plugin_remove(name),
            PluginAction::Enable  { name }       => plugin::cmd_plugin_toggle(name, true),
            PluginAction::Disable { name }       => plugin::cmd_plugin_toggle(name, false),
            PluginAction::Run { name, input }    => plugin::cmd_plugin_run(name, input),
        },
        Commands::Cost { action } => match action {
            CostAction::Show                     => cost::cmd_cost_show(),
            CostAction::Log { task, tier, model, input_tokens, output_tokens, duration_ms } =>
                cost::cmd_cost_log(task, tier, model, input_tokens, output_tokens, duration_ms),
            CostAction::Breakdown { by }         => cost::cmd_cost_breakdown(by),
        },
        Commands::Memory { action } => match action {
            MemoryAction::Store { key, value, tag, agent, confidence, scope } =>
                cmd_memory_store(key, value, tag, agent, confidence, scope),
            MemoryAction::Get { key } => cmd_memory_get(key),
            MemoryAction::List { tag, agent, last } => cmd_memory_list(tag, agent, last),
            MemoryAction::Promote { key, l1_dir } => cmd_memory_promote(key, l1_dir),
            MemoryAction::Import { l2_dir } => cmd_memory_import(l2_dir),
        },
        Commands::Bus { action } => match action {
            BusAction::Emit { from, to, event_type, payload } =>
                cmd_bus_emit(from, to, event_type, payload),
            BusAction::Read { agent, since, reply_to, last } =>
                cmd_bus_read(agent, since, reply_to, last),
            BusAction::Reply { original_id, from, payload } =>
                cmd_bus_reply(original_id, from, payload),
            BusAction::Inbox { agent } =>
                cmd_bus_inbox(agent),
        },
    }
}
