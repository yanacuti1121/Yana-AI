#!/usr/bin/env python3
"""Conservative human-operated activation helper for flock-v1."""

from __future__ import annotations

import argparse
import os
import stat
import sys
from pathlib import Path

PROTOCOL = "flock-v1\n"
STATE = Path(".claude/state")
MARKER = STATE / "locking-protocol-version"
MAINTENANCE = STATE / "locking-maintenance"
LOCKS = STATE / "locks"


def normalize_root(value: str) -> Path:
    root = Path(value)
    if not root.is_absolute():
        raise ValueError("--project-root must be absolute")
    return Path(os.path.normpath(root))


def enter_maintenance(root: Path) -> None:
    path = root / MAINTENANCE
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as error:
        raise RuntimeError(f"maintenance gate already exists: {path}") from error
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write("flock-v1 migration in progress\n")
    print(f"maintenance enabled: {path}")


def lock_entries(root: Path) -> list[Path]:
    lock_root = root / LOCKS
    if not lock_root.exists():
        return []
    return sorted(lock_root.iterdir())


def activate(root: Path) -> None:
    maintenance = root / MAINTENANCE
    if not maintenance.exists():
        raise RuntimeError(
            "refusing activation without maintenance gate; run --enter-maintenance first"
        )
    entries = lock_entries(root)
    non_empty_directories = [
        path
        for path in entries
        if stat.S_ISDIR(path.lstat().st_mode) and any(path.iterdir())
    ]
    if non_empty_directories:
        names = ", ".join(str(path) for path in non_empty_directories)
        raise RuntimeError(
            f"refusing activation: non-empty legacy lock directories remain: {names}"
        )
    non_regular_entries = [
        path
        for path in entries
        if not stat.S_ISDIR(path.lstat().st_mode)
        and not stat.S_ISREG(path.lstat().st_mode)
    ]
    if non_regular_entries:
        names = ", ".join(str(path) for path in non_regular_entries)
        raise RuntimeError(f"refusing activation: non-regular lock entries: {names}")
    for path in entries:
        mode = path.lstat().st_mode
        if stat.S_ISDIR(mode):
            path.rmdir()

    marker = root / MARKER
    marker.parent.mkdir(parents=True, exist_ok=True)
    temporary = marker.with_name(f"{marker.name}.tmp.{os.getpid()}")
    try:
        temporary.write_text(PROTOCOL, encoding="utf-8")
        os.replace(temporary, marker)
    finally:
        if temporary.exists():
            temporary.unlink()
    print(f"activated flock-v1: {marker}")
    print("keep maintenance enabled until smoke/race tests pass")


def prepare_rollback(root: Path) -> None:
    maintenance = root / MAINTENANCE
    if not maintenance.exists():
        raise RuntimeError("rollback requires the maintenance gate")
    entries = lock_entries(root)
    if entries:
        names = ", ".join(str(path) for path in entries)
        raise RuntimeError(
            "cannot prove flock holders are gone portably; after external FD proof, "
            f"remove only these regular files manually and rerun: {names}"
        )
    marker = root / MARKER
    if marker.exists():
        marker.unlink()
    print("flock-v1 marker removed; legacy protocol may be restored before reopening")


def leave_maintenance(root: Path) -> None:
    path = root / MAINTENANCE
    if not path.exists():
        raise RuntimeError(f"maintenance gate missing: {path}")
    path.unlink()
    print(f"maintenance disabled: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--enter-maintenance", action="store_true")
    actions.add_argument("--activate", action="store_true")
    actions.add_argument("--prepare-rollback", action="store_true")
    actions.add_argument("--leave-maintenance", action="store_true")
    args = parser.parse_args()
    try:
        if os.name != "posix" or sys.platform not in ("darwin", "linux"):
            raise RuntimeError("flock-v1 is supported only on macOS and Linux")
        root = normalize_root(args.project_root)
        if args.enter_maintenance:
            enter_maintenance(root)
        elif args.activate:
            activate(root)
        elif args.prepare_rollback:
            prepare_rollback(root)
        else:
            leave_maintenance(root)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"flock-v1 migration: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
