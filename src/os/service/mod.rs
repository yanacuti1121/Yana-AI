//! Supervised always-on yana-rt service: OS-level install/start/stop and
//! the resident runtime loop that performs supervised work while alive.
//!
//! This is the resident-process layer. It sits above `os::supervisor`
//! (halt/quarantine authority) and reuses `os::supervisor`'s halt-lock
//! path convention rather than inventing a new one. It is distinct from
//! `os::monitor_service` (a periodic scheduled tick, explicitly not a
//! resident daemon by that module's own design) and from `os::monitor`
//! (host CPU/memory/disk/GPU snapshots).
//!
//! The public CLI surface is `yana-rt os service ...` (`install`/`start`/
//! `stop`/`restart`/`status`/`uninstall`/`run`, dispatched from
//! `os::mod::dispatch_resident_service`). `run` is the resident payload:
//! it does NOT spawn and supervise a separate governed child process —
//! `runtime::run()` performs the supervised work (`os::supervisor::
//! tick_resident`) directly, in its own process, in a loop, relying on
//! the OS's own service-manager restart policy (`launchd`/`systemd`/
//! Windows Task Scheduler, via `manager::ServiceManager`) if the resident
//! process itself exits. A separate "watchdog that restarts an inner
//! child process" design existed in this tree but was never the one
//! wired to the CLI — removed as genuinely dead code during this
//! program's closure pass, not merely unwired groundwork (see
//! `crate::monitor`'s own module doc for the fuller account).

#[path = "../../monitor/mod.rs"]
pub mod monitor;

pub mod attribution;
pub mod manager;
pub mod runtime;

pub use attribution::{spawn, GovernedChild, ProcessAttribution};
pub use manager::{ServiceDefinition, ServiceManager, ServiceStatus};
