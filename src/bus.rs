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

// ── Cross-Session Peer Coordination (Wave 3: Bounded 3-Hop Auto-Send) ────────

/// Hard ceiling on consecutive automated cross-session peer replies without
/// fresh human input (anti-infinite-ping-pong circuit breaker).
pub const MAX_AUTO_HOPS: u32 = 3;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct PeerSession {
    pub session_id: String,
    pub name: String,
    pub pid: u32,
    pub cwd: String,
    pub registered_at: String,
}

fn peers_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".yana-ai")
        .join("peers.json")
}

fn peers_read_all() -> Vec<PeerSession> {
    let path = peers_path();
    if !path.exists() {
        return Vec::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn peers_write_all(peers: &[PeerSession]) {
    let path = peers_path();
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).ok();
    }
    let json = serde_json::to_string_pretty(peers).expect("serialize peers");
    fs::write(&path, json).expect("write peers.json");
}

pub fn check_auto_hop_budget(auto_hop: u32) -> Result<u32, String> {
    if auto_hop > MAX_AUTO_HOPS {
        return Err(format!(
            "cross-session auto-hop limit exceeded (hop {auto_hop} > MAX_AUTO_HOPS={MAX_AUTO_HOPS}) — human input required before continuing peer loop"
        ));
    }
    Ok(auto_hop)
}

pub fn cmd_bus_register_peer(session_id: String, name: String) {
    let mut peers = peers_read_all();
    peers.retain(|p| p.session_id != session_id && p.name != name);
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .to_string_lossy()
        .to_string();
    peers.push(PeerSession {
        session_id: session_id.clone(),
        name: name.clone(),
        pid: std::process::id(),
        cwd,
        registered_at: now(),
    });
    peers_write_all(&peers);
    println!("✓ peer registered: {name} (session: {session_id})");
}

pub fn cmd_bus_peers(as_json: bool) {
    let peers = peers_read_all();
    if as_json {
        println!("{}", serde_json::to_string_pretty(&peers).unwrap());
        return;
    }
    if peers.is_empty() {
        println!("No active peer sessions registered.");
        return;
    }
    println!("{:<18} {:<24} {:<10} CWD", "NAME", "SESSION_ID", "PID");
    println!("{}", "─".repeat(72));
    for p in peers {
        println!(
            "{:<18} {:<24} {:<10} {}",
            p.name, p.session_id, p.pid, p.cwd
        );
    }
}

pub fn cmd_bus_send_peer(from: String, to: String, message: String, auto_hop: u32) {
    if let Err(err) = check_auto_hop_budget(auto_hop) {
        eprintln!("error: {err}");
        std::process::exit(2);
    }
    let payload = serde_json::json!({
        "message": message,
        "auto_hop": auto_hop,
        "max_auto_hops": MAX_AUTO_HOPS,
    });
    let event = BusEvent {
        id: Uuid::new_v4().to_string(),
        ts: now(),
        from: from.clone(),
        to: to.clone(),
        event_type: "peer_message".into(),
        payload,
        reply_to: None,
    };
    bus_append(&event);
    println!(
        "✓ peer message sent  {}  ({from} → {to}, hop {auto_hop}/{MAX_AUTO_HOPS})",
        &event.id[..8]
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_hop_budget_allows_up_to_three_and_blocks_fourth() {
        for hop in 0..=MAX_AUTO_HOPS {
            assert_eq!(check_auto_hop_budget(hop), Ok(hop));
        }
        let err = check_auto_hop_budget(MAX_AUTO_HOPS + 1).unwrap_err();
        assert!(err.contains("MAX_AUTO_HOPS=3"));
    }
}
