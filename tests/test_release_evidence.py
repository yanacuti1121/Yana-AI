"""Regression tests for offline release evidence verification."""

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
SCRIPT = ROOT / "core/scripts/verify-release-evidence.py"
SPEC = importlib.util.spec_from_file_location("verify_release_evidence", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
verify_release_evidence = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = verify_release_evidence
SPEC.loader.exec_module(verify_release_evidence)

REVISION = "1" * 40


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ReleaseEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.evidence = self.root / "evidence"
        self.artifacts = self.root / "artifacts"
        (self.evidence / "checks").mkdir(parents=True)
        (self.artifacts / "target/release").mkdir(parents=True)
        self.stdout = b"all checks passed\n"
        self.stderr = b""
        self.runtime = b"yana runtime\n"
        (self.evidence / "checks/gate.stdout.log").write_bytes(self.stdout)
        (self.evidence / "checks/gate.stderr.log").write_bytes(self.stderr)
        (self.artifacts / "target/release/yana-rt").write_bytes(self.runtime)
        self.report = {
            "schema": "yana-release-gate/v1",
            "result": "passed",
            "mode": "release",
            "release_eligible": True,
            "repository": {
                "git_revision": REVISION,
                "git_revision_after": REVISION,
            },
            "checks": [
                {
                    "name": "gate",
                    "status": "passed",
                    "exit_code": 0,
                    "stdout": "checks/gate.stdout.log",
                    "stdout_sha256": digest(self.stdout),
                    "stdout_bytes": len(self.stdout),
                    "stderr": "checks/gate.stderr.log",
                    "stderr_sha256": digest(self.stderr),
                    "stderr_bytes": len(self.stderr),
                }
            ],
            "artifacts": [
                {
                    "path": "target/release/yana-rt",
                    "sha256": digest(self.runtime),
                    "bytes": len(self.runtime),
                }
            ],
        }
        self._write_bundle()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_bundle(self) -> None:
        report_bytes = (json.dumps(self.report, indent=2) + "\n").encode()
        (self.evidence / "report.json").write_bytes(report_bytes)
        (self.evidence / "report.sha256").write_text(
            f"{digest(report_bytes)}  report.json\n",
            encoding="utf-8",
        )
        artifact = self.report["artifacts"][0]
        (self.evidence / "checksums.sha256").write_text(
            f"{artifact['sha256']}  {artifact['path']}\n",
            encoding="utf-8",
        )

    def _verify(self) -> dict[str, object]:
        return verify_release_evidence.verify_evidence(
            self.evidence,
            REVISION,
            self.artifacts,
        )

    def test_valid_bundle_passes(self) -> None:
        self.assertEqual(self._verify(), {"revision": REVISION, "checks": 1, "artifacts": 1})

    def test_diagnostic_report_is_rejected(self) -> None:
        self.report["mode"] = "diagnostic"
        self.report["release_eligible"] = False
        self._write_bundle()
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "ineligible"):
            self._verify()

    def test_report_tampering_is_rejected_before_json_is_trusted(self) -> None:
        with (self.evidence / "report.json").open("ab") as target:
            target.write(b" ")
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "report.sha256"):
            self._verify()

    def test_log_tampering_is_rejected(self) -> None:
        (self.evidence / "checks/gate.stdout.log").write_text("changed\n", encoding="utf-8")
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "content does not match"):
            self._verify()

    def test_symlinked_log_is_rejected(self) -> None:
        outside = self.root / "outside.log"
        outside.write_bytes(self.stdout)
        (self.evidence / "checks/gate.stdout.log").unlink()
        (self.evidence / "checks/gate.stdout.log").symlink_to(outside)
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "symlinks"):
            self._verify()

    def test_boolean_exit_code_is_rejected(self) -> None:
        self.report["checks"][0]["exit_code"] = False
        self._write_bundle()
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "not promotable"):
            self._verify()

    def test_artifact_tampering_is_rejected(self) -> None:
        (self.artifacts / "target/release/yana-rt").write_text("changed\n", encoding="utf-8")
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "artifact content"):
            self._verify()

    def test_wrong_revision_is_rejected(self) -> None:
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "expected candidate"):
            verify_release_evidence.verify_evidence(self.evidence, "2" * 40, self.artifacts)

    def test_path_traversal_is_rejected(self) -> None:
        self.report["checks"][0]["stdout"] = "../outside.log"
        self._write_bundle()
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "stay relative"):
            self._verify()

    def test_missing_artifact_root_is_rejected(self) -> None:
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "artifact-root"):
            verify_release_evidence.verify_evidence(self.evidence, REVISION, None)

    def test_checksum_manifest_mismatch_is_rejected(self) -> None:
        (self.evidence / "checksums.sha256").write_text(
            f"{'0' * 64}  target/release/yana-rt\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(verify_release_evidence.EvidenceError, "does not exactly match"):
            self._verify()

    def test_cli_reports_a_clean_pass(self) -> None:
        completed = subprocess.run(
            (
                sys.executable,
                str(SCRIPT),
                str(self.evidence),
                "--expected-revision",
                REVISION,
                "--artifact-root",
                str(self.artifacts),
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("release-evidence: PASS", completed.stdout)

    def test_cli_fails_cleanly_without_a_traceback(self) -> None:
        (self.evidence / "report.json").write_text("tampered\n", encoding="utf-8")
        completed = subprocess.run(
            (
                sys.executable,
                str(SCRIPT),
                str(self.evidence),
                "--expected-revision",
                REVISION,
                "--artifact-root",
                str(self.artifacts),
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 1)
        self.assertIn("release-evidence: FAIL", completed.stderr)
        self.assertNotIn("Traceback", completed.stderr)


if __name__ == "__main__":
    unittest.main()
