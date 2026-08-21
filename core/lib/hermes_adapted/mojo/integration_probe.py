"""Strict Linux probe for the compiled Mojo vector-recall extension.

Each extension call runs in a child process. This lets the parent distinguish
a catchable Python exception from a native abort or signal without taking down
the whole test runner.
"""
from __future__ import annotations

import argparse
import importlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any, Callable


_MODULE_NAME = "yana_mojo_vector_recall"


def _load_extension():
    import mojo.importer  # type: ignore[import-not-found]  # noqa: F401

    module_dir = str(Path(__file__).resolve().parent)
    sys.path.insert(0, module_dir)
    try:
        importlib.invalidate_caches()
        return importlib.import_module(_MODULE_NAME)
    finally:
        sys.path.remove(module_dir)


def _emit(outcome: str, **details: Any) -> None:
    print(json.dumps({"outcome": outcome, **details}, sort_keys=True))


def _expect_python_exception(call: Callable[[], Any]) -> int:
    try:
        call()
    except Exception as exc:
        _emit(
            "python-exception",
            exception_type=type(exc).__name__,
            message=str(exc),
        )
        return 0
    _emit("unexpected-success")
    return 1


def _run_child(case: str) -> int:
    extension = _load_extension()

    if case == "valid":
        scores = extension.cosine_scores(
            [1.0, 0.0], [[1.0, 0.0], [0.0, 1.0]]
        )
        if list(scores) != [1.0, 0.0]:
            _emit("wrong-result", scores=list(scores))
            return 1
        _emit("valid-result", scores=list(scores))
        return 0

    if case == "invalid-type":
        return _expect_python_exception(
            lambda: extension.cosine_scores(["not-a-number"], [[1.0]])
        )

    if case == "invalid-shape":
        return _expect_python_exception(
            lambda: extension.cosine_scores([1.0], [42])
        )

    if case == "dimension-mismatch":
        scores = extension.cosine_scores([1.0, 0.0], [[1.0]])
        if list(scores) != [0.0]:
            _emit("wrong-result", scores=list(scores))
            return 1
        _emit("controlled-mismatch", scores=list(scores))
        return 0

    raise ValueError(f"unknown child case: {case}")


def _describe_returncode(returncode: int) -> str:
    if returncode < 0:
        return f"terminated by signal {-returncode}"
    return f"exited {returncode}"


def _run_parent() -> int:
    cases = (
        "valid",
        "invalid-type",
        "invalid-shape",
        "dimension-mismatch",
    )
    passed = 0

    for case in cases:
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--child", case],
            capture_output=True,
            text=True,
            check=False,
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        if result.returncode == 0:
            print(f"PASS {case}: {stdout}")
            passed += 1
            continue

        print(
            f"FAIL {case}: {_describe_returncode(result.returncode)}",
            file=sys.stderr,
        )
        print(f"stdout: {stdout or '<empty>'}", file=sys.stderr)
        print(f"stderr: {stderr or '<empty>'}", file=sys.stderr)

    print(f"Mojo integration probe: {passed}/{len(cases)} passed")
    return 0 if passed == len(cases) else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--child", choices=(
        "valid",
        "invalid-type",
        "invalid-shape",
        "dimension-mismatch",
    ))
    args = parser.parse_args()
    return _run_child(args.child) if args.child else _run_parent()


if __name__ == "__main__":
    raise SystemExit(main())
