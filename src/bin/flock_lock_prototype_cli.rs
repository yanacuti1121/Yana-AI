//! flock_lock_prototype_cli — PROTOTYPE-ONLY standalone binary.
//!
//! Exists purely so the kernel-flock design in `src/guard/flock_lock.rs`
//! can be exercised as a genuinely separate OS process (unit tests inside
//! `cargo test` prove thread-level exclusion within one process; they
//! cannot prove cross-process, cross-language contention, which is the
//! actual thing this whole redesign needs proven). Not part of the
//! production `yana-rt` CLI dispatch tree — a distinct `[[bin]]` target,
//! gated behind its own Cargo feature, sharing `flock_lock.rs`'s source
//! directly via `#[path]` (not `lib.rs`, which is the WASM cdylib target
//! and must never gain a native-syscall dependency).
//!
//! Usage:
//!   flock_lock_prototype_cli --resource <raw-resource-string> --timeout <secs> -- <command> [args...]
//!
//! Takes a RAW resource identifier (e.g. a file path), not a pre-derived
//! lock name — and derives the lock name via the existing, already
//! cross-language-golden-tested `lock::lock_name_for` (unchanged from the
//! mkdir-based design; only the locking *mechanism* changed, not the
//! naming scheme). Matching `--lock-name` (pre-derived) here instead was
//! an early prototype mistake found live: this binary passed a raw string
//! straight through as the lock filename while `core/lib/flock_lock_
//! prototype.sh` independently ran it through `lock_name_for` first,
//! silently making Rust and Bash lock two DIFFERENT files for the "same"
//! resource — the exact cross-language lock-name-derivation mismatch
//! class of bug ADR-008's own history already has one prior incident of
//! (cksum vs SHA-256). Caught by this prototype's own cross-language test
//! harness (bash-vs-rust/python "no overlap" tests failed with a real
//! overlap), not by inspection — recorded as evidence this class of bug
//! is easy to reintroduce and needs exactly this kind of live cross-
//! process test, not just a code read, to catch reliably.
//!
//! `core/lib/py/flock_run.py` deliberately keeps the opposite shape
//! (`--lock-file`, an already-resolved path, naming-scheme-agnostic) —
//! callers of that script (bash's `flock_lock_with`, this test harness)
//! are responsible for deriving the same name themselves before invoking
//! it, which is what `flock_lock_with` already does correctly.

#[path = "../guard/flock_lock.rs"]
mod flock_lock;
// Only lock_name_for() is used from this file — everything else in it
// (the mkdir/rename-reclaim implementation this prototype replaces) is
// intentionally unreferenced here, hence the blanket allow rather than
// per-item suppression.
#[path = "../guard/lock.rs"]
#[allow(dead_code)]
mod lock;

use std::os::unix::process::CommandExt;
use std::process::{Command, ExitCode};
use std::time::Duration;

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();

    let mut resource: Option<String> = None;
    let mut timeout_secs: Option<f64> = None;
    let mut command: Vec<String> = Vec::new();

    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--resource" => {
                i += 1;
                resource = argv.get(i).cloned();
            }
            "--timeout" => {
                i += 1;
                timeout_secs = argv.get(i).and_then(|s| s.parse().ok());
            }
            "--" => {
                command = argv[i + 1..].to_vec();
                break;
            }
            other => {
                eprintln!("flock_lock_prototype_cli: unknown argument: {other}");
                return ExitCode::from(2);
            }
        }
        i += 1;
    }

    let (Some(resource), Some(timeout_secs)) = (resource, timeout_secs) else {
        eprintln!("flock_lock_prototype_cli: --resource and --timeout are required");
        return ExitCode::from(2);
    };
    if command.is_empty() {
        eprintln!("flock_lock_prototype_cli: no command given after --");
        return ExitCode::from(2);
    }
    if !timeout_secs.is_finite() || timeout_secs < 0.0 {
        eprintln!("flock_lock_prototype_cli: --timeout must be finite and non-negative");
        return ExitCode::from(2);
    }

    let lock_name = lock::lock_name_for(&resource);
    let guard = match flock_lock::acquire(&lock_name, Duration::from_secs_f64(timeout_secs)) {
        Ok(g) => g,
        Err(e) => {
            eprintln!("flock_lock_prototype_cli: {e:#}");
            return ExitCode::from(2);
        }
    };

    if let Err(e) = guard.clear_cloexec_for_exec() {
        eprintln!("flock_lock_prototype_cli: {e:#}");
        return ExitCode::from(2);
    }
    let (program, args) = command.split_first().expect("checked non-empty above");
    let error = Command::new(program).args(args).exec();
    drop(guard);
    eprintln!("flock_lock_prototype_cli: could not exec '{program}': {error}");
    ExitCode::from(2)
}
