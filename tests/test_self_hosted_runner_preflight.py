"""Regression coverage for self-hosted runner preflight checks."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/check-self-hosted-runner.py"
SPEC = importlib.util.spec_from_file_location("runner_preflight", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
runner_preflight = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner_preflight
SPEC.loader.exec_module(runner_preflight)


class SelfHostedRunnerPreflightTests(unittest.TestCase):
    def test_python_check_requires_python_311(self) -> None:
        with mock.patch.object(runner_preflight.shutil, "which", return_value="/usr/bin/python3"):
            with mock.patch.object(
                runner_preflight,
                "run",
                return_value=subprocess.CompletedProcess(("python3",), 0, "3.10.14\n", ""),
            ):
                check = runner_preflight.python_check("python3")
        self.assertEqual(check.status, "failed")
        self.assertIn("requires 3.11+", check.detail)

    def test_python_check_accepts_python_311(self) -> None:
        with mock.patch.object(runner_preflight.shutil, "which", return_value="/usr/bin/python3"):
            with mock.patch.object(
                runner_preflight,
                "run",
                return_value=subprocess.CompletedProcess(("python3",), 0, "3.11.9\n", ""),
            ):
                check = runner_preflight.python_check("python3")
        self.assertEqual(check.status, "passed")

    def test_command_check_reports_missing_dependency(self) -> None:
        with mock.patch.object(runner_preflight.shutil, "which", return_value=None):
            check = runner_preflight.command_check("cargo", ("cargo", "--version"))
        self.assertEqual(check.status, "failed")
        self.assertIn("not on PATH", check.detail)

    def test_pytest_check_reports_a_concise_import_error(self) -> None:
        with mock.patch.object(
            runner_preflight,
            "run",
            return_value=subprocess.CompletedProcess(("python3",), 1, "", "Traceback\nModuleNotFoundError: No module named 'pytest'\n"),
        ):
            check = runner_preflight.pytest_check("python3")
        self.assertEqual(check.status, "failed")
        self.assertEqual(check.detail, "ModuleNotFoundError: No module named 'pytest'")

    def test_artifact_root_rejects_a_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            actual = root / "actual"
            actual.mkdir()
            linked = root / "linked"
            linked.symlink_to(actual, target_is_directory=True)
            check = runner_preflight.artifact_root_check(linked)
        self.assertEqual(check.status, "failed")
        self.assertIn("unsafe", check.detail)

    def test_preflight_json_is_machine_readable(self) -> None:
        with mock.patch.object(
            runner_preflight,
            "preflight",
            return_value=[runner_preflight.CheckResult("platform", "passed", "Darwin")],
        ):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                code = runner_preflight.main(
                    ["--checkout", "/candidate", "--artifact-root", "/artifacts", "--json"]
                )
        self.assertEqual(code, 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["schema"], runner_preflight.REPORT_SCHEMA)
        self.assertEqual(report["checks"][0]["name"], "platform")

    def test_report_shape_is_json_serializable(self) -> None:
        report = {
            "schema": runner_preflight.REPORT_SCHEMA,
            "result": "passed",
            "checks": [runner_preflight.CheckResult("git", "passed", "git version").__dict__],
        }
        self.assertEqual(json.loads(json.dumps(report))["schema"], runner_preflight.REPORT_SCHEMA)


if __name__ == "__main__":
    unittest.main()
