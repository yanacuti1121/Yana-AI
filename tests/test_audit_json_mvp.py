from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True)


def _yamtam_rt_available() -> bool:
    if shutil.which("yamtam-rt"):
        return True
    return (ROOT / "target" / "release" / "yamtam-rt").exists() or (ROOT / "target" / "debug" / "yamtam-rt").exists()


def test_audit_json_mvp_output_contract() -> None:
    if not _yamtam_rt_available():
        pytest.skip("yamtam-rt not installed")
    proc = run(["bash", "bin/yamtam", "audit", ".", "--json"])

    assert proc.returncode in (0, 1, 2), (
        f"unexpected exit code: {proc.returncode}\nstdout={proc.stdout}\nstderr={proc.stderr}"
    )

    data = json.loads(proc.stdout)

    required = [
        "schema_version", "tool", "command", "status", "exit_code", "target",
        "score", "risk_level", "summary", "findings",
    ]
    for k in required:
        assert k in data, f"missing key {k!r}"

    assert data["tool"] == "yamtam"
    assert data["command"] == "audit"
    assert data["status"] in ("ok", "findings", "error")
    assert data["exit_code"] == proc.returncode
    assert isinstance(data["findings"], list)

    summary = data["summary"]
    assert isinstance(summary, dict)
    assert "total_findings" in summary
    assert "by_severity" in summary
