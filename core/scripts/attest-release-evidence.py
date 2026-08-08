#!/usr/bin/env python3
"""Request and verify HashiCorp Vault Transit release-evidence attestations.

This client never reads a Vault token or a signing key.  A separately operated,
authenticated signing gateway owns that capability and exposes the narrow
request/verify contract consumed here.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from types import ModuleType
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
ATTESTATION_SCHEMA = "yana-release-attestation/v1"
PAYLOAD_SCHEMA = "yana-release-attestation-payload/v1"
SHA256_LENGTH = 64
GatewayRequest = Callable[[str, dict[str, Any]], dict[str, Any]]


class AttestationError(ValueError):
    """Raised when a release attestation cannot be trusted."""


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


def require_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or len(value) != SHA256_LENGTH or any(character not in "0123456789abcdef" for character in value):
        raise AttestationError(f"{label} must be a lowercase SHA-256 digest")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def gateway_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
        raise AttestationError("signing gateway URL must be an absolute HTTPS URL without query or fragment")
    return value.rstrip("/")


def request_gateway(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise AttestationError(f"signing gateway returned HTTP {response.status}")
            decoded = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, UnicodeError, json.JSONDecodeError) as error:
        raise AttestationError(f"signing gateway request failed: {error}") from error
    return require_mapping(decoded, "signing gateway response")


def build_payload(bundle: Path, expected_revision: str, artifact_root: Path | None) -> dict[str, Any]:
    try:
        summary = VERIFIER.verify_evidence(bundle, expected_revision, artifact_root)
    except (VERIFIER.EvidenceError, OSError, UnicodeError) as error:
        raise AttestationError(f"release evidence is not promotable: {error}") from error
    report = bundle / "report.json"
    checksums = bundle / "checksums.sha256"
    return {
        "schema": PAYLOAD_SCHEMA,
        "revision": summary["revision"],
        "report_sha256": sha256_file(report),
        "checksums_sha256": sha256_file(checksums),
        "checks": summary["checks"],
        "artifacts": summary["artifacts"],
    }


def create_attestation(
    bundle: Path,
    expected_revision: str,
    artifact_root: Path | None,
    key_name: str,
    gateway: str,
    request: GatewayRequest = request_gateway,
) -> dict[str, Any]:
    if not key_name or "/" in key_name or key_name in {".", ".."}:
        raise AttestationError("Vault Transit key name must be a single non-empty path segment")
    bundle = bundle.resolve()
    destination = bundle / "attestation.json"
    if destination.exists() or destination.is_symlink():
        raise AttestationError("refusing to overwrite existing attestation.json")
    payload = build_payload(bundle, expected_revision, artifact_root)
    response = request(
        f"{gateway_url(gateway)}/v1/release-attestations/sign",
        {"schema": ATTESTATION_SCHEMA, "provider": "vault-transit", "key": key_name, "payload": payload},
    )
    signature = response.get("signature")
    key_version = response.get("key_version")
    if not isinstance(signature, str) or not signature.startswith("vault:v") or signature.count(":") < 2:
        raise AttestationError("signing gateway response has no Vault Transit signature")
    if not isinstance(key_version, int) or isinstance(key_version, bool) or key_version < 1:
        raise AttestationError("signing gateway response has an invalid key version")
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
    gateway: str,
    request: GatewayRequest = request_gateway,
) -> dict[str, Any]:
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
    response = request(
        f"{gateway_url(gateway)}/v1/release-attestations/verify",
        {"schema": ATTESTATION_SCHEMA, "provider": "vault-transit", "key": key_name, "payload": payload, "signature": signature},
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
    parser.add_argument("--signing-gateway", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        if args.mode == "sign":
            result = create_attestation(args.bundle, args.expected_revision, args.artifact_root, args.vault_transit_key, args.signing_gateway)
        else:
            result = verify_attestation(args.bundle, args.expected_revision, args.artifact_root, args.vault_transit_key, args.signing_gateway)
    except (AttestationError, OSError, UnicodeError) as error:
        print(f"release-attestation: FAIL: {error}", file=sys.stderr)
        return 1
    print(f"release-attestation: PASS mode={args.mode} revision={result['revision']} key={result['key']} key_version={result['key_version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
