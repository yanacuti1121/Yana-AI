//! Supervised always-on yana-rt service: OS-level install/start/stop and
//! the watchdog loop that keeps a component's process alive.
//!
//! This is the resident-process layer. It sits above `os::supervisor`
//! (halt/quarantine authority) and reuses `os::supervisor`'s halt-lock
//! path convention rather than inventing a new one. It is distinct from
//! `os::monitor_service` (a periodic scheduled tick, explicitly not a
//! resident daemon by that module's own design) and from `os::monitor`
//! (host CPU/memory/disk/GPU snapshots).
//!
//! The public CLI surface is `yana-rt os service ...`; its `run` action is
//! the resident payload installed by the platform-specific definitions.

// `src/monitor/**` is declared from here (not from `src/os/mod.rs`, and
// never from `src/main.rs`) specifically to avoid a name collision with
// the existing `mod monitor;` in `src/os/mod.rs` (that one is
// `os::monitor`, the unrelated host-metrics snapshot module). Declaring
// it here makes the physical top-level `src/monitor/` directory reachable
// as `crate::os::service::monitor`, with zero bytes of `src/main.rs` or
// `src/os/mod.rs`'s existing `mod monitor;` touched.
#[path = "../../monitor/mod.rs"]
pub mod monitor;

pub mod attribution;
pub mod launchd;
pub mod manager;
pub mod runtime;
pub mod systemd;
pub mod watchdog;
pub mod windows;

pub use attribution::{spawn, GovernedChild, ProcessAttribution};
pub use manager::{ServiceDefinition, ServiceManager, ServiceStatus};
pub use monitor::{ComponentHealth, HealthRegistry, HealthState, ServiceHealthSnapshot};
pub use watchdog::{Watchdog, WatchdogConfig, WatchdogOutcome};
