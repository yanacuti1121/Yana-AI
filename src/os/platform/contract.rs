//! Host integration contracts.
//!
//! Small, focused traits — not one giant "PlatformBackend" god-trait. A
//! platform backend may:
//!
//! - observe host state
//! - expose native mechanisms
//! - execute an already-authorized plan
//!
//! A platform backend may NEVER:
//!
//! - grant capabilities
//! - change autonomy policy
//! - clear HALT
//! - approve Sovereign actions
//! - decide agent trust
//!
//! Those decisions live in `os::supervisor` (HALT/quarantine authority),
//! `os::autonomy` (capability/autonomy policy), and `os::identity` (a
//! later phase) — never in anything implementing a trait in this file.
//! Nothing here is implemented per-OS yet; that starts Phase 2.

use super::capabilities::Support;
use super::profile::{AcceleratorInfo, HostProfile};
use crate::os::service::attribution::{GovernedChild, ProcessAttribution};
use anyhow::Result;
use std::path::{Path, PathBuf};

/// Collects normalized host telemetry into a `HostProfile`.
///
/// Implemented per-OS starting Phase 2, which moves `os::monitor`'s
/// existing `collect_cpu`/`collect_memory`/`collect_disk`/`collect_gpus`
/// logic (currently inline `#[cfg(target_os = "...")]` blocks in that
/// file) behind this trait — that is a move, not new logic.
pub trait TelemetryBackend {
    fn host_profile(&self) -> Result<HostProfile>;
}

/// Accelerator (GPU/NPU) inventory and, where available, utilization.
/// Split out from `TelemetryBackend` because accelerator discovery often
/// uses a different native mechanism than CPU/memory/disk telemetry
/// (e.g. `nvidia-smi` vs `sysctl`), independent of how many accelerators
/// (zero, one, several) a host has.
pub trait AcceleratorBackend {
    fn accelerators(&self) -> Result<Vec<AcceleratorInfo>>;
}

/// Installs/starts/stops/queries a native OS service definition
/// (launchd / systemd-user / Task Scheduler). Real implementations
/// already exist in `src/os/service/{launchd,systemd,windows}.rs`; Phase
/// 4 moves the raw OS-command-syntax portion of those files behind this
/// trait. `service::manager::ServiceManager` keeps owning atomic writes,
/// symlink refusal, and cross-platform orchestration — this trait only
/// executes an already-built plan; it does not decide whether the caller
/// was authorized to install anything.
pub trait ServiceBackend {
    fn install(&self, definition_path: &Path, content: &str) -> Result<()>;
    fn start(&self) -> Result<()>;
    fn stop(&self) -> Result<()>;
    fn is_active(&self) -> Result<Support>;
}

/// Spawns and observes native processes on behalf of an already-authorized
/// execution plan (Phase 10).
///
/// Corrected from Phase 1's guess (`spawn(argv) -> Result<u32>`) once
/// Phase 10 actually needed to wire this: a bare PID is not enough to
/// reliably `wait()`/kill a process you do not hold a live handle to
/// (PID reuse makes bare-PID liveness checks unsound), and this program
/// already has a solid, tested implementation —
/// `os::service::attribution::spawn()` — that returns exactly the right
/// handle (`GovernedChild`) plus attribution and a spawn receipt. This
/// trait's real job is executing an already-authorized `argv` +
/// `ProcessAttribution` — the caller (via `platform::process`) decides
/// what's authorized; this trait never does.
pub trait ProcessBackend {
    fn spawn(
        &self,
        root: &Path,
        argv: &[String],
        owner: ProcessAttribution,
    ) -> Result<GovernedChild>;
}

/// Normalized host event subscription (filesystem changes, process
/// lifecycle, sleep/wake, network changes — Phase 8). Event detection is
/// for speed only; it is never a replacement for periodic reconciliation
/// (`os::supervisor::tick`), which remains the source of eventual truth
/// per this program's Phase 9 requirement — an event backend that never
/// fires must not be able to silently defeat that reconciliation.
pub trait EventBackend {
    fn is_available(&self) -> Support;
}

/// OS-native secret storage (Keychain / Secret Service / Credential
/// Manager) — Phase 11. Presence-only by design, matching
/// `os::credential`'s existing convention: this trait answers "is there
/// an entry for this key," never returns the value itself to a caller
/// that only needed to know presence. See `52-secrets-vault-law.md`.
pub trait SecretBackend {
    fn has_entry(&self, key: &str) -> Result<bool>;
}

/// What an isolation backend should confine — a plain data description of
/// an already-decided policy, never built by the backend itself. Empty
/// `write_allowed_paths` means "do not restrict writes at all" (no
/// file-write rule added), not "allow nowhere."
#[derive(Debug, Clone, Default)]
pub struct IsolationPlan {
    pub deny_network: bool,
    pub write_allowed_paths: Vec<PathBuf>,
}

/// Native process containment (sandbox-exec / cgroups+namespaces / Job
/// Objects) — Phase 10.
///
/// Corrected from Phase 1's guess (`is_available` only, no way to
/// actually isolate anything) once Phase 10 needed a real shape: `wrap()`
/// takes an already-authorized `argv` and an `IsolationPlan` describing
/// what to confine, and returns a NEW `argv` that, when spawned via
/// `ProcessBackend`, runs the original command under that confinement
/// (e.g. macOS: prefixed with `sandbox-exec -p <profile> --`). This
/// backend decides HOW to confine, never WHAT should be confined or
/// WHETHER confinement is required — that is `platform::process`'s
/// `IsolationRequest.required` flag, decided by the caller.
pub trait IsolationBackend {
    fn is_available(&self) -> Support;
    fn wrap(&self, plan: &IsolationPlan, argv: &[String]) -> Result<Vec<String>>;
}
