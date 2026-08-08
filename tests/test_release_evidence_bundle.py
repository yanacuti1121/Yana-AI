"""Regression coverage for portable release evidence bundling."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/bundle-release-evidence.py"
SPEC = importlib.util.spec_from_file_location("release_evidence_bundle", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
release_evidence_bundle = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = release_evidence_bundle
SPEC.loader.exec_module(release_evidence_bundle)

REVISION = "2" * 40


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ReleaseEvidenceBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.evidence = self.root / "evidence"
        self.source = self.root / "candidate"
        (self.evidence / "checks").mkdir(parents=True)
        (self.source / "target/release").mkdir(parents=True)
        stdout = b"gate output\n"
        stderr = b""
        artifact = b"runtime\n"
        (self.evidence / "checks/gate.stdout.log").write_bytes(stdout)
        (self.evidence / "checks/gate.stderr.log").write_bytes(stderr)
        (self.source / "target/release/yana-rt").write_bytes(artifact)
        self.report = {
            "schema": "yana-release-gate/v1",
            "result": "passed",
            "mode": "release",
            "release_eligible": True,
            "repository": {"git_revision": REVISION, "git_revision_after": REVISION},
            "checks": [{
                "name": "gate",
                "status": "passed",
                "exit_code": 0,
                "stdout": "checks/gate.stdout.log",
                "stdout_sha256": digest(stdout),
                "stdout_bytes": len(stdout),
                "stderr": "checks/gate.stderr.log",
                "stderr_sha256": digest(stderr),
                "stderr_bytes": len(stderr),
            }],
            "artifacts": [{
                "path": "target/release/yana-rt",
                "sha256": digest(artifact),
                "bytes": len(artifact),
            }],
        }
        self._write_evidence()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_evidence(self) -> None:
        report_bytes = (json.dumps(self.report, indent=2) + "\n").encode()
        (self.evidence / "report.json").write_bytes(report_bytes)
        (self.evidence / "report.sha256").write_text(f"{digest(report_bytes)}  report.json\n", encoding="utf-8")
        artifact = self.report["artifacts"][0]
        (self.evidence / "checksums.sha256").write_text(f"{artifact['sha256']}  {artifact['path']}\n", encoding="utf-8")

    def test_builds_a_self_contained_verifiable_bundle(self) -> None:
        output = self.root / "bundle"
        summary = release_evidence_bundle.build_bundle(self.evidence, self.source, output)

        self.assertEqual(summary["revision"], REVISION)
        self.assertTrue((output / "report.json").is_file())
        self.assertTrue((output / "checks/gate.stdout.log").is_file())
        self.assertEqual((output / "artifacts/target/release/yana-rt").read_bytes(), b"runtime\n")
        verified = release_evidence_bundle.VERIFIER.verify_evidence(output, REVISION, output / "artifacts")
        self.assertEqual(verified["artifacts"], 1)

    def test_rejects_an_existing_output_without_modifying_it(self) -> None:
        output = self.root / "bundle"
        output.mkdir()
        marker = output / "keep.txt"
        marker.write_text("keep\n", encoding="utf-8")
        with self.assertRaisesRegex(release_evidence_bundle.BundleError, "refusing to overwrite"):
            release_evidence_bundle.build_bundle(self.evidence, self.source, output)
        self.assertEqual(marker.read_text(encoding="utf-8"), "keep\n")

    def test_rejects_a_modified_source_artifact_before_creating_output(self) -> None:
        output = self.root / "bundle"
        (self.source / "target/release/yana-rt").write_text("changed\n", encoding="utf-8")
        with self.assertRaisesRegex(release_evidence_bundle.BundleError, "artifact content"):
            release_evidence_bundle.build_bundle(self.evidence, self.source, output)
        self.assertFalse(output.exists())

    def test_rejects_output_inside_an_input_root(self) -> None:
        with self.assertRaisesRegex(release_evidence_bundle.BundleError, "must not be inside"):
            release_evidence_bundle.build_bundle(self.evidence, self.source, self.source / "bundle")

    def test_rejects_path_traversal_before_copying(self) -> None:
        self.report["artifacts"][0]["path"] = "../outside"
        self._write_evidence()
        output = self.root / "bundle"
        with self.assertRaisesRegex(release_evidence_bundle.BundleError, "stay relative"):
            release_evidence_bundle.build_bundle(self.evidence, self.source, output)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
