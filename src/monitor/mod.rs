//! Bounded-backoff primitive for supervised long-running processes. Pure
//! logic only — no OS calls, no process spawning.
//!
//! See `crate::os::service` for the part of this crate that actually
//! installs/starts/stops/runs a resident process and uses this; this
//! module only computes a backoff delay, it never touches the filesystem
//! or a child process directly.
//!
//! Closure pass (host-native-os program): this module previously also
//! held `health` (`HealthRegistry`/`ComponentHealth`/`HealthState`/
//! `ServiceHealthSnapshot`), a per-component health tracker built for
//! `os::service::watchdog`'s child-process-restart design. That design
//! was never the one actually wired to the CLI — the real resident
//! service (`os::service::runtime::run()`) performs its own supervised
//! work directly in-process (calling `os::supervisor::tick_resident` in a
//! loop) rather than spawning and restarting a separate governed child,
//! so `watchdog.rs` and the health types that existed solely to serve it
//! were dead code, not an alternate live path. Both were removed rather
//! than wired up, since the real design was already built, tested, and
//! live — see `os::service::runtime`.

pub mod backoff;

pub use backoff::BoundedBackoff;
