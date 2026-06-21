#!/usr/bin/env python3
"""Regression checks for `yana provenance check` (src/provenance/mod.rs).

Verifies that ported code under core/lib/*_adapted/ has a matching
vendor/<name>/_upstream/ source dir and an Origin:/License: attribution
header — see slsa-artifact-law.md and 44-supply-chain-vetting.md.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run(cmd: list[str], cwd: Path = ROOT) -> tuple[int, str, str]:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _yana_ai_rt_available() -> bool:
    if shutil.which("yana-rt"):
        return True
    release = ROOT / "target" / "release" / "yana-rt"
    debug = ROOT / "target" / "debug" / "yana-rt"
    return release.exists() or debug.exists()


def test_repo_passes_with_no_findings() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping provenance regression tests")
        return
    code, out, err = _run(["bash", "bin/yana", "provenance", "check", "."])
    _assert(code == 0, f"provenance check on repo root should pass: code={code}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
    _assert("checked" in out, f"expected summary line in output, got:\n{out}")


def test_repo_json_mode_matches_schema() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping provenance regression tests")
        return
    code, out, err = _run(["bash", "bin/yana", "provenance", "check", ".", "--json"])
    _assert(code == 0, f"json mode on repo root should pass: code={code}\nSTDERR:\n{err}")
    payload = json.loads(out)
    for key in ("modules_checked", "files_checked", "findings"):
        _assert(key in payload, f"json payload missing key {key!r}: {payload}")
    _assert(payload["modules_checked"] >= 5, f"expected >=5 adapted modules, got {payload['modules_checked']}")
    _assert(payload["findings"] == [], f"expected no findings on clean repo, got {payload['findings']}")


def test_missing_vendor_source_is_reported_as_fail() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping provenance regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        adapted = fixture / "core" / "lib" / "widget_adapted"
        adapted.mkdir(parents=True)
        (adapted / "widget.py").write_text('"""No attribution header here."""\n', encoding="utf-8")
        # deliberately no vendor/widget/_upstream/ directory

        code, out, err = _run(["bash", "bin/yana", "provenance", "check", str(fixture)])
        _assert(code == 1, f"missing vendor source should fail: code={code}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        _assert(
            "no matching vendor" in out,
            f"expected 'no matching vendor' finding in output, got:\n{out}",
        )


def test_missing_attribution_header_is_reported_as_warning() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping provenance regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        adapted = fixture / "core" / "lib" / "widget_adapted"
        adapted.mkdir(parents=True)
        (adapted / "widget.py").write_text('"""No attribution header here."""\n', encoding="utf-8")

        upstream = fixture / "vendor" / "widget" / "_upstream"
        upstream.mkdir(parents=True)
        (upstream / "LICENSE").write_text("MIT\n", encoding="utf-8")
        (upstream / "widget.py").write_text("# original source\n", encoding="utf-8")

        code, out, err = _run(["bash", "bin/yana", "provenance", "check", str(fixture)])
        _assert(code == 0, f"warning-only run should still exit 0: code={code}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        _assert(
            "missing Origin: and License:" in out,
            f"expected missing-attribution warning in output, got:\n{out}",
        )


if __name__ == "__main__":
    test_repo_passes_with_no_findings()
    test_repo_json_mode_matches_schema()
    test_missing_vendor_source_is_reported_as_fail()
    test_missing_attribution_header_is_reported_as_warning()
    print("OK: provenance check regression tests passed.")
