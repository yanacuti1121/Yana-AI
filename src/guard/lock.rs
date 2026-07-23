//! Shared locking primitive — ADR-008 (`docs/adr/ADR-008-shared-locking-infrastructure.md`).
//!
//! Atomic `mkdir` as the mutex: portable on every POSIX filesystem this repo
//! targets, no external binary (`flock(1)` isn't preinstalled on macOS), no
//! new crate. This is the canonical implementation bash/Python/Node call
//! sites delegate to via `yana-rt lock ...`, matching the same
//! present-else-fallback pattern this repo already uses for
//! `yana-rt guard <subcommand>` (see `guard-destructive.sh`,
//! `token-budget-guard.sh`).
//!
//! Lock name is derived from the target resource identifier (usually a file
//! path) via [`lock_name_for`] — a sanitized prefix plus a SHA-256 hash
//! suffix, so bash/Python/Node/Rust callers touching the *same* resource
//! contend for the *same* lock directory without needing to agree on
//! anything beyond the resource string itself. This is what closes the
//! cross-language race between `risk-scorer.sh` (Python) and
//! `token-budget-guard.sh` (Node) both writing
//! `core/memory/L2_session/token-budget.json` — a fix confined to one
//! language couldn't do that.
//!
//! Stale-lock reclaim uses a fencing-token rename, not an unconditional
//! `rmdir`. `core/hooks/audit-log.sh`'s original lock (this repo's first
//! working `mkdir` lock, proven in production) reclaims by unconditional
//! `rmdir` once a lock directory's mtime exceeds the timeout — which has a
//! real race: a holder that's merely *slow* (not dead) past the timeout can
//! be reclaimed by a second process while still writing, producing two
//! simultaneous holders. `rename()` is atomic, so when two reclaimers race,
//! exactly one wins (the other gets `ENOENT` on the already-renamed source)
//! — see [`try_reclaim_stale`].

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, SystemTime};

const LOCK_ROOT: &str = ".claude/state/locks";
const POLL_INTERVAL_MS: u64 = 50;

/// A held lock. Releases on drop — including on panic unwind, matching this
/// repo's existing `src/chat/terminal_guard.rs` precedent for "a resource
/// that must be released even if the closure holding it panics."
pub struct LockGuard {
    dir: PathBuf,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir(&self.dir); // best-effort: if this fails, the next acquirer's staleness check reclaims it
    }
}

/// Derive a collision-resistant, length-capped lock name from an arbitrary
/// resource identifier (typically a target file's canonical path). Keeps a
/// short human-readable prefix for debuggability (`ls .claude/state/locks/`
/// stays legible) plus an 8-hex-char SHA-256 prefix of the *full* string to
/// eliminate collisions naive `/` -> `_` substitution would allow (e.g.
/// `a/b_c` and `a_b/c` both sanitizing to `a_b_c`) and to bound the result
/// well under filesystem name-length limits regardless of input length.
pub fn lock_name_for(resource: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(resource.as_bytes());
    let digest = hasher.finalize();
    let hash_prefix: String = digest.iter().take(4).map(|b| format!("{b:02x}")).collect();

    let sanitized: String = resource
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' })
        .take(48)
        .collect();

    format!("{sanitized}-{hash_prefix}")
}

fn lock_dir(project_dir: &Path, lock_name: &str) -> PathBuf {
    project_dir.join(LOCK_ROOT).join(format!("{lock_name}.lock"))
}

fn project_dir() -> PathBuf {
    std::env::var("CLAUDE_PROJECT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
}

/// How old an *existing* lock directory must be before a contender is
/// allowed to reclaim it as abandoned. Deliberately independent of any
/// caller's own `acquire()` wait budget — an early bug in this file's first
/// draft used the caller's `timeout` for both "how long am I willing to
/// wait" and "how old counts as abandoned," which meant a contender with a
/// short wait budget would eventually decide a perfectly healthy, still-
/// working holder was stale just because its own patience ran out (caught
/// by `slow_but_alive_holder_is_not_double_acquired` below). Fixed default
/// matches `core/hooks/audit-log.sh`'s proven-in-production threshold — a
/// lock older than this has outlived every honest holder's realistic
/// critical-section duration for this class of hook. Override via
/// `YANA_LOCK_STALE_AFTER_SECS` if a specific caller's critical section is
/// legitimately longer.
fn stale_after() -> Duration {
    let secs = std::env::var("YANA_LOCK_STALE_AFTER_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);
    Duration::from_secs(secs)
}

/// Acquire the named lock, blocking (short-poll) up to `wait_timeout` for
/// contention to clear. On success, returns a [`LockGuard`] that releases
/// the lock when dropped. `wait_timeout` governs only how long *this call*
/// is willing to wait — staleness/reclaim eligibility for a lock some other
/// process is holding is a separate, independent threshold (see
/// [`stale_after`]).
pub fn acquire(lock_name: &str, wait_timeout: Duration) -> Result<LockGuard> {
    let root = project_dir();
    let dir = lock_dir(&root, lock_name);
    if let Some(parent) = dir.parent() {
        std::fs::create_dir_all(parent).context("creating lock root directory")?;
    }

    let deadline = Instant::now() + wait_timeout;
    loop {
        match std::fs::create_dir(&dir) {
            Ok(()) => return Ok(LockGuard { dir }),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if try_reclaim_stale(&dir, stale_after())? {
                    continue; // we just removed a stale lock — retry create_dir immediately, no sleep
                }
                if Instant::now() >= deadline {
                    bail!("timed out acquiring lock '{lock_name}' after {wait_timeout:?}");
                }
                std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
            }
            Err(e) => return Err(e).context(format!("creating lock dir {}", dir.display())),
        }
    }
}

/// Run `f` with the named lock held for `f`'s *entire* execution — per
/// ADR-008, the lock must span the whole read-decide-write unit, not just
/// a final write call, or the race this primitive exists to close stays
/// open. Callers migrating an existing read-then-write site must
/// restructure it into one closure, not wrap only the write.
pub fn with_lock<T>(lock_name: &str, timeout: Duration, f: impl FnOnce() -> T) -> Result<T> {
    let _guard = acquire(lock_name, timeout)?;
    Ok(f())
}

/// Attempt to reclaim a stale lock directory. Returns `Ok(true)` if this
/// call won the reclaim (the lock is now gone — caller should immediately
/// retry acquisition), `Ok(false)` if the lock isn't stale yet or another
/// process already reclaimed/released it first.
///
/// Fencing-token design: `rename()` is atomic on every filesystem this repo
/// targets. When two processes both observe a lock past its timeout and
/// race to reclaim it, only one `rename()` call succeeds — the loser's
/// `rename()` fails with `NotFound` (the source the loser tried to rename
/// no longer exists, because the winner already moved it) and correctly
/// reports "didn't win" rather than both proceeding to discard a lock a
/// live-but-slow holder might still be using.
fn try_reclaim_stale(dir: &Path, timeout: Duration) -> Result<bool> {
    let metadata = match std::fs::metadata(dir) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false), // released between our create_dir failing and this check — caller's retry will just succeed
        Err(e) => return Err(e).context("stat'ing lock dir for staleness check"),
    };

    let age = SystemTime::now()
        .duration_since(metadata.modified().context("reading lock dir mtime")?)
        .unwrap_or(Duration::ZERO);
    if age < timeout {
        return Ok(false); // not stale yet — a live holder may legitimately still be within budget
    }

    let claim_path = dir.with_extension(format!("stale.{}", std::process::id()));
    match std::fs::rename(dir, &claim_path) {
        Ok(()) => {
            std::fs::remove_dir(&claim_path).context("removing reclaimed stale lock")?;
            Ok(true)
        }
        // Lost the fencing race (another reclaimer's rename beat us) or the
        // original holder released normally between our metadata() read and
        // this rename() — either way, not our lock to remove.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e).context("renaming stale lock for reclaim"),
    }
}

/// CLI entry point for `yana-rt guard lock-with` — the primitive
/// `core/lib/locking.sh`'s `with_lock` (bash call site) execs into when
/// `yana-rt` is on PATH. Runs `command` with the derived lock held for its
/// entire execution (direct argv exec, no shell reinterpretation — this is
/// a security-adjacent primitive, so no `sh -c` string-joining here, per
/// `core/rules/shell-sanitize-law.md`'s "no eval, no string-built commands"
/// convention).
pub fn cmd_lock_with(resource: &str, timeout_secs: u64, command: &[String]) -> i32 {
    let Some((program, args)) = command.split_first() else {
        eprintln!("lock-with: no command given");
        return 1;
    };
    let lock_name = lock_name_for(resource);
    let timeout = Duration::from_secs(timeout_secs);

    let spawn_result = with_lock(&lock_name, timeout, || {
        Command::new(program).args(args).status()
    });

    match spawn_result {
        Ok(Ok(status)) => status.code().unwrap_or(1),
        Ok(Err(spawn_err)) => {
            eprintln!("lock-with: failed to spawn '{program}': {spawn_err}");
            1
        }
        Err(lock_err) => {
            eprintln!("lock-with: {lock_err:#}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn unique_lock_name(test_id: &str) -> String {
        format!(
            "test-{test_id}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        )
    }

    #[test]
    fn lock_name_for_is_deterministic_and_collision_resistant() {
        assert_eq!(lock_name_for("a/b/c.json"), lock_name_for("a/b/c.json"));
        // Paths that naive '/' -> '_' sanitization would collide on must not collide here.
        assert_ne!(lock_name_for("a/b_c"), lock_name_for("a_b/c"));
    }

    #[test]
    fn lock_name_for_matches_core_lib_py_file_lock_byte_for_byte() {
        // Cross-language parity golden test — required by ADR-008: a Python
        // process and this Rust process locking the same resource string
        // MUST derive the identical lock directory name, or the
        // cross-language race this primitive exists to close (risk-scorer.sh
        // vs. token-budget-guard.sh, both on token-budget.json) silently
        // reopens the moment either side's derivation drifts from the
        // other's. Expected values computed independently via
        // core/lib/py/file_lock.py's lock_name_for() on 2026-07-22 — if this
        // test ever fails after editing either implementation, the fix is to
        // make them match again, not to update this test.
        assert_eq!(
            lock_name_for("core/memory/L2_session/token-budget.json"),
            "core_memory_L2_session_token-budget_json-a2dd9add"
        );
        assert_eq!(lock_name_for("a/b_c"), "a_b_c-ab14be70");
        assert_eq!(lock_name_for("a_b/c"), "a_b_c-02d7306b");
        assert_eq!(
            lock_name_for(".yana-ai/missions/abc123.json"),
            "_yana-ai_missions_abc123_json-41d03e11"
        );
    }

    #[test]
    fn lock_name_for_caps_length_regardless_of_input() {
        let long_path = "a/".repeat(500) + "file.json";
        assert!(lock_name_for(&long_path).len() < 80);
    }

    #[test]
    fn with_lock_runs_closure_and_releases() {
        let name = unique_lock_name("basic");
        let result = with_lock(&name, Duration::from_secs(5), || 42).unwrap();
        assert_eq!(result, 42);
        // Released — a second acquire on the same name must succeed immediately.
        let guard = acquire(&name, Duration::from_millis(100)).unwrap();
        drop(guard);
    }

    #[test]
    fn with_lock_releases_on_panic_unwind() {
        let name = unique_lock_name("panic");
        let caught = std::panic::catch_unwind(|| {
            let _ = with_lock(&name, Duration::from_secs(5), || panic!("intentional"));
        });
        assert!(caught.is_err());
        // Drop must have run during unwind — lock must be free now.
        let guard = acquire(&name, Duration::from_millis(100)).unwrap();
        drop(guard);
    }

    #[test]
    fn concurrent_writers_do_not_lose_updates() {
        // ADR-008 regression requirement: N parallel writers, verify zero lost updates.
        let name = Arc::new(unique_lock_name("concurrent"));
        let counter = Arc::new(AtomicUsize::new(0));
        let mut handles = vec![];
        for _ in 0..20 {
            let name = Arc::clone(&name);
            let counter = Arc::clone(&counter);
            handles.push(std::thread::spawn(move || {
                with_lock(&name, Duration::from_secs(5), || {
                    let current = counter.load(Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(2)); // widen the race window a real unlocked read-modify-write would lose to
                    counter.store(current + 1, Ordering::SeqCst);
                })
                .unwrap();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(counter.load(Ordering::SeqCst), 20, "lost update under concurrent with_lock — locking is not exclusive");
    }

    #[test]
    fn timeout_fails_closed_when_lock_held() {
        let name = unique_lock_name("timeout");
        let _holder = acquire(&name, Duration::from_secs(5)).unwrap();
        let contender = acquire(&name, Duration::from_millis(150));
        assert!(contender.is_err(), "acquire should time out while the lock is genuinely held");
    }

    #[test]
    fn stale_lock_is_reclaimed_after_timeout() {
        let name = unique_lock_name("stale");
        let holder = acquire(&name, Duration::from_secs(60)).unwrap();
        std::mem::forget(holder); // simulate a crashed holder: lock dir stays on disk, no Drop runs
        // Waits past the real stale_after() default (5s) rather than
        // overriding YANA_LOCK_STALE_AFTER_SECS, which would race other
        // tests mutating/reading the same process-global env var
        // concurrently (this repo already has one known flaky test from
        // exactly this class of shared-global-state race — see
        // `guard::blast_paths`'s $PWD-under-parallel-tests issue).
        let reclaimed = acquire(&name, Duration::from_secs(7));
        assert!(reclaimed.is_ok(), "a lock orphaned by a crashed holder must be reclaimable, not permanent");
    }

    #[test]
    fn slow_but_alive_holder_is_not_double_acquired() {
        // The fencing-token race this ADR's reclaim design specifically closes:
        // a holder past the "stale" threshold but still alive and still working
        // must not have its lock handed to a second process while the first is
        // still using it.
        let name = Arc::new(unique_lock_name("slow-alive"));
        let n1 = Arc::clone(&name);
        let holder = std::thread::spawn(move || {
            with_lock(&n1, Duration::from_secs(5), || {
                std::thread::sleep(Duration::from_millis(300)); // outlives the contender's short staleness window below, simulating "slow, not dead"
                "holder finished"
            })
            .unwrap()
        });
        std::thread::sleep(Duration::from_millis(20)); // let the holder acquire first
        let n2 = Arc::clone(&name);
        let contender_saw_exclusion = std::thread::spawn(move || {
            // A short timeout so this contender's own staleness check fires
            // while the first holder (300ms) is still legitimately working —
            // it must NOT succeed in reclaiming a lock that's slow, not dead.
            acquire(&n2, Duration::from_millis(80)).is_err()
        })
        .join()
        .unwrap();
        holder.join().unwrap();
        assert!(contender_saw_exclusion, "a slow-but-alive holder was reclaimed by a second process — fencing-token protection failed");
    }
}
