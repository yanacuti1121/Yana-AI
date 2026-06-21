#!/usr/bin/env python3
"""Regression checks for `yana doctor dispatch` (src/doctor/dispatch_check.rs).

Uses synthetic fixtures (a temp dir with its own src/main.rs + bin/yana)
rather than asserting on this repo's current drift state — that state is
expected to change as findings get fixed, and a test tied to it would go
stale the moment someone fixes one.
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


def _write_fixture(root: Path, main_rs: str, bin_yana: str) -> None:
    (root / "src").mkdir(parents=True, exist_ok=True)
    (root / "bin").mkdir(parents=True, exist_ok=True)
    (root / "src" / "main.rs").write_text(main_rs, encoding="utf-8")
    (root / "bin" / "yana").write_text(bin_yana, encoding="utf-8")


CLEAN_MAIN_RS = """
#[derive(Subcommand)]
enum Commands {
    /// Foo command
    Foo { #[command(subcommand)] action: FooAction },
    /// Bar command
    Bar { #[command(subcommand)] action: BarAction },
}
"""

CLEAN_BIN_YANA = """
case "$COMMAND" in
  foo)
    rt foo "$@"
    ;;
  bar)
    rt "$COMMAND" "$@"
    ;;
esac
"""

DRIFT_MAIN_RS = """
#[derive(Subcommand)]
enum Commands {
    /// Foo command
    Foo { #[command(subcommand)] action: FooAction },
    /// Baz exists in Rust but bin/yana never routes to it
    Baz { #[command(subcommand)] action: BazAction },
}
"""

EXEMPT_MAIN_RS = """
#[derive(Subcommand)]
enum Commands {
    /// Foo command
    Foo { #[command(subcommand)] action: FooAction },
    /// Qux exists in Rust but Python is canonical
    /// DOCTOR_DISPATCH_EXEMPT: core/scripts/qux.py is canonical —
    /// it has more subcommands than this Rust port (2026-06-21).
    Qux { #[command(subcommand)] action: QuxAction },
}
"""

EXEMPT_BIN_YANA = """
case "$COMMAND" in
  foo)
    rt foo "$@"
    ;;
  qux)
    python3 "$QUX_PY" "$@"
    ;;
esac
"""

DRIFT_BIN_YANA = """
case "$COMMAND" in
  foo)
    rt foo "$@"
    ;;
  weird)
    rt nonexistent "$@"
    ;;
esac
"""

NESTED_CASE_MAIN_RS = """
#[derive(Subcommand)]
enum Commands {
    /// Foo command
    Foo { #[command(subcommand)] action: FooAction },
}
"""

NESTED_CASE_BIN_YANA = """
case "$COMMAND" in
  policy)
    SUBCMD="${1:-}"; shift 2>/dev/null || true
    case "$SUBCMD" in
      check) python3 "$POLICY_CHECK_PY" "$@" ;;
      *)     cmd_policy "$SUBCMD" "$@" ;;
    esac
    ;;
  foo)
    rt foo "$@"
    ;;
esac
"""


def test_clean_dispatch_reports_no_findings() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping doctor dispatch regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        _write_fixture(fixture, CLEAN_MAIN_RS, CLEAN_BIN_YANA)
        code, out, err = _run(["bash", "bin/yana", "doctor", "dispatch", str(fixture), "--json"])
        _assert(code == 0, f"clean fixture should report no drift: code={code}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        payload = json.loads(out)
        _assert(payload["findings"] == [], f"expected no findings, got {payload['findings']}")
        _assert(set(payload["rust_subcommands"]) == {"foo", "bar"}, payload["rust_subcommands"])


def test_unreachable_and_routes_to_missing_are_detected() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping doctor dispatch regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        _write_fixture(fixture, DRIFT_MAIN_RS, DRIFT_BIN_YANA)
        code, out, err = _run(["bash", "bin/yana", "doctor", "dispatch", str(fixture), "--json"])
        _assert(code == 1, f"drifted fixture should fail: code={code}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        payload = json.loads(out)
        kinds_by_name = {f["name"]: f["kind"] for f in payload["findings"]}
        _assert(kinds_by_name.get("baz") == "unreachable",
                f"expected 'baz' flagged unreachable, got {kinds_by_name}")
        _assert(kinds_by_name.get("nonexistent") == "routes_to_missing",
                f"expected 'nonexistent' flagged routes_to_missing, got {kinds_by_name}")
        _assert("foo" not in kinds_by_name, f"'foo' is correctly wired — should not be flagged: {kinds_by_name}")


def test_exempt_marker_suppresses_unreachable_finding() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping doctor dispatch regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        _write_fixture(fixture, EXEMPT_MAIN_RS, EXEMPT_BIN_YANA)
        code, out, err = _run(["bash", "bin/yana", "doctor", "dispatch", str(fixture), "--json"])
        _assert(code == 0, f"exempt-only fixture should report no failing findings: code={code}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        payload = json.loads(out)
        _assert(payload["findings"] == [], f"expected no findings, got {payload['findings']}")
        exempt_names = {e["name"] for e in payload["exempt"]}
        _assert("qux" in exempt_names, f"expected 'qux' listed as exempt, got {payload['exempt']}")
        reason = next(e["reason"] for e in payload["exempt"] if e["name"] == "qux")
        _assert("core/scripts/qux.py is canonical" in reason and "more subcommands" in reason,
                f"expected full multi-line reason, got: {reason!r}")


def test_nested_case_inside_arm_does_not_break_parsing() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping doctor dispatch regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        _write_fixture(fixture, NESTED_CASE_MAIN_RS, NESTED_CASE_BIN_YANA)
        code, out, err = _run(["bash", "bin/yana", "doctor", "dispatch", str(fixture), "--json"])
        _assert(code == 0, f"nested-case fixture should still parse past 'policy' arm: code={code}\nSTDOUT:\n{out}\nSTDERR:\n{err}")
        payload = json.loads(out)
        _assert(payload["findings"] == [], f"expected no findings, got {payload['findings']}")


if __name__ == "__main__":
    test_clean_dispatch_reports_no_findings()
    test_unreachable_and_routes_to_missing_are_detected()
    test_exempt_marker_suppresses_unreachable_finding()
    test_nested_case_inside_arm_does_not_break_parsing()
    print("OK: doctor dispatch regression tests passed.")
