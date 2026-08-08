"""Regression coverage for the Vault Transit release-signer preflight."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/check-release-signer.py"
SPEC = importlib.util.spec_from_file_location("release_signer_preflight", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
release_signer_preflight = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = release_signer_preflight
SPEC.loader.exec_module(release_signer_preflight)

SOCKET = Path("/run/yana-release-signer/vault-proxy.sock")
KEY = "yana-release-evidence"


class ReleaseSignerPreflightTests(unittest.TestCase):
    def test_signs_then_verifies_through_the_same_socket_and_key(self) -> None:
        requests: list[tuple[Path, str, dict[str, object]]] = []

        def request(socket_path: Path, endpoint: str, payload: dict[str, object]) -> dict[str, object]:
            requests.append((socket_path, endpoint, payload))
            if endpoint.startswith("/v1/transit/sign/"):
                return {"data": {"signature": "vault:v4:cHJlZmxpZ2h0", "key_version": 4}}
            return {"data": {"valid": True}}

        self.assertEqual(release_signer_preflight.preflight(SOCKET, KEY, request), 4)
        self.assertEqual([entry[1] for entry in requests], [
            f"/v1/transit/sign/{KEY}/sha2-256",
            f"/v1/transit/verify/{KEY}/sha2-256",
        ])
        self.assertEqual(requests[0][2]["input"], requests[1][2]["input"])

    def test_rejects_invalid_or_unverified_transit_responses(self) -> None:
        with self.assertRaisesRegex(release_signer_preflight.PreflightError, "no signature"):
            release_signer_preflight.preflight(SOCKET, KEY, lambda *_args: {"data": {"key_version": 1}})
        calls = 0

        def invalid_verify(*_args: object) -> dict[str, object]:
            nonlocal calls
            calls += 1
            return {"data": {"signature": "vault:v1:c2ln", "key_version": 1}} if calls == 1 else {"data": {"valid": False}}

        with self.assertRaisesRegex(release_signer_preflight.PreflightError, "did not validate"):
            release_signer_preflight.preflight(SOCKET, KEY, invalid_verify)

    def test_rejects_relative_socket_and_unsafe_key(self) -> None:
        with self.assertRaisesRegex(release_signer_preflight.PreflightError, "must be absolute"):
            release_signer_preflight.preflight(Path("vault.sock"), KEY, lambda *_args: {})
        with self.assertRaisesRegex(release_signer_preflight.PreflightError, "single non-empty"):
            release_signer_preflight.preflight(SOCKET, "transit/key", lambda *_args: {})


if __name__ == "__main__":
    unittest.main()
