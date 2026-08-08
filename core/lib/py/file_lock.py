"""Compatibility surface for the production flock-v1 lock."""

from __future__ import annotations

from core.lib.py.flock_v1 import (
    FlockV1,
    LockIdentityError,
    LockTimeoutError,
    canonical_identity,
    lock_name,
    lock_path,
)


def lock_name_for(resource: str, project_root: str | None = None) -> str:
    return lock_name(canonical_identity(resource, project_root))


class FileLock(FlockV1):
    """Backward-compatible public name for the flock-v1 context manager."""


__all__ = [
    "FileLock",
    "LockIdentityError",
    "LockTimeoutError",
    "canonical_identity",
    "lock_name_for",
    "lock_path",
]
