#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / ".yana-ai/schemas/validator-output.schema.json"


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)


def _is_ci() -> bool:
    return os.getenv("CI", "").lower() in {"1", "true", "yes"}


def _fallback_validate(payload: dict) -> list[str]:
    errs: list[str] = []
    required = [
        "schema_version",
        "tool",
        "command",
        "status",
        "exit_code",
        "mode",
        "target",
        "findings",
        "summary",
    ]
    for k in required:
        if k not in payload:
            errs.append(f"missing top-level field: {k}")

    if payload.get("status") not in {"valid", "invalid", "error"}:
        errs.append("status must be valid|invalid|error")
    if payload.get("exit_code") not in {0, 1, 2}:
        errs.append("exit_code must be 0|1|2")

    findings = payload.get("findings")
    if not isinstance(findings, list):
        errs.append("findings must be an array")
    else:
        for i, f in enumerate(findings):
            if not isinstance(f, dict):
                errs.append(f"findings[{i}] must be object")
                continue
            for req in ("id", "severity", "message"):
                if req not in f:
                    errs.append(f"findings[{i}] missing {req}")

    summary = payload.get("summary")
    if not isinstance(summary, dict):
        errs.append("summary must be object")
    else:
        if "finding_count" not in summary:
            errs.append("summary.finding_count missing")

    if payload.get("command") == "validate-spec" and "context_pack" in payload:
        cp = payload["context_pack"]
        if not isinstance(cp, dict):
            errs.append("context_pack must be object")
        else:
            for req in ("target", "status", "mode", "finding_count"):
                if req not in cp:
                    errs.append(f"context_pack missing {req}")

    return errs


def _load_payload(cmd: list[str], expected_code: int) -> dict:
    p = run(cmd)
    if p.returncode != expected_code:
        raise SystemExit(
            f"unexpected code {p.returncode} expected={expected_code}\ncmd={' '.join(cmd)}\nstdout={p.stdout}\nstderr={p.stderr}"
        )
    try:
        return json.loads(p.stdout)
    except Exception as e:
        raise SystemExit(f"invalid JSON output for cmd={' '.join(cmd)}: {e}\nstdout={p.stdout}\nstderr={p.stderr}")


def _yana_ai_rt_available() -> bool:
    import shutil
    if shutil.which("yana-rt"):
        return True
    return (ROOT / "target" / "release" / "yana-rt").exists() or (ROOT / "target" / "debug" / "yana-rt").exists()


def main() -> int:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping validator JSON schema tests")
        return 0
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))

    payloads = [
        _load_payload(["bash", "bin/yana-ai", "check-context", "examples/context-packs/valid-basic", "--json"], 0),
        _load_payload(["bash", "bin/yana-ai", "check-context", "examples/context-packs/invalid-broad-scope", "--json"], 1),
        _load_payload(["bash", "bin/yana-ai", "validate-spec", "examples/specs/valid-task-spec.json", "--json"], 0),
        _load_payload([
            "bash",
            "bin/yana-ai",
            "validate-spec",
            "examples/specs/valid-task-spec.json",
            "--context-pack",
            "examples/context-packs/valid-basic",
            "--json",
        ], 0),
    ]

    try:
        from jsonschema import Draft202012Validator  # type: ignore

        validator = Draft202012Validator(schema)
        for i, payload in enumerate(payloads):
            errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
            if errors:
                msg = "; ".join(e.message for e in errors)
                raise SystemExit(f"schema validation failed for payload[{i}]: {msg}")
        print("OK: validator JSON schema checks passed with jsonschema.")
        return 0
    except Exception:
        if _is_ci():
            raise SystemExit("jsonschema is required in CI for validator JSON schema checks")

        for i, payload in enumerate(payloads):
            errs = _fallback_validate(payload)
            if errs:
                raise SystemExit(f"fallback validation failed for payload[{i}]: {'; '.join(errs)}")
        print("OK: validator JSON schema checks passed via fallback validation (jsonschema unavailable).")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
