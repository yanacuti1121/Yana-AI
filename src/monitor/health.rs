//! In-memory health/state tracking for supervised service components.
//!
//! Distinct from `crate::os::health` (aggregate, read-only management-plane
//! doctor checks) and `crate::os::monitor` (host CPU/memory/disk/GPU
//! snapshots persisted to disk): this tracks the live state of components
//! under this session's own watchdog supervision, in memory only.

use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthState {
    Healthy,
    Degraded,
    Restarting,
    Backoff,
    Halted,
    HumanRequired,
}

#[derive(Debug, Clone, Serialize)]
pub struct ComponentHealth {
    pub state: HealthState,
    pub restart_count: u64,
    pub last_ok_unix_secs: Option<u64>,
    pub last_error: Option<String>,
    pub updated_at_unix_secs: u64,
}

impl ComponentHealth {
    fn new() -> Self {
        Self {
            state: HealthState::Healthy,
            restart_count: 0,
            last_ok_unix_secs: None,
            last_error: None,
            updated_at_unix_secs: now_unix(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ServiceHealthSnapshot {
    pub components: BTreeMap<String, ComponentHealth>,
}

/// Registry of per-component health, shared across the watchdog loop.
///
/// Uses a `Mutex` rather than file persistence deliberately: this state is
/// specific to one running supervisor process, not durable evidence — the
/// durable, tamper-evident record of halt/unlock/quarantine events remains
/// `os::supervisor`'s hash-chained receipt log.
#[derive(Debug, Default)]
pub struct HealthRegistry {
    components: Mutex<BTreeMap<String, ComponentHealth>>,
}

impl HealthRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_state(&self, component: &str, state: HealthState) {
        let mut guard = self.lock();
        let entry = guard
            .entry(component.to_string())
            .or_insert_with(ComponentHealth::new);
        entry.state = state;
        entry.updated_at_unix_secs = now_unix();
        if state == HealthState::Healthy {
            entry.last_ok_unix_secs = Some(entry.updated_at_unix_secs);
        }
    }

    pub fn record_restart(&self, component: &str) {
        let mut guard = self.lock();
        let entry = guard
            .entry(component.to_string())
            .or_insert_with(ComponentHealth::new);
        entry.restart_count += 1;
        entry.updated_at_unix_secs = now_unix();
    }

    pub fn record_error(&self, component: &str, error: &str) {
        let mut guard = self.lock();
        let entry = guard
            .entry(component.to_string())
            .or_insert_with(ComponentHealth::new);
        entry.last_error = Some(error.to_string());
        entry.updated_at_unix_secs = now_unix();
    }

    pub fn component(&self, component: &str) -> Option<ComponentHealth> {
        self.lock().get(component).cloned()
    }

    pub fn snapshot(&self) -> ServiceHealthSnapshot {
        ServiceHealthSnapshot {
            components: self.lock().clone(),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, BTreeMap<String, ComponentHealth>> {
        self.components
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_component_starts_healthy_on_first_touch() {
        let registry = HealthRegistry::new();
        registry.record_restart("svc");
        let health = registry.component("svc").unwrap();
        assert_eq!(health.state, HealthState::Healthy);
        assert_eq!(health.restart_count, 1);
    }

    #[test]
    fn set_state_healthy_updates_last_ok() {
        let registry = HealthRegistry::new();
        registry.set_state("svc", HealthState::Backoff);
        assert!(registry
            .component("svc")
            .unwrap()
            .last_ok_unix_secs
            .is_none());
        registry.set_state("svc", HealthState::Healthy);
        assert!(registry
            .component("svc")
            .unwrap()
            .last_ok_unix_secs
            .is_some());
    }

    #[test]
    fn snapshot_reflects_multiple_components() {
        let registry = HealthRegistry::new();
        registry.set_state("a", HealthState::Healthy);
        registry.set_state("b", HealthState::Halted);
        let snapshot = registry.snapshot();
        assert_eq!(snapshot.components.len(), 2);
        assert_eq!(snapshot.components["b"].state, HealthState::Halted);
    }

    #[test]
    fn record_error_sets_last_error_message() {
        let registry = HealthRegistry::new();
        registry.record_error("svc", "exit status: 1");
        assert_eq!(
            registry.component("svc").unwrap().last_error.as_deref(),
            Some("exit status: 1")
        );
    }
}
