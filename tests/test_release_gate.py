"""Regression tests for the self-hosted release gate report contract."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/release-gate.py"
SPEC = importlib.util.spec_from_file_location("release_gate", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
release_gate = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = release_gate
SPEC.loader.exec_module(release_gate)


class ReleaseGateTests(unittest.TestCase):
    def test_sha256_file_reports_content_and_size(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            artifact = Path(temporary) / "artifact.txt"
            artifact.write_text("yana\n", encoding="utf-8")
            digest, size = release_gate.sha256_file(artifact)
        self.assertEqual(digest, hashlib.sha256(b"yana\n").hexdigest())
        self.assertEqual(size, 5)

    def test_selected_check_writes_machine_readable_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "report"
            completed = subprocess.run(
                ["python3", str(SCRIPT), "--check", "git-state", "--allow-dirty", "--artifact", "AGENTS.md", "--output", str(output)],
                cwd=temporary,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            report = json.loads((output / "report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["schema"], "yana-release-gate/v1")
            self.assertEqual(report["result"], "passed")
            self.assertEqual(report["mode"], "diagnostic")
            self.assertFalse(report["release_eligible"])
            self.assertEqual(report["checks"][0]["name"], "git-state")
            self.assertEqual(report["checks"][0]["status"], "passed")
            stdout_log = output / report["checks"][0]["stdout"]
            self.assertEqual(
                report["checks"][0]["stdout_sha256"],
                hashlib.sha256(stdout_log.read_bytes()).hexdigest(),
            )
            self.assertIn("AGENTS.md", [artifact["path"] for artifact in report["artifacts"]])
            self.assertNotIn("target/release/yana-rt", [artifact["path"] for artifact in report["artifacts"]])
            self.assertTrue((output / report["checks"][0]["stdout"]).exists())
            self.assertIn("AGENTS.md", (output / "checksums.sha256").read_text(encoding="utf-8"))
            self.assertIn("report.json", (output / "report.sha256").read_text(encoding="utf-8"))

    def test_unknown_check_is_rejected_before_running(self) -> None:
        completed = subprocess.run(["python3", str(SCRIPT), "--check", "not-a-check"], cwd=ROOT, capture_output=True, text=True, check=False)
        self.assertEqual(completed.returncode, 2)
        self.assertIn("unknown check name", completed.stderr)

    def test_rejects_an_empty_selection(self) -> None:
        available = {"only": release_gate.Check("only", "only check", ("true",))}
        with self.assertRaisesRegex(ValueError, "no checks selected"):
            release_gate.select_checks(available, [], {"only"})

    def test_missing_executable_returns_evidence_instead_of_crashing(self) -> None:
        code, stdout, stderr = release_gate.run_command(
            ("yana-command-that-does-not-exist",),
            ROOT,
            {},
        )
        self.assertEqual(code, 127)
        self.assertEqual(stdout, "")
        self.assertIn("could not execute yana-command-that-does-not-exist", stderr)

    def test_command_timeout_returns_evidence_instead_of_hanging(self) -> None:
        code, stdout, stderr = release_gate.run_command(
            (sys.executable, "-c", "import time; time.sleep(1)"),
            ROOT,
            {},
            timeout_seconds=0.01,
        )
        self.assertEqual(code, 124)
        self.assertEqual(stdout, "")
        self.assertIn("command timed out after 0.01 seconds", stderr)

    def test_runtime_artifact_requires_successful_build_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            runtime = root / "target/release/yana-rt"
            runtime.parent.mkdir(parents=True)
            runtime.write_bytes(b"stale runtime")
            self.assertEqual(release_gate.collect_artifacts(root, []), [])
            artifacts = release_gate.collect_artifacts(root, [], include_runtime=True)
            self.assertEqual([artifact["path"] for artifact in artifacts], ["target/release/yana-rt"])

    def test_missing_built_runtime_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "target/release/yana-rt"):
                release_gate.collect_artifacts(Path(temporary), [], include_runtime=True)

    def test_check_inventory_covers_ci_and_release_contract(self) -> None:
        checks = release_gate.check_definitions(ROOT)
        expected = {
            "metadata",
            "dangling-paths",
            "guards-index",
            "scanner-rules",
            "skills-lock",
            "audit-json",
            "release-evidence-tests",
            "runner-preflight-tests",
            "self-audit",
            "hook-tests",
            "flock-units",
            "flock-python-units",
            "flock-cutover",
            "flock-external-cwd",
            "flock-packaging",
            "git-state-final",
        }
        self.assertEqual(expected - checks.keys(), set())
        self.assertEqual(
            [name for name in checks if name.startswith("flock-matrix-")],
            [f"flock-matrix-{run}" for run in range(1, 6)],
        )

    def test_final_git_state_rejects_revision_change(self) -> None:
        code, _stdout, stderr = release_gate.final_git_state(
            ROOT,
            True,
            {"YANA_RELEASE_GATE_REVISION": "not-the-current-revision"},
        )
        self.assertEqual(code, 1)
        self.assertIn("HEAD changed during verification", stderr)


if __name__ == "__main__":
    unittest.main()
