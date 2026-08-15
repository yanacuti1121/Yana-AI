//! Host integration contract: small, focused platform backend traits and
//! the normalized types they produce. See `contract.rs`'s module doc for
//! the policy/mechanism boundary this tree exists to enforce — a platform
//! backend observes and executes, it never decides Yana policy.
//!
//! `macos`/`linux`/`windows` hold the per-OS telemetry extracted from
//! `os::monitor` in Phase 2 — straight moves, zero behavior change.
//! `run()`/`nvidia_gpus()` below are the same move: `os::monitor`'s own
//! shared shell-out helper and its OS-agnostic NVIDIA probe (tried before
//! any platform-specific GPU inventory, on every target), now living
//! where every per-OS `telemetry.rs` can reach them without a
//! `crate::os::monitor::` back-reference.

use crate::os::monitor::GpuSnapshot;
use anyhow::{bail, Context, Result};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub mod capabilities;
pub mod contract;
pub mod events;
pub mod linux;
pub mod macos;
pub mod process;
pub mod profile;
pub mod windows;

const COMMAND_TIMEOUT: Duration = Duration::from_secs(4);

pub(crate) struct Output {
    pub(crate) stdout: String,
    pub(crate) success: bool,
}

pub(crate) fn run(program: &str, args: &[&str]) -> Result<Output> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("starting {program}"))?;
    let deadline = Instant::now() + COMMAND_TIMEOUT;
    loop {
        if child.try_wait()?.is_some() {
            let output = child.wait_with_output()?;
            return Ok(Output {
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                success: output.status.success(),
            });
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            bail!("{program} timed out after {}s", COMMAND_TIMEOUT.as_secs());
        }
        thread::sleep(Duration::from_millis(20));
    }
}

pub(crate) fn nvidia_gpus() -> Option<Vec<GpuSnapshot>> {
    let output = run(
        "nvidia-smi",
        &[
            "--query-gpu=name,utilization.gpu,memory.total,memory.used",
            "--format=csv,noheader,nounits",
        ],
    )
    .ok()?;
    if !output.success {
        return None;
    }
    let gpus = output
        .stdout
        .lines()
        .filter_map(|line| {
            let fields: Vec<_> = line.split(',').map(str::trim).collect();
            if fields.len() != 4 {
                return None;
            }
            Some(GpuSnapshot {
                name: fields[0].into(),
                vendor: Some("NVIDIA".into()),
                utilization_percent: fields[1].parse().ok(),
                memory_total_bytes: fields[2].parse::<u64>().ok().map(|mib| mib * 1024 * 1024),
                memory_used_bytes: fields[3].parse::<u64>().ok().map(|mib| mib * 1024 * 1024),
                source: "nvidia-smi".into(),
                status: "ready".into(),
            })
        })
        .collect::<Vec<_>>();
    (!gpus.is_empty()).then_some(gpus)
}

/// The `TelemetryBackend` + `AcceleratorBackend` implementation for the
/// host this binary is actually running on (Phase 3). One concrete type
/// exists per build — selected at compile time by `target_os`, not at
/// runtime — so callers get a real implementation with no dynamic
/// dispatch or "which OS am I" branching of their own.
#[cfg(target_os = "macos")]
pub fn backend() -> impl contract::TelemetryBackend + contract::AcceleratorBackend {
    macos::profile::Backend
}
#[cfg(target_os = "linux")]
pub fn backend() -> impl contract::TelemetryBackend + contract::AcceleratorBackend {
    linux::profile::Backend
}
#[cfg(target_os = "windows")]
pub fn backend() -> impl contract::TelemetryBackend + contract::AcceleratorBackend {
    windows::profile::Backend
}

/// Every field in the returned `HostProfile` is `None`/`Support::Unknown`
/// — honest absence of a probe, not a fabricated "unsupported" verdict
/// this program's own working rule forbids equating with unknown.
///
/// Phase 18 (host-native-os program, Cross-Platform Test Matrix): this
/// struct and its two trait impls are `cfg(any(test, ...))` rather than
/// `cfg(not(any(...)))`-only, so the "genuinely unknown platform" honest-
/// absence path is actually exercised by `cargo test` on every dev
/// machine (none of which is the exotic fourth OS this fallback exists
/// for) — before this phase it never compiled anywhere this program was
/// developed. `backend()` below stays fallback-only (not widened) to
/// avoid a duplicate-definition conflict with the real per-OS `backend()`.
#[cfg(any(
    test,
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
pub struct UnsupportedBackend;

#[cfg(any(
    test,
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
impl contract::TelemetryBackend for UnsupportedBackend {
    fn host_profile(&self) -> Result<profile::HostProfile> {
        Ok(profile::HostProfile {
            schema_version: 1,
            os: std::env::consts::OS.into(),
            arch: std::env::consts::ARCH.into(),
            cpu: profile::CpuProfile {
                logical_cores: std::thread::available_parallelism().map_or(1, usize::from),
                physical_cores: None,
                vendor: None,
            },
            memory: profile::MemoryProfile {
                total_bytes: None,
                model: profile::MemoryModelKind::Unknown,
            },
            accelerators: Vec::new(),
            capabilities: capabilities::PlatformCapabilities {
                native_service_manager: capabilities::Support::Unknown,
                filesystem_events: capabilities::Support::Unknown,
                secure_secret_storage: capabilities::Support::Unknown,
                process_containment: capabilities::Support::Unknown,
                native_notifications: capabilities::Support::Unknown,
                accelerator_telemetry: capabilities::Support::Unknown,
            },
        })
    }
}

#[cfg(any(
    test,
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
impl contract::AcceleratorBackend for UnsupportedBackend {
    fn accelerators(&self) -> Result<Vec<profile::AcceleratorInfo>> {
        Ok(Vec::new())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
pub fn backend() -> impl contract::TelemetryBackend + contract::AcceleratorBackend {
    UnsupportedBackend
}

/// The `SecretBackend` implementation for this host (Phase 11). Only
/// macOS's implementation was verified against real hardware this
/// session (see `macos::secrets`'s own doc comment); Linux/Windows exist
/// and are unit-tested for their pure logic but are honestly unverified
/// against a real host — see those modules' own doc comments.
#[cfg(target_os = "macos")]
pub fn secret_backend() -> impl contract::SecretBackend {
    macos::secrets::Backend
}
#[cfg(target_os = "linux")]
pub fn secret_backend() -> impl contract::SecretBackend {
    linux::secrets::Backend
}
#[cfg(target_os = "windows")]
pub fn secret_backend() -> impl contract::SecretBackend {
    windows::secrets::Backend
}

/// Always reports absent rather than fabricating presence — the same
/// "honest absence, never a guessed positive" discipline as
/// `UnsupportedBackend` above. Also widened to `cfg(any(test, ...))` in
/// Phase 18 for the same cross-platform-testability reason.
#[cfg(any(
    test,
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
pub struct UnsupportedSecretBackend;

#[cfg(any(
    test,
    not(any(target_os = "linux", target_os = "macos", target_os = "windows"))
))]
impl contract::SecretBackend for UnsupportedSecretBackend {
    fn has_entry(&self, _key: &str) -> Result<bool> {
        Ok(false)
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
pub fn secret_backend() -> impl contract::SecretBackend {
    UnsupportedSecretBackend
}

#[cfg(test)]
mod tests {
    use super::*;
    use contract::{AcceleratorBackend, SecretBackend, TelemetryBackend};

    #[test]
    fn unsupported_backend_reports_honest_unknown_not_a_fabricated_verdict() {
        // Exercises the "genuinely unrecognized platform" fallback on
        // whichever real OS runs this test suite (Phase 18) -- proves the
        // capability fingerprint is Unknown across the board, never
        // silently Unsupported (which this program's own working rule
        // forbids conflating with "we don't know").
        let profile = UnsupportedBackend.host_profile().unwrap();
        assert_eq!(profile.memory.total_bytes, None);
        assert_eq!(
            profile.memory.model,
            crate::os::platform::profile::MemoryModelKind::Unknown
        );
        assert_eq!(
            profile.capabilities.native_service_manager,
            capabilities::Support::Unknown
        );
        assert_eq!(
            profile.capabilities.secure_secret_storage,
            capabilities::Support::Unknown
        );
        // A logical-core count is the one field this fallback can still
        // answer honestly via std::thread::available_parallelism, so it
        // reports a real number rather than an unnecessary Unknown --
        // confirmed positive, not defaulted to zero.
        assert!(profile.cpu.logical_cores >= 1);
    }

    #[test]
    fn unsupported_backend_reports_no_accelerators_rather_than_guessing() {
        assert!(UnsupportedBackend.accelerators().unwrap().is_empty());
    }

    #[test]
    fn unsupported_secret_backend_reports_absent_never_a_fabricated_presence() {
        assert!(!UnsupportedSecretBackend.has_entry("ANY_KEY").unwrap());
    }
}
