"""Shared locking primitive — ADR-008, Python side.
docs/adr/ADR-008-shared-locking-infrastructure.md

Usage:
    from core.lib.py.file_lock import FileLock

    with FileLock("core/memory/L2_session/token-budget.json"):
        # entire read -> decide -> write unit goes here, not just the
        # final write — see ADR-008 point 2 on why lock scope matters
        ...

Why this is a native Python implementation, not a yana-rt subprocess
wrapper (unlike `core/lib/locking.sh`, which does delegate to `yana-rt
guard lock-with` when available): `core/lib/locking.sh`'s call shape is
"wrap an external command" — a natural fit for a CLI subprocess, since
bash spawns subprocesses anyway. A Python script like
`core/hooks/risk-scorer.sh` wants to lock around its OWN in-process
critical section, not spawn a new command — shelling out to a Rust CLI
per call doesn't compose as a context manager over arbitrary Python code
without a hacky long-lived placeholder subprocess. So this file
reimplements the same mkdir + fencing-token-reclaim algorithm as
`src/guard/lock.rs`, natively in Python, using the *identical* lock-name
derivation (same SHA-256-prefix-of-resource-string scheme) — so a Python
process and a Rust/bash process locking the same resource string still
contend for the same lock directory, which is what actually closes the
cross-language race this ADR exists for (e.g. `risk-scorer.sh` vs.
`token-budget-guard.sh`, both targeting the same JSON file).

Ported logic (not adapted from elsewhere — this is original Yana AI
code, so it does not belong under `core/lib/*_adapted/`'s vendor-
attribution convention; see `core/rules/provenance` check, which only
requires attribution headers for genuinely ported/vendored code).
"""

from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path


LOCK_ROOT = ".claude/state/locks"
POLL_INTERVAL_SECS = 0.05


def _stale_after_secs() -> float:
    """Independent of any caller's own wait timeout — see src/guard/lock.rs's
    module doc for why conflating the two is a real bug (caught by that
    file's own test suite), not just a style preference. Matches
    core/hooks/audit-log.sh's proven default; override via
    YANA_LOCK_STALE_AFTER_SECS for a legitimately longer critical section.
    """
    raw = os.environ.get("YANA_LOCK_STALE_AFTER_SECS")
    if raw:
        try:
            return float(raw)
        except ValueError:
            pass
    return 5.0


def lock_name_for(resource: str) -> str:
    """Must byte-for-byte match src/guard/lock.rs's lock_name_for() and
    core/lib/locking.sh's derivation for the SAME resource string, or
    cross-language callers touching the same resource silently stop
    contending for the same lock. Sanitize + first-4-bytes-of-SHA256 —
    identical scheme, identical truncation length, identical delimiter.
    """
    digest = hashlib.sha256(resource.encode("utf-8")).digest()
    hash_prefix = digest[:4].hex()

    sanitized = "".join(c if c.isalnum() and c.isascii() or c == "-" else "_" for c in resource)
    sanitized = sanitized[:48]

    return f"{sanitized}-{hash_prefix}"


def _project_dir() -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    return Path(env) if env else Path.cwd()


def _lock_dir(lock_name: str) -> Path:
    return _project_dir() / LOCK_ROOT / f"{lock_name}.lock"


class LockTimeoutError(TimeoutError):
    pass


class FileLock:
    """Context manager. Blocks (short-poll) up to `timeout` seconds waiting
    for the lock; raises LockTimeoutError if it never clears. Releases on
    __exit__, including when the wrapped block raises — Python's `with`
    statement guarantees this the same way src/guard/lock.rs's Drop-based
    LockGuard guarantees release on panic unwind.
    """

    def __init__(self, resource: str, timeout: float = 30.0):
        self._lock_name = lock_name_for(resource)
        self._dir = _lock_dir(self._lock_name)
        self._timeout = timeout
        self._held = False

    def __enter__(self) -> "FileLock":
        self._dir.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + self._timeout
        while True:
            try:
                os.mkdir(self._dir)
                self._held = True
                return self
            except FileExistsError:
                if self._try_reclaim_stale():
                    continue  # just removed a stale lock — retry mkdir immediately, no sleep
                if time.monotonic() >= deadline:
                    raise LockTimeoutError(
                        f"timed out acquiring lock '{self._lock_name}' after {self._timeout}s"
                    )
                time.sleep(POLL_INTERVAL_SECS)

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._held:
            try:
                os.rmdir(self._dir)
            except OSError:
                pass  # best-effort: if this fails, the next acquirer's staleness check reclaims it
        return None

    def _try_reclaim_stale(self) -> bool:
        """Fencing-token reclaim — must match src/guard/lock.rs's
        try_reclaim_stale() semantics: os.rename() is atomic, so when two
        processes race to reclaim the same stale lock, only one rename()
        succeeds; the loser sees FileNotFoundError on the already-renamed
        source and correctly reports "didn't win" instead of both
        proceeding to discard a lock a merely-slow-but-alive holder might
        still be using.
        """
        try:
            mtime = self._dir.stat().st_mtime
        except FileNotFoundError:
            return False  # released between our failed mkdir and this check

        age = time.time() - mtime
        if age < _stale_after_secs():
            return False

        claim_path = self._dir.with_name(f"{self._dir.name}.stale.{os.getpid()}")
        try:
            os.rename(self._dir, claim_path)
        except FileNotFoundError:
            return False  # lost the fencing race, or the original holder released normally
        os.rmdir(claim_path)
        return True
