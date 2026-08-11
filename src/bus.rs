use crate::{cost, memory};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use uuid::Uuid;

fn now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

// ── Data model ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BusEvent {
    pub id: String,
    pub ts: String,
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub payload: serde_json::Value,
    pub reply_to: Option<String>,
}

// ── Storage ───────────────────────────────────────────────────────────────────

fn bus_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".yana-ai")
        .join("bus.jsonl")
}

fn bus_append(event: &BusEvent) {
    let path = bus_path();
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).ok();
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

// ── Handlers ──────────────────────────────────────────────────────────────────

pub fn cmd_bus_emit(from: String, to: String, event_type: String, payload: String) {
    let value: serde_json::Value =
        serde_json::from_str(&payload).unwrap_or(serde_json::Value::String(payload));
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
    match cost::track_from_payload(&event_type, &event.payload) {
        Ok(true) => println!("  cost tracked automatically"),
        Ok(false) => {}
        Err(error) => eprintln!("[cost] automatic accounting failed: {error:#}"),
    }
    memory::l3_append(&memory::L3Fact {
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
    });
    println!(
        "✓ emitted  {}\n  from: {from}  →  to: {to}  type: {event_type}",
        &event.id[..8]
    );
}

pub fn cmd_bus_read(
    agent: Option<String>,
    since: Option<String>,
    reply_to: Option<String>,
    last: usize,
) {
    let events = bus_read_all();
    let filtered: Vec<&BusEvent> = events
        .iter()
        .filter(|e| {
            agent
                .as_ref()
                .map(|a| e.from == *a || e.to == *a || e.to == "*")
                .unwrap_or(true)
        })
        .filter(|e| {
            since
                .as_ref()
                .map(|s| e.ts.as_str() >= s.as_str())
                .unwrap_or(true)
        })
        .filter(|e| {
            reply_to
                .as_ref()
                .map(|r| {
                    e.reply_to
                        .as_deref()
                        .map(|rt| rt.starts_with(r.as_str()))
                        .unwrap_or(false)
                })
                .unwrap_or(true)
        })
        .collect();
    let shown = &filtered[filtered.len().saturating_sub(last)..];
    if shown.is_empty() {
        println!("No events.");
        return;
    }
    println!(
        "{:<10} {:<8} {:<16} {:<16} TYPE",
        "ID", "TIME", "FROM", "TO"
    );
    println!("{}", "─".repeat(70));
    for e in shown {
        println!(
            "{:<10} {:<8} {:<16} {:<16} {}",
            &e.id[..8],
            &e.ts[11..16],
            e.from,
            e.to,
            e.event_type
        );
        if e.payload != serde_json::Value::Null {
            println!(
                "           payload: {}",
                serde_json::to_string(&e.payload).unwrap_or_default()
            );
        }
        if let Some(ref r) = e.reply_to {
            println!("           reply_to: {}", &r[..8.min(r.len())]);
        }
    }
}

pub fn cmd_bus_reply(original_id: String, from: String, payload: String) {
    let events = bus_read_all();
    let (to, orig_full_id) = match events.iter().find(|e| e.id.starts_with(&original_id)) {
        Some(e) => (e.from.clone(), e.id.clone()),
        None => {
            eprintln!("error: no event matches '{original_id}'");
            std::process::exit(1);
        }
    };
    let value: serde_json::Value =
        serde_json::from_str(&payload).unwrap_or(serde_json::Value::String(payload));
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
    println!(
        "✓ replied  {}\n  from: {from}  →  to: {to}  (reply_to: {})",
        &event.id[..8],
        &original_id
    );
}

pub fn cmd_bus_inbox(agent: String) {
    let events = bus_read_all();
    let inbox: Vec<&BusEvent> = events
        .iter()
        .filter(|e| e.to == agent || e.to == "*")
        .collect();
    if inbox.is_empty() {
        println!("Inbox empty for '{agent}'.");
        return;
    }
    println!(
        "Inbox: {agent}  ({} messages)\n{}",
        inbox.len(),
        "─".repeat(60)
    );
    for e in inbox {
        println!(
            "[{}] {} from {}  type: {}",
            &e.id[..8],
            &e.ts[11..16],
            e.from,
            e.event_type
        );
        println!(
            "  {}",
            serde_json::to_string(&e.payload).unwrap_or_default()
        );
    }
}
