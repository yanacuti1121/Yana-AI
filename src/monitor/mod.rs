//! Component health/backoff primitives for supervised long-running
//! processes. Pure logic only — no OS calls, no process spawning.
//!
//! See `crate::os::service` for the part of this crate that actually
//! installs/starts/stops a resident process and drives this state; this
//! module only tracks and computes, it never touches the filesystem or a
//! child process directly.

pub mod backoff;
pub mod health;

pub use backoff::BoundedBackoff;
pub use health::{ComponentHealth, HealthRegistry, HealthState, ServiceHealthSnapshot};
