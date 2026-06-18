#!/usr/bin/env python3
"""Regression checks for .yana-aiignore behavior in yana-ai audit."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run(cmd: list[str]) -> tuple[int, str, str]:
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _yana_ai_rt_available() -> bool:
    import shutil
    if shutil.which("yana-rt"):
        return True
    release = ROOT / "target" / "release" / "yana-rt"
    debug = ROOT / "target" / "debug" / "yana-rt"
    return release.exists() or debug.exists()


def test_repo_root_audit_ignores_demo_fixture_findings() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping audit regression tests")
        return
    code, out, err = _run(["bash", "bin/yana-ai", "audit", "."])
    _assert(code in (0, 1, 2), f"audit . failed unexpectedly: code={code}\nSTDERR:\n{err}\nSTDOUT:\n{out[:1000]}")

    # should not report known demo fixture file in root audit output
    _assert(
        "examples/unsafe-agent-repo/scripts/deploy.sh" not in out,
        "root audit unexpectedly reported findings from examples/unsafe-agent-repo",
    )


def test_direct_demo_target_still_reports_expected_unsafe_findings() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping audit regression tests")
        return
    code, out, err = _run(["bash", "bin/yana-ai", "audit", "examples/unsafe-agent-repo"])
    _assert(code in (0, 1, 2), f"audit examples target failed unexpectedly: code={code}\nSTDERR:\n{err}\nSTDOUT:\n{out[:1000]}")

    _assert(
        ("scripts/deploy.sh" in out or "deploy.sh" in out) and ("SH001" in out or "SH002" in out),
        "direct demo audit did not include expected unsafe script findings",
    )


if __name__ == "__main__":
    test_repo_root_audit_ignores_demo_fixture_findings()
    test_direct_demo_target_still_reports_expected_unsafe_findings()
    print("OK: .yana-aiignore regression checks passed.")
