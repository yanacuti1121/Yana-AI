#!/usr/bin/env python3
"""`yana-ai doctor` says when the optional Giám Thị watcher is off, without changing its exit code.

Runs a copy of bin/yana inside a temp tree with stub yana-rt and giamthi_service.py,
so the result does not depend on this machine's installed services or built binaries.
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HINT = "Giám Thị (independent watcher): not active"


def _stub(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _doctor(status_rc: int, rt_rc: int = 0) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory(prefix="doctor-hint-") as tmp:
        tree = Path(tmp)
        (tree / "bin").mkdir()
        shutil.copy2(ROOT / "bin" / "yana", tree / "bin" / "yana")
        _stub(tree / "target" / "release" / "yana-rt", f"#!/bin/sh\necho rt-doctor-ran\nexit {rt_rc}\n")
        _stub(
            tree / "core" / "scripts" / "giamthi_service.py",
            f"import sys\nsys.exit({status_rc})\n",
        )
        env = {**os.environ, "NO_COLOR": "1"}
        return subprocess.run(
            ["bash", str(tree / "bin" / "yana"), "doctor"],
            cwd=tree,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )


class DoctorGiamthiHint(unittest.TestCase):
    def test_hint_when_watcher_not_active(self) -> None:
        result = _doctor(status_rc=1)
        self.assertIn("rt-doctor-ran", result.stdout)
        self.assertIn(HINT, result.stdout)
        self.assertIn("yana-ai giamthi install", result.stdout)
        self.assertEqual(result.returncode, 0)

    def test_silent_when_watcher_active(self) -> None:
        result = _doctor(status_rc=0)
        self.assertNotIn(HINT, result.stdout)
        self.assertEqual(result.returncode, 0)

    def test_silent_when_status_check_itself_fails(self) -> None:
        result = _doctor(status_rc=2)
        self.assertNotIn(HINT, result.stdout)
        self.assertEqual(result.returncode, 0)

    def test_runtime_exit_code_is_preserved(self) -> None:
        result = _doctor(status_rc=1, rt_rc=5)
        self.assertIn(HINT, result.stdout)
        self.assertEqual(result.returncode, 5)


if __name__ == "__main__":
    unittest.main()
