#!/usr/bin/env python3
"""Request and verify Vault Transit attestations through a local Vault Agent proxy."""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.client
import importlib.util
import json
import socket
import stat
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
ATTESTATION_SCHEMA = "yana-release-attestation/v1"
PAYLOAD_SCHEMA = "yana-release-attestation-payload/v1"
SHA256_LENGTH = 64
VaultRequest = Callable[[Path, str, dict[str, Any]], dict[str, Any]]


class AttestationError(ValueError):
    """Raised when a release attestation cannot be trusted."""


class UnixHTTPConnection(http.client.HTTPConnection):
    """HTTP connection that reaches a Vault Agent API Proxy via Unix socket."""

    def __init__(self, socket_path: Path) -> None:
        super().__init__("localhost", timeout=30)
        self.socket_path = str(socket_path)

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.socket_path)


def load_verifier() -> ModuleType:
    path = SCRIPT_DIR / "verify-release-evidence.py"
    spec = importlib.util.spec_from_file_location("yana_release_evidence_verifier", path)
    if spec is None or spec.loader is None:
        raise AttestationError(f"could not load verifier: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


VERIFIER = load_verifier()


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AttestationError(f"{label} must be a JSON object")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def validate_key_name(value: str) -> str:
    if not value or "/" in value or value in {".", ".."}:
        raise AttestationError("Vault Transit key name must be a single non-empty path segment")
    return value


def validate_socket_path(value: Path) -> Path:
    if not value.is_absolute():
        raise AttestationError("Vault Agent socket path must be absolute")
    return value


def request_vault(socket_path: Path, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    socket_path = validate_socket_path(socket_path)
    try:
        mode = socket_path.stat().st_mode
    except OSError as error:
        raise AttestationError(f"Vault Agent socket is unavailable: {error}") from error
    if not stat.S_ISSOCK(mode):
        raise AttestationError(f"Vault Agent path is not a Unix socket: {socket_path}")
    connection = UnixHTTPConnection(socket_path)
    try:
        connection.request(
            "POST",
            endpoint,
            body=json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        response = connection.getresponse()
        body = response.read().decode("utf-8")
    except (OSError, http.client.HTTPException, UnicodeError) as error:
        raise AttestationError(f"Vault Agent request failed: {error}") from error
    finally:
        connection.close()
    if response.status != 200:
        raise AttestationError(f"Vault Transit returned HTTP {response.status}")
    try:
        return require_mapping(json.loads(body), "Vault Transit response")
    except json.JSONDecodeError as error:
        raise AttestationError(f"Vault Transit returned invalid JSON: {error}") from error


def build_payload(bundle: Path, expected_revision: str, artifact_root: Path | None) -> dict[str, Any]:
    try:
        summary = VERIFIER.verify_evidence(bundle, expected_revision, artifact_root)
    except (VERIFIER.EvidenceError, OSError, UnicodeError) as error:
        raise AttestationError(f"release evidence is not promotable: {error}") from error
    return {
        "schema": PAYLOAD_SCHEMA,
        "revision": summary["revision"],
        "report_sha256": sha256_file(bundle / "report.json"),
        "checksums_sha256": sha256_file(bundle / "checksums.sha256"),
        "checks": summary["checks"],
        "artifacts": summary["artifacts"],
    }


def transit_input(payload: dict[str, Any]) -> str:
    return base64.b64encode(canonical_json(payload)).decode("ascii")


def create_attestation(
    bundle: Path,
    expected_revision: str,
    artifact_root: Path | None,
    key_name: str,
    vault_agent_socket: Path,
    request: VaultRequest = request_vault,
) -> dict[str, Any]:
    key_name = validate_key_name(key_name)
    vault_agent_socket = validate_socket_path(vault_agent_socket)
    bundle = bundle.resolve()
    destination = bundle / "attestation.json"
    if destination.exists() or destination.is_symlink():
        raise AttestationError("refusing to overwrite existing attestation.json")
    payload = build_payload(bundle, expected_revision, artifact_root)
    response = require_mapping(
        request(vault_agent_socket, f"/v1/transit/sign/{key_name}/sha2-256", {"input": transit_input(payload)}).get("data"),
        "Vault Transit sign data",
    )
    signature = response.get("signature")
    key_version = response.get("key_version")
    if not isinstance(signature, str) or not signature.startswith("vault:v") or signature.count(":") < 2:
        raise AttestationError("Vault Transit sign response has no signature")
    if not isinstance(key_version, int) or isinstance(key_version, bool) or key_version < 1:
        raise AttestationError("Vault Transit sign response has an invalid key version")
    attestation = {
        "schema": ATTESTATION_SCHEMA,
        "provider": "vault-transit",
        "key": key_name,
        "key_version": key_version,
        "payload": payload,
        "payload_sha256": hashlib.sha256(canonical_json(payload)).hexdigest(),
        "signature": signature,
    }
    try:
        with destination.open("x", encoding="utf-8") as output:
            json.dump(attestation, output, indent=2)
            output.write("\n")
    except OSError as error:
        raise AttestationError(f"could not write attestation.json: {error}") from error
    return attestation


def verify_attestation(
    bundle: Path,
    expected_revision: str,
    artifact_root: Path | None,
    key_name: str,
    vault_agent_socket: Path,
    request: VaultRequest = request_vault,
) -> dict[str, Any]:
    key_name = validate_key_name(key_name)
    vault_agent_socket = validate_socket_path(vault_agent_socket)
    bundle = bundle.resolve()
    attestation_path = bundle / "attestation.json"
    if not attestation_path.is_file() or attestation_path.is_symlink():
        raise AttestationError("attestation.json is missing or unsafe")
    try:
        attestation = require_mapping(json.loads(attestation_path.read_text(encoding="utf-8")), "attestation")
    except json.JSONDecodeError as error:
        raise AttestationError(f"attestation.json is not valid JSON: {error}") from error
    if attestation.get("schema") != ATTESTATION_SCHEMA or attestation.get("provider") != "vault-transit":
        raise AttestationError("attestation has an unsupported schema or provider")
    if attestation.get("key") != key_name:
        raise AttestationError("attestation key does not match the required Vault Transit key")
    payload = require_mapping(attestation.get("payload"), "attestation payload")
    expected_payload = build_payload(bundle, expected_revision, artifact_root)
    if payload != expected_payload:
        raise AttestationError("attestation payload does not match the verified release evidence")
    if attestation.get("payload_sha256") != hashlib.sha256(canonical_json(payload)).hexdigest():
        raise AttestationError("attestation payload digest does not match its payload")
    signature = attestation.get("signature")
    if not isinstance(signature, str) or not signature.startswith("vault:v"):
        raise AttestationError("attestation signature is missing or not a Vault Transit signature")
    response = require_mapping(
        request(vault_agent_socket, f"/v1/transit/verify/{key_name}/sha2-256", {"input": transit_input(payload), "signature": signature}).get("data"),
        "Vault Transit verify data",
    )
    if response.get("valid") is not True:
        raise AttestationError("Vault Transit did not validate the release attestation")
    return {"revision": expected_revision, "key": key_name, "key_version": attestation.get("key_version")}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Request or verify a Vault Transit release-evidence attestation.")
    parser.add_argument("mode", choices=("sign", "verify"))
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--expected-revision", required=True)
    parser.add_argument("--artifact-root", type=Path)
    parser.add_argument("--vault-transit-key", required=True)
    parser.add_argument("--vault-agent-socket", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        arguments = (args.bundle, args.expected_revision, args.artifact_root, args.vault_transit_key, args.vault_agent_socket)
        result = create_attestation(*arguments) if args.mode == "sign" else verify_attestation(*arguments)
    except (AttestationError, OSError, UnicodeError) as error:
        print(f"release-attestation: FAIL: {error}", file=sys.stderr)
        return 1
    print(f"release-attestation: PASS mode={args.mode} revision={result['revision']} key={result['key']} key_version={result['key_version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
