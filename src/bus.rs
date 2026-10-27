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

fn peers_write_all(peers: &[PeerSession]) -> Result<(), String> {
    let path = peers_path();
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| format!("create peers dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(peers).map_err(|e| format!("serialize peers: {e}"))?;
    let tmp = path.with_extension(format!("json.tmp.{}", std::process::id()));
    fs::write(&tmp, json).map_err(|e| format!("write temp peers.json: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("publish peers.json: {e}"))?;
    Ok(())
}

/// Computes the next consecutive automated hop count (1-based) between `from`
/// and `to` from the durable bus ledger (`events`), counting trailing
/// `peer_message` events between `{from, to}` since the most recent non-peer
/// (or human-reset) event involving either participant.
///
/// The effective hop is `max(caller_supplied_hop, ledger_derived_hop)`, so a
/// caller passing `--auto-hop 0` in a loop still increments `1 -> 2 -> 3` and
/// is hard-blocked on the 4th consecutive send (`> MAX_AUTO_HOPS`).
pub fn compute_next_peer_hop(
    events: &[BusEvent],
    from: &str,
    to: &str,
    caller_auto_hop: u32,
) -> u32 {
    let mut consecutive = 0u32;
    for ev in events.iter().rev() {
        let involves_pair =
            (ev.from == from && ev.to == to) || (ev.from == to && ev.to == from);
        if !involves_pair {
            continue;
        }
        if ev.event_type == "peer_message" {
            consecutive = consecutive.saturating_add(1);
        } else {
            // Any non-`peer_message` event between the pair resets the automated chain
            break;
        }
    }
    let ledger_hop = consecutive.saturating_add(1);
    caller_auto_hop.max(ledger_hop)
}

/// Validates a 1-based peer hop number against `MAX_AUTO_HOPS = 3`
/// (hops `1..=3` are permitted = at most 3 automated sends; hop `0` is
/// normalized to `1`; hop `4+` is rejected).
pub fn check_auto_hop_budget(auto_hop: u32) -> Result<u32, String> {
    let effective = auto_hop.max(1);
    if effective > MAX_AUTO_HOPS {
        return Err(format!(
            "cross-session auto-hop limit exceeded (hop {effective} > MAX_AUTO_HOPS={MAX_AUTO_HOPS}) — human input required before continuing peer loop"
        ));
    }
    Ok(effective)
}

pub fn cmd_bus_register_peer(session_id: String, name: String, force: bool) {
    let mut peers = peers_read_all();
    if let Some(conflict) = peers
        .iter()
        .find(|p| p.name == name && p.session_id != session_id)
    {
        if !force {
            eprintln!(
                "error: peer name '{name}' is already registered to session '{}' — pass --force to replace",
                conflict.session_id
            );
            std::process::exit(1);
        }
    }
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
    if let Err(err) = peers_write_all(&peers) {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
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
    let events = bus_read_all();
    let next_hop = compute_next_peer_hop(&events, &from, &to, auto_hop);
    let verified_hop = match check_auto_hop_budget(next_hop) {
        Ok(h) => h,
        Err(err) => {
            eprintln!("error: {err}");
            std::process::exit(2);
        }
    };
    let payload = serde_json::json!({
        "message": message,
        "auto_hop": verified_hop,
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
        "✓ peer message sent  {}  ({from} → {to}, hop {verified_hop}/{MAX_AUTO_HOPS})",
        &event.id[..8]
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_hop_budget_allows_three_sends_and_blocks_fourth() {
        for hop in 1..=MAX_AUTO_HOPS {
            assert_eq!(check_auto_hop_budget(hop), Ok(hop));
        }
        // Caller passing 0 is normalized to hop 1 (first send)
        assert_eq!(check_auto_hop_budget(0), Ok(1));
        let err = check_auto_hop_budget(MAX_AUTO_HOPS + 1).unwrap_err();
        assert!(err.contains("MAX_AUTO_HOPS=3"));
    }

    #[test]
    fn ledger_derived_hop_counts_consecutive_peer_messages_even_when_caller_passes_zero() {
        let mut events = Vec::new();
        for i in 1..=3 {
            let hop = compute_next_peer_hop(&events, "agent-a", "agent-b", 0);
            assert_eq!(hop, i);
            assert!(check_auto_hop_budget(hop).is_ok());
            events.push(BusEvent {
                id: format!("ev-{i}"),
                ts: now(),
                from: if i % 2 == 1 { "agent-a".into() } else { "agent-b".into() },
                to: if i % 2 == 1 { "agent-b".into() } else { "agent-a".into() },
                event_type: "peer_message".into(),
                payload: serde_json::json!({ "auto_hop": hop }),
                reply_to: None,
            });
        }
        // 4th send with caller passing 0 is computed as hop 4 from the ledger and blocked!
        let fourth = compute_next_peer_hop(&events, "agent-b", "agent-a", 0);
        assert_eq!(fourth, 4);
        assert!(check_auto_hop_budget(fourth).is_err());
    }
}
