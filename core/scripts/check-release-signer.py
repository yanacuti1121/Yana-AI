#!/usr/bin/env python3
"""Fail closed when the local Vault Agent cannot sign and verify release evidence."""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
PREFLIGHT_PAYLOAD = {"schema": "yana-release-signer-preflight/v1", "purpose": "verify-transit-signing-path"}
VaultRequest = Callable[[Path, str, dict[str, Any]], dict[str, Any]]


class PreflightError(ValueError):
    """Raised when the local release-signer path cannot be used safely."""


def load_attestation() -> ModuleType:
    path = SCRIPT_DIR / "attest-release-evidence.py"
    spec = importlib.util.spec_from_file_location("yana_release_attestation", path)
    if spec is None or spec.loader is None:
        raise PreflightError(f"could not load release attestation client: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ATTESTATION = load_attestation()


def preflight(socket_path: Path, key_name: str, request: VaultRequest = ATTESTATION.request_vault) -> int:
    try:
        key_name = ATTESTATION.validate_key_name(key_name)
        socket_path = ATTESTATION.validate_socket_path(socket_path)
        encoded = ATTESTATION.transit_input(PREFLIGHT_PAYLOAD)
        signed = ATTESTATION.require_mapping(
            request(socket_path, f"/v1/transit/sign/{key_name}/sha2-256", {"input": encoded}).get("data"),
            "Vault Transit preflight sign data",
        )
        signature = signed.get("signature")
        version = signed.get("key_version")
        if not isinstance(signature, str) or not signature.startswith("vault:v"):
            raise PreflightError("Vault Transit preflight sign response has no signature")
        if not isinstance(version, int) or isinstance(version, bool) or version < 1:
            raise PreflightError("Vault Transit preflight sign response has an invalid key version")
        verified = ATTESTATION.require_mapping(
            request(socket_path, f"/v1/transit/verify/{key_name}/sha2-256", {"input": encoded, "signature": signature}).get("data"),
            "Vault Transit preflight verify data",
        )
    except ATTESTATION.AttestationError as error:
        raise PreflightError(str(error)) from error
    if verified.get("valid") is not True:
        raise PreflightError("Vault Transit did not validate the preflight signature")
    return version


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check the local Vault Agent Transit release-signer path.")
    parser.add_argument("--vault-agent-socket", type=Path, required=True)
    parser.add_argument("--vault-transit-key", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        version = preflight(args.vault_agent_socket, args.vault_transit_key)
    except (PreflightError, OSError, UnicodeError) as error:
        print(f"release-signer-preflight: FAIL: {error}", file=sys.stderr)
        return 1
    print(f"release-signer-preflight: PASS key={args.vault_transit_key} key_version={version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
