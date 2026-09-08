//! Provider Gateway (Phase 2 of the Yana Studio architecture roadmap) —
//! the single `Provider` record that unifies what used to be reached
//! through three separate places: identity + selection
//! (`model::catalog`), runtime classification (`model::runtime`), and
//! live health/circuit state (`model::circuit_breaker`, formerly
//! `chat::circuit_breaker`). This is a refactor/unification layer, not a
//! rewrite: every existing `ChatProvider` implementation in
//! `catalog::PROVIDERS` keeps its current wiring untouched, and
//! `CircuitBreaker`'s state machine is byte-for-byte the same one that
//! shipped before this phase (see `circuit_breaker.rs`'s own doc comment).
//!
//! `latency`/`concurrency`/`throttle_interval`/`rpm_limit`/`rpm_used`/
//! `quota`/`cost` did not exist anywhere in Yana before this phase — they
//! are genuinely new tracking, not a rename of something that already
//! existed. `capability`/`context_limit` are populated by the caller from
//! real `ModelInfo`/catalog data when available; this module does not
//! hardcode a guessed per-provider capability list.

use super::circuit_breaker::{CircuitBreaker, ProviderHealthState};
use super::provider::{ProviderId, RuntimeKind};
use super::runtime::{local_runtime_kind, LocalRuntimeKind};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Rate/spend tracking — genuinely new in Yana; nothing here replaces an
/// existing field. `#[serde(default)]` on every field (same convention
/// `cost.rs`'s `CostPolicy.monthly_budget_usd` already uses) so a stats
/// file written before a field existed still loads: the missing field
/// just takes its default instead of failing to parse.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ProviderQuota {
    #[serde(default)]
    pub rpm_limit: Option<u32>,
    #[serde(default)]
    pub rpm_used: u32,
    #[serde(default)]
    pub quota_remaining: Option<f64>,
    #[serde(default)]
    pub cost_usd_total: f64,
}

/// Persisted separately from live routing state (the `CircuitBreaker`
/// inside `Provider` is in-memory, session-scoped, and reset on every
/// process start) so that reloading config — or simply restarting the
/// process — does not erase a provider's health history. Mirrors
/// AnyLLMTranslate's `rebuild()` pattern: `rebuild_stats` below reconciles
/// whatever was persisted against the current catalog.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ProviderStats {
    #[serde(default)]
    pub total_calls: u64,
    #[serde(default)]
    pub total_failures: u64,
    #[serde(default)]
    pub last_success_ts: Option<String>,
    #[serde(default)]
    pub last_failure_ts: Option<String>,
    #[serde(default)]
    pub quota: ProviderQuota,
}

/// The unified provider record. `circuit` is live, in-memory, session-only
/// state (a fresh `CircuitBreaker` every process start, exactly as it
/// already worked before this phase). `stats` is the persisted half —
/// loaded once at construction, saved back out explicitly by the caller
/// when it changes.
pub struct Provider {
    pub id: ProviderId,
    pub runtime_kind: RuntimeKind,
    pub local_runtime: Option<LocalRuntimeKind>,
    pub circuit: CircuitBreaker,
    pub stats: ProviderStats,
    pub latency_ms: Option<u64>,
    pub concurrency: u32,
    pub throttle_interval_ms: Option<u64>,
    /// Model families this provider supports (e.g. "chat", "vision",
    /// "tool-calling") — populated by the caller from real capability
    /// data (`ChatProvider::supports_vision`/`supports_tool_calling`,
    /// `ModelInfo`), never a hardcoded guess.
    pub capability: Vec<String>,
    /// Context window of the currently selected model, when known —
    /// sourced from `ModelInfo::context_length`, not a per-provider
    /// constant (context limits vary by model, not by provider).
    pub context_limit: Option<u64>,
}

impl Provider {
    /// Combines identity + runtime classification + a fresh circuit into
    /// one record — the concrete fix for "three separate places" this
    /// phase exists to close. `stats` starts at its default; call
    /// `with_stats` to attach persisted history.
    pub fn new(name: &str) -> Self {
        let id = ProviderId::from(name);
        Self {
            local_runtime: local_runtime_kind(name),
            id,
            // Local runtimes reach here as their concrete `LocalRuntimeKind`
            // via `local_runtime_kind`; everything that isn't recognized as
            // local is remote — matches `RuntimeKind::Remote` being the
            // trait's own default (see `model::provider::ChatProvider`).
            runtime_kind: local_runtime_kind(name)
                .map(|_| RuntimeKind::Local)
                .unwrap_or(RuntimeKind::Remote),
            circuit: CircuitBreaker::new(),
            stats: ProviderStats::default(),
            latency_ms: None,
            concurrency: 0,
            throttle_interval_ms: None,
            capability: Vec::new(),
            context_limit: None,
        }
    }

    pub fn with_stats(mut self, stats: ProviderStats) -> Self {
        self.stats = stats;
        self
    }

    pub fn health_state(&self) -> ProviderHealthState {
        self.circuit.health_state()
    }
}

fn stats_path_for(root: &Path) -> PathBuf {
    root.join(".yana-ai").join("provider-stats.json")
}

/// Strict reader — same shape as `cost.rs::read_cost_policy`: rejects a
/// symlink or non-regular-file target, and a malformed file is a hard
/// error rather than a silently discarded history (provider health
/// history informs routing decisions; losing it silently would be a
/// correctness bug, not just a display glitch).
pub(crate) fn load_stats(root: &Path) -> Result<HashMap<String, ProviderStats>> {
    let path = stats_path_for(root);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => {
            return Err(error)
                .with_context(|| format!("cannot inspect provider stats {}", path.display()))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!("provider stats must be a regular file: {}", path.display());
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("cannot read provider stats {}", path.display()))?;
    serde_json::from_str(&raw)
        .with_context(|| format!("provider stats is invalid JSON: {}", path.display()))
}

/// Atomic write — same temp-file-then-rename pattern as
/// `cost.rs::write_cost_policy`.
pub(crate) fn save_stats(root: &Path, stats: &HashMap<String, ProviderStats>) -> Result<()> {
    let path = stats_path_for(root);
    let parent = path.parent().expect("provider stats path has parent");
    fs::create_dir_all(parent)
        .with_context(|| format!("cannot create provider stats directory {}", parent.display()))?;
    let temporary = path.with_extension(format!("json.tmp.{}", std::process::id()));
    fs::write(&temporary, serde_json::to_vec_pretty(stats)?)
        .with_context(|| format!("cannot write temporary provider stats {}", temporary.display()))?;
    fs::rename(&temporary, &path)
        .with_context(|| format!("cannot replace provider stats {}", path.display()))
}

/// Reconciles persisted stats against the current catalog: a provider
/// that still exists keeps its history; a provider new to the catalog
/// gets a fresh default entry; a persisted entry for a provider no longer
/// in the catalog is dropped (its stats are stale, not meaningful — the
/// AnyLLMTranslate `rebuild()` pattern this mirrors treats catalog
/// membership as the source of truth for what should exist in the map,
/// not the persisted file).
pub(crate) fn rebuild_stats(
    catalog_names: &[&str],
    mut persisted: HashMap<String, ProviderStats>,
) -> HashMap<String, ProviderStats> {
    let mut rebuilt = HashMap::with_capacity(catalog_names.len());
    for name in catalog_names {
        let stats = persisted.remove(*name).unwrap_or_default();
        rebuilt.insert((*name).to_string(), stats);
    }
    rebuilt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_provider_recognizes_local_runtime() {
        let provider = Provider::new("ollama");
        assert_eq!(provider.runtime_kind, RuntimeKind::Local);
        assert_eq!(provider.local_runtime, Some(LocalRuntimeKind::Ollama));
    }

    #[test]
    fn new_provider_defaults_remote_for_cloud_names() {
        let provider = Provider::new("anthropic");
        assert_eq!(provider.runtime_kind, RuntimeKind::Remote);
        assert_eq!(provider.local_runtime, None);
    }

    #[test]
    fn fresh_provider_health_is_open() {
        let provider = Provider::new("anthropic");
        assert_eq!(provider.health_state(), ProviderHealthState::Open);
    }

    #[test]
    fn stats_round_trip_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let mut stats = HashMap::new();
        stats.insert(
            "anthropic".to_string(),
            ProviderStats {
                total_calls: 42,
                total_failures: 3,
                last_success_ts: Some("2026-09-08T00:00:00Z".to_string()),
                last_failure_ts: None,
                quota: ProviderQuota {
                    rpm_limit: Some(60),
                    rpm_used: 12,
                    quota_remaining: Some(1000.0),
                    cost_usd_total: 1.23,
                },
            },
        );
        save_stats(dir.path(), &stats).unwrap();
        let loaded = load_stats(dir.path()).unwrap();
        assert_eq!(loaded, stats);
    }

    #[test]
    fn missing_stats_file_loads_as_empty_map() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = load_stats(dir.path()).unwrap();
        assert!(loaded.is_empty());
    }

    #[test]
    fn old_stats_missing_new_fields_default_instead_of_failing() {
        // Simulates a stats file written before `quota` existed — same
        // forward-compat contract `#[serde(default)]` gives `cost.rs`'s
        // `CostPolicy.monthly_budget_usd`.
        let dir = tempfile::tempdir().unwrap();
        let path = stats_path_for(dir.path());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            br#"{"anthropic": {"total_calls": 5, "total_failures": 1}}"#,
        )
        .unwrap();
        let loaded = load_stats(dir.path()).unwrap();
        let entry = &loaded["anthropic"];
        assert_eq!(entry.total_calls, 5);
        assert_eq!(entry.total_failures, 1);
        assert_eq!(entry.quota, ProviderQuota::default());
    }

    #[test]
    fn rebuild_keeps_existing_adds_new_drops_removed() {
        let mut persisted = HashMap::new();
        persisted.insert(
            "anthropic".to_string(),
            ProviderStats {
                total_calls: 10,
                ..Default::default()
            },
        );
        persisted.insert(
            "removed-provider".to_string(),
            ProviderStats {
                total_calls: 99,
                ..Default::default()
            },
        );

        let rebuilt = rebuild_stats(&["anthropic", "ollama"], persisted);

        assert_eq!(rebuilt.len(), 2);
        assert_eq!(rebuilt["anthropic"].total_calls, 10);
        assert_eq!(rebuilt["ollama"], ProviderStats::default());
        assert!(!rebuilt.contains_key("removed-provider"));
    }
}
