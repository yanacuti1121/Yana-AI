"""Canonical resource identity and native kernel flock for ADR-008."""

from __future__ import annotations

import errno
import hashlib
import math
import os
import stat
import time
from pathlib import Path

try:
    import fcntl
except ImportError:
    fcntl = None

LOCK_ROOT = Path(".claude/state/locks")
PROTOCOL_FILE = Path(".claude/state/locking-protocol-version")
MAINTENANCE_FILE = Path(".claude/state/locking-maintenance")
PROTOCOL_VERSION = "flock-v1"
TEST_MODE_ENV = "YANA_LOCKING_PROTOCOL_MODE"
POLL_INTERVAL = 0.05


class LockIdentityError(ValueError):
    pass


class LockTimeoutError(TimeoutError):
    pass


def _project_root(value: str | os.PathLike[str] | None) -> Path:
    if value is None:
        value = os.environ.get("CLAUDE_PROJECT_DIR") or os.environ.get("YANA_PROJECT_ROOT")
    if value is None:
        raise LockIdentityError(
            "flock-v1 requires explicit CLAUDE_PROJECT_DIR or YANA_PROJECT_ROOT"
        )
    root = Path(value)
    if not root.is_absolute():
        raise LockIdentityError("flock-v1 project root must be absolute")
    return Path(os.path.normpath(os.fspath(root)))


def canonical_identity(
    resource: str, project_root: str | os.PathLike[str] | None = None
) -> str:
    if resource.startswith("key:"):
        return "key/" + _normalize_key(resource[4:])
    root = _project_root(project_root)
    candidate = resource if os.path.isabs(resource) else os.path.join(root, resource)
    normalized = os.path.normpath(candidate)
    relative = os.path.relpath(normalized, root)
    if relative == "." or relative == ".." or relative.startswith(f"..{os.sep}"):
        raise LockIdentityError(f"flock-v1 resource escapes project root: {resource}")
    return "path/" + relative.replace(os.sep, "/")


def _normalize_key(value: str) -> str:
    if not value or value.startswith("/") or "\0" in value:
        raise LockIdentityError("flock-v1 key must be a non-empty relative UTF-8 key")
    parts: list[str] = []
    for part in value.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if not parts:
                raise LockIdentityError("flock-v1 key escapes logical root")
            parts.pop()
            continue
        parts.append(part)
    if not parts:
        raise LockIdentityError("flock-v1 key must name a resource")
    return "/".join(parts)


def lock_name(identity: str) -> str:
    digest = hashlib.sha256(identity.encode("utf-8")).digest()[:4].hex()
    prefix = "".join(
        character
        if character.isascii() and (character.isalnum() or character == "-")
        else "_"
        for character in identity
    )[:48]
    return f"{prefix}-{digest}"


def lock_path(project_root: str | os.PathLike[str], identity: str) -> Path:
    return _project_root(project_root) / LOCK_ROOT / f"{lock_name(identity)}.lock"


def _ensure_lock_root(project_root: Path) -> Path:
    current = project_root
    for component in (".claude", "state", "locks"):
        current /= component
        try:
            current.mkdir()
        except FileExistsError:
            pass
        mode = current.lstat().st_mode
        if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
            raise RuntimeError(
                f"flock-v1 lock root component must be a real directory: {current}"
            )
    return current


def require_active_protocol(project_root: str | os.PathLike[str]) -> None:
    root = _project_root(project_root)
    maintenance = root / MAINTENANCE_FILE
    if maintenance.exists():
        raise RuntimeError(
            f"flock-v1 maintenance gate is active: {maintenance}; do not launch hooks"
        )
    if os.environ.get(TEST_MODE_ENV) == "test":
        return
    marker = root / PROTOCOL_FILE
    try:
        value = marker.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise RuntimeError(f"flock-v1 protocol marker missing: {marker}") from error
    if value != PROTOCOL_VERSION:
        raise RuntimeError(
            f"flock-v1 protocol marker mismatch at {marker} (expected {PROTOCOL_VERSION})"
        )


class FlockV1:
    """Bounded regular-file flock context manager; never unlinks the lock."""

    def __init__(
        self,
        resource: str,
        timeout: float = 30.0,
        *,
        project_root: str | os.PathLike[str] | None = None,
    ) -> None:
        if not math.isfinite(timeout) or timeout < 0:
            raise ValueError("flock-v1 timeout must be finite and non-negative")
        self.project_root = _project_root(project_root)
        self.identity = canonical_identity(resource, self.project_root)
        self.timeout = timeout
        self.path = lock_path(self.project_root, self.identity)
        self._file = None

    def __enter__(self) -> "FlockV1":
        if fcntl is None:
            raise RuntimeError("flock-v1 is supported only on macOS and Linux")
        if self._file is not None:
            raise RuntimeError("flock-v1 lock object is already held")
        require_active_protocol(self.project_root)
        _ensure_lock_root(self.project_root)
        if self.path.exists() and not stat.S_ISREG(self.path.lstat().st_mode):
            raise RuntimeError(f"flock-v1 lock path must be a regular file: {self.path}")

        flags = os.O_CREAT | os.O_RDWR
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(self.path, flags, 0o600)
        try:
            opened_stat = os.fstat(fd)
            path_stat = os.lstat(self.path)
            if (
                not stat.S_ISREG(opened_stat.st_mode)
                or not stat.S_ISREG(path_stat.st_mode)
                or (opened_stat.st_dev, opened_stat.st_ino)
                != (path_stat.st_dev, path_stat.st_ino)
            ):
                raise RuntimeError(
                    f"flock-v1 lock path must remain the opened regular file: {self.path}"
                )
            self._file = os.fdopen(fd, "r+b", closefd=True)
        except BaseException:
            os.close(fd)
            raise

        deadline = time.monotonic() + self.timeout
        while True:
            try:
                fcntl.flock(self._file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except OSError as error:
                if error.errno not in (errno.EACCES, errno.EAGAIN):
                    self._file.close()
                    self._file = None
                    raise
                if time.monotonic() >= deadline:
                    self._file.close()
                    self._file = None
                    raise LockTimeoutError(
                        f"flock-v1 timed out acquiring {self.identity}"
                    ) from error
                time.sleep(POLL_INTERVAL)

    def __exit__(self, exc_type, exc, traceback) -> None:
        if self._file is not None:
            fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
            self._file.close()
            self._file = None
