#!/usr/bin/env python3
"""Hermetic process helper for production flock-v1 integration tests."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path


def wait_for(path: Path) -> None:
    while not path.exists():
        time.sleep(0.01)


def critical_target(ready: str, release: str) -> int:
    Path(ready).write_text(str(os.getpid()), encoding="utf-8")
    wait_for(Path(release))
    return 0


def python_holder(root: str, resource: str, ready: str, release: str) -> int:
    from core.lib.py.file_lock import FileLock

    with FileLock(resource, timeout=5, project_root=root):
        return critical_target(ready, release)


def python_enter(root: str, resource: str, marker: str, timeout: str) -> int:
    from core.lib.py.file_lock import FileLock, LockTimeoutError

    try:
        with FileLock(resource, timeout=float(timeout), project_root=root):
            Path(marker).write_text("entered", encoding="utf-8")
    except LockTimeoutError:
        return 2
    return 0


def argv_roundtrip(output: str, values: list[str]) -> int:
    Path(output).write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")
    return 0


def capture_context(output: str) -> int:
    Path(output).write_text(
        json.dumps(
            {
                "cwd": os.getcwd(),
                "env": os.environ.get("YANA_FLOCK_TEST_ENV"),
                "path": os.environ.get("PATH"),
                "pid": os.getpid(),
            }
        ),
        encoding="utf-8",
    )
    return 0


def inherited_holder(ready: str, release: str, child_pid_file: str, do_exec: bool) -> int:
    child = os.fork()
    if child == 0:
        Path(child_pid_file).write_text(str(os.getpid()), encoding="utf-8")
        if do_exec:
            os.execv(
                sys.executable,
                [sys.executable, __file__, "critical-target", ready, release],
            )
        return critical_target(ready, release)
    return 0


def main(argv: list[str]) -> int:
    command, *args = argv
    if command == "critical-target":
        return critical_target(*args)
    if command == "python-holder":
        return python_holder(*args)
    if command == "python-enter":
        return python_enter(*args)
    if command == "argv-roundtrip":
        return argv_roundtrip(args[0], args[1:])
    if command == "capture-context":
        return capture_context(*args)
    if command == "fork-holder":
        return inherited_holder(*args, do_exec=False)
    if command == "fork-exec-holder":
        return inherited_holder(*args, do_exec=True)
    raise ValueError(f"unknown helper command: {command}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
