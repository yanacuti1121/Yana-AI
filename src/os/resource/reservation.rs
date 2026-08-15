//! Bounded resource reservations for agent/model workloads.
//!
//! A reservation is a durable grant of some capacity dimension (CPU
//! cores, memory bytes, or a named accelerator) to an actor, for a
//! bounded lifetime. This is distinct from `policy` (which limits ARE
//! configured) and `pressure` (what the host is doing RIGHT NOW,
//! unrelated to whether anything reserved it) — a reservation is a
//! promise, not a measurement.
//!
//! `actor` is a free-form string identifier rather than a typed identity,
//! because no actor-identity system exists yet in this codebase (that is
//! a later phase of the host-native-os program) — this module reserves
//! the field so identity can be plugged in later without a schema break.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use super::topology::ResourceTopology;

const STORE_RELATIVE_PATH: &str = ".yana-ai/os/resource-reservations.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Reservation {
    pub id: String,
    pub actor: String,
    pub cpu_cores: Option<usize>,
    pub memory_bytes: Option<u64>,
    pub accelerator_name: Option<String>,
    pub created_at: String,
    /// `None` means the reservation lives until explicitly released, not
    /// that it never expires by accident — every caller must pass an
    /// explicit choice, there is no silent default lifetime.
    pub expires_at: Option<String>,
    pub reason: String,
}

fn store_path(root: &Path) -> PathBuf {
    root.join(STORE_RELATIVE_PATH)
}

fn load_store(root: &Path) -> Result<Vec<Reservation>> {
    let path = store_path(root);
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = match options.open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error).with_context(|| format!("opening {}", path.display())),
    };
    if !file.metadata()?.is_file() {
        bail!(
            "resource reservation store must be a regular file: {}",
            path.display()
        );
    }
    let mut text = String::new();
    std::io::Read::read_to_string(&mut file, &mut text)?;
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&text)
        .with_context(|| format!("invalid resource reservation store {}", path.display()))
}

fn persist_store(root: &Path, reservations: &[Reservation]) -> Result<()> {
    let path = store_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => bail!(
            "refusing to replace non-regular reservation store: {}",
            path.display()
        ),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).with_context(|| format!("inspecting {}", path.display())),
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = path.with_extension(format!("tmp.{}.{}", std::process::id(), nonce));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options.open(&temporary)?;
    let result = (|| -> Result<()> {
        serde_json::to_writer_pretty(&mut file, reservations)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        #[cfg(target_os = "windows")]
        if path.exists() {
            fs::remove_file(&path)?;
        }
        fs::rename(&temporary, &path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn is_active(reservation: &Reservation, now: DateTime<Utc>) -> bool {
    match reservation.expires_at.as_deref() {
        None => true,
        Some(text) => DateTime::parse_from_rfc3339(text)
            .map(|expiry| expiry.with_timezone(&Utc) > now)
            .unwrap_or(false),
    }
}

fn reserved_totals(active: &[Reservation]) -> (usize, u64) {
    let cpu_cores = active.iter().filter_map(|r| r.cpu_cores).sum();
    let memory_bytes = active.iter().filter_map(|r| r.memory_bytes).sum();
    (cpu_cores, memory_bytes)
}

/// Options object per this codebase's own 5-parameter hard limit
/// (`core/rules/agent-code-constraints.md`) — a plain reservation request
/// already has 7 independent fields.
#[derive(Debug, Clone)]
pub struct ReserveRequest {
    pub actor: String,
    pub cpu_cores: Option<usize>,
    pub memory_bytes: Option<u64>,
    pub accelerator_name: Option<String>,
    pub ttl_secs: Option<i64>,
    pub reason: String,
    pub allow_overcommit: bool,
}

fn reserve_against(
    active: &[Reservation],
    topology: &ResourceTopology,
    request: &ReserveRequest,
    now: DateTime<Utc>,
) -> Result<Reservation> {
    if request.actor.trim().is_empty() {
        bail!("reservation actor must not be empty");
    }
    if request.reason.trim().is_empty() {
        bail!("reservation reason must not be empty");
    }
    if request.cpu_cores.is_none()
        && request.memory_bytes.is_none()
        && request.accelerator_name.is_none()
    {
        bail!("reservation must request at least one dimension (cpu, memory, or accelerator)");
    }
    let (reserved_cpu, reserved_memory) = reserved_totals(active);
    if !request.allow_overcommit {
        if let Some(requested) = request.cpu_cores {
            let would_use = reserved_cpu.saturating_add(requested);
            if would_use > topology.cpu_logical_cores {
                bail!(
                    "cpu reservation would overcommit: {reserved_cpu} reserved + {requested} requested > {} available",
                    topology.cpu_logical_cores
                );
            }
        }
        // Memory capacity is only checkable when the topology actually
        // reports a total — an Unknown ceiling is not evidence of a
        // conflict, so it is not treated as one; it is also not silently
        // treated as unlimited, it is simply not enforceable yet.
        if let (Some(requested), Some(total)) = (request.memory_bytes, topology.memory_total_bytes)
        {
            let would_use = reserved_memory.saturating_add(requested);
            if would_use > total {
                bail!(
                    "memory reservation would overcommit: {reserved_memory} reserved + {requested} requested > {total} available"
                );
            }
        }
        if let Some(name) = request.accelerator_name.as_deref() {
            let exists = topology.accelerators.iter().any(|a| a.name == name);
            if !exists {
                bail!("accelerator '{name}' is not present in current host topology");
            }
        }
    }
    let expires_at = request
        .ttl_secs
        .map(|secs| (now + Duration::seconds(secs)).to_rfc3339());
    Ok(Reservation {
        id: Uuid::new_v4().to_string(),
        actor: request.actor.clone(),
        cpu_cores: request.cpu_cores,
        memory_bytes: request.memory_bytes,
        accelerator_name: request.accelerator_name.clone(),
        created_at: now.to_rfc3339(),
        expires_at,
        reason: request.reason.clone(),
    })
}

pub fn reserve(root: &Path, request: ReserveRequest) -> Result<Reservation> {
    let topology = super::topology::collect()?;
    let now = Utc::now();
    let mut store = load_store(root)?;
    store.retain(|reservation| is_active(reservation, now));
    let reservation = reserve_against(&store, &topology, &request, now)?;
    store.push(reservation.clone());
    persist_store(root, &store)?;
    Ok(reservation)
}

pub fn release(root: &Path, id: &str) -> Result<()> {
    let mut store = load_store(root)?;
    let before = store.len();
    store.retain(|reservation| reservation.id != id);
    if store.len() == before {
        bail!("no reservation with id {id}");
    }
    persist_store(root, &store)
}

/// Active reservations only — expired entries are filtered, not mutated
/// out of the store; a plain list must have no persistence side effect.
pub fn list(root: &Path) -> Result<Vec<Reservation>> {
    let now = Utc::now();
    let mut store = load_store(root)?;
    store.retain(|reservation| is_active(reservation, now));
    Ok(store)
}

pub fn print_list(reservations: &[Reservation], json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(reservations)?);
        return Ok(());
    }
    if reservations.is_empty() {
        println!("No active resource reservations.");
        return Ok(());
    }
    println!("Resource reservations");
    for reservation in reservations {
        println!(
            "  {}  actor={}  cpu={}  memory={}  accelerator={}  expires={}  reason={}",
            reservation.id,
            reservation.actor,
            reservation
                .cpu_cores
                .map_or_else(|| "—".into(), |v| v.to_string()),
            reservation.memory_bytes.map_or_else(
                || "—".into(),
                |v| format!("{:.1} GiB", v as f64 / 1024f64.powi(3))
            ),
            reservation.accelerator_name.as_deref().unwrap_or("—"),
            reservation.expires_at.as_deref().unwrap_or("never"),
            reservation.reason
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::os::platform::capabilities::Support;
    use crate::os::platform::profile::{AcceleratorKind, MemoryModelKind};
    use crate::os::resource::topology::AcceleratorTopology;

    fn topology() -> ResourceTopology {
        ResourceTopology {
            schema_version: 1,
            os: "macos".into(),
            arch: "aarch64".into(),
            cpu_logical_cores: 10,
            cpu_physical_cores: Some(10),
            memory_total_bytes: Some(16 * 1024u64.pow(3)),
            memory_model: MemoryModelKind::Unified,
            accelerators: vec![AcceleratorTopology {
                name: "Apple M4".into(),
                kind: AcceleratorKind::Gpu,
                memory_model: MemoryModelKind::Unified,
                dedicated_memory_bytes: None,
                telemetry_available: false,
            }],
            process_containment: Support::Supported,
            accelerator_telemetry: Support::Unknown,
        }
    }

    fn now() -> DateTime<Utc> {
        Utc::now()
    }

    fn request(cpu_cores: Option<usize>) -> ReserveRequest {
        ReserveRequest {
            actor: "agent-1".into(),
            cpu_cores,
            memory_bytes: None,
            accelerator_name: None,
            ttl_secs: None,
            reason: "test".into(),
            allow_overcommit: false,
        }
    }

    #[test]
    fn rejects_a_dimensionless_reservation() {
        let result = reserve_against(&[], &topology(), &request(None), now());
        assert!(result.is_err());
    }

    #[test]
    fn rejects_overcommit_by_default() {
        let result = reserve_against(&[], &topology(), &request(Some(11)), now());
        assert!(result.unwrap_err().to_string().contains("overcommit"));
    }

    #[test]
    fn allows_overcommit_when_explicitly_permitted() {
        let mut req = request(Some(11));
        req.allow_overcommit = true;
        let result = reserve_against(&[], &topology(), &req, now());
        assert!(result.is_ok());
    }

    #[test]
    fn accumulates_existing_active_reservations_before_checking_capacity() {
        let mut first = request(Some(6));
        first.reason = "first".into();
        let existing = reserve_against(&[], &topology(), &first, now()).unwrap();
        let mut second = request(Some(5));
        second.actor = "agent-2".into();
        second.reason = "second".into();
        let result = reserve_against(&[existing], &topology(), &second, now());
        assert!(result.unwrap_err().to_string().contains("overcommit"));
    }

    #[test]
    fn expired_reservations_do_not_count_toward_capacity() {
        let expired = Reservation {
            id: "expired".into(),
            actor: "agent-1".into(),
            cpu_cores: Some(8),
            memory_bytes: None,
            accelerator_name: None,
            created_at: now().to_rfc3339(),
            expires_at: Some((now() - Duration::seconds(10)).to_rfc3339()),
            reason: "stale".into(),
        };
        assert!(!is_active(&expired, now()));
        // reserve_against itself trusts its caller to have already
        // filtered — that filtering is `reserve()`'s job, tested via
        // `is_active` directly here since `reserve()` touches disk.
    }

    #[test]
    fn unknown_memory_ceiling_is_not_treated_as_a_conflict() {
        let mut open_topology = topology();
        open_topology.memory_total_bytes = None;
        let mut req = request(None);
        req.memory_bytes = Some(u64::MAX);
        let result = reserve_against(&[], &open_topology, &req, now());
        assert!(result.is_ok());
    }

    #[test]
    fn accelerator_reservation_requires_a_present_accelerator() {
        let mut req = request(None);
        req.accelerator_name = Some("nonexistent-gpu".into());
        let result = reserve_against(&[], &topology(), &req, now());
        assert!(result.unwrap_err().to_string().contains("not present"));
    }

    #[test]
    fn ttl_produces_a_future_expiry_timestamp() {
        let mut req = request(Some(1));
        req.ttl_secs = Some(60);
        let reservation = reserve_against(&[], &topology(), &req, now()).unwrap();
        let expiry =
            DateTime::parse_from_rfc3339(reservation.expires_at.as_ref().unwrap()).unwrap();
        assert!(expiry.with_timezone(&Utc) > now());
    }
}
