"""Regression coverage for the Vault Transit release-attestation boundary."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/attest-release-evidence.py"
SPEC = importlib.util.spec_from_file_location("release_attestation", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
release_attestation = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = release_attestation
SPEC.loader.exec_module(release_attestation)

REVISION = "3" * 40
KEY = "yana-release-evidence"
SOCKET = Path("/run/yana-release-signer/vault-proxy.sock")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ReleaseAttestationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.bundle = self.root / "bundle"
        (self.bundle / "checks").mkdir(parents=True)
        (self.bundle / "artifacts/target/release").mkdir(parents=True)
        stdout = b"gate output\n"
        stderr = b""
        artifact = b"runtime\n"
        (self.bundle / "checks/gate.stdout.log").write_bytes(stdout)
        (self.bundle / "checks/gate.stderr.log").write_bytes(stderr)
        (self.bundle / "artifacts/target/release/yana-rt").write_bytes(artifact)
        report = {
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
            "artifacts": [{"path": "target/release/yana-rt", "sha256": digest(artifact), "bytes": len(artifact)}],
        }
        report_bytes = (json.dumps(report, indent=2) + "\n").encode()
        (self.bundle / "report.json").write_bytes(report_bytes)
        (self.bundle / "report.sha256").write_text(f"{digest(report_bytes)}  report.json\n", encoding="utf-8")
        (self.bundle / "checksums.sha256").write_text(f"{digest(artifact)}  target/release/yana-rt\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def signer(socket_path: Path, endpoint: str, payload: dict[str, object]) -> dict[str, object]:
        assert socket_path == SOCKET
        assert endpoint == f"/v1/transit/sign/{KEY}/sha2-256"
        assert isinstance(payload["input"], str)
        return {"data": {"signature": "vault:v7:ZmFrZS1zaWduYXR1cmU=", "key_version": 7}}

    @staticmethod
    def verifier(socket_path: Path, endpoint: str, payload: dict[str, object]) -> dict[str, object]:
        assert socket_path == SOCKET
        assert endpoint == f"/v1/transit/verify/{KEY}/sha2-256"
        assert payload["signature"] == "vault:v7:ZmFrZS1zaWduYXR1cmU="
        return {"data": {"valid": True}}

    def test_signs_and_verifies_only_verified_bundle_bytes(self) -> None:
        signed = release_attestation.create_attestation(
            self.bundle, REVISION, self.bundle / "artifacts", KEY, SOCKET, self.signer
        )
        self.assertEqual(signed["key_version"], 7)
        self.assertTrue((self.bundle / "attestation.json").is_file())
        verified = release_attestation.verify_attestation(
            self.bundle, REVISION, self.bundle / "artifacts", KEY, SOCKET, self.verifier
        )
        self.assertEqual(verified["key"], KEY)

    def test_rejects_wrong_gateway_response_without_writing_attestation(self) -> None:
        with self.assertRaisesRegex(release_attestation.AttestationError, "sign response has no signature"):
            release_attestation.create_attestation(
                self.bundle, REVISION, self.bundle / "artifacts", KEY, SOCKET, lambda _socket, _endpoint, _payload: {"data": {"signature": "bad", "key_version": 1}}
            )
        self.assertFalse((self.bundle / "attestation.json").exists())

    def test_rejects_tampered_bundle_before_gateway_verify(self) -> None:
        release_attestation.create_attestation(
            self.bundle, REVISION, self.bundle / "artifacts", KEY, SOCKET, self.signer
        )
        (self.bundle / "artifacts/target/release/yana-rt").write_text("tampered\n", encoding="utf-8")
        with self.assertRaisesRegex(release_attestation.AttestationError, "release evidence is not promotable"):
            release_attestation.verify_attestation(
                self.bundle, REVISION, self.bundle / "artifacts", KEY, SOCKET, self.verifier
            )

    def test_rejects_invalid_gateway_verification(self) -> None:
        release_attestation.create_attestation(
            self.bundle, REVISION, self.bundle / "artifacts", KEY, SOCKET, self.signer
        )
        with self.assertRaisesRegex(release_attestation.AttestationError, "did not validate"):
            release_attestation.verify_attestation(
            self.bundle, REVISION, self.bundle / "artifacts", KEY, SOCKET, lambda _socket, _endpoint, _payload: {"data": {"valid": False}}
            )

    def test_requires_absolute_socket_and_single_segment_key(self) -> None:
        with self.assertRaisesRegex(release_attestation.AttestationError, "must be absolute"):
            release_attestation.create_attestation(
                self.bundle, REVISION, self.bundle / "artifacts", KEY, Path("vault-proxy.sock"), self.signer
            )
        with self.assertRaisesRegex(release_attestation.AttestationError, "single non-empty"):
            release_attestation.create_attestation(
                self.bundle, REVISION, self.bundle / "artifacts", "transit/yana", SOCKET, self.signer
            )


if __name__ == "__main__":
    unittest.main()
