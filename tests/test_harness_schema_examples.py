#!/usr/bin/env python3
"""Validate Harness Scaling schema examples.

- With jsonschema: full semantic validation against schemas.
- Without jsonschema locally: run fallback structural checks.
- Without jsonschema in CI: fail loudly.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SPEC_SCHEMA = ROOT / ".yamtam/schemas/spec.schema.json"
RUNLOG_SCHEMA = ROOT / ".yamtam/schemas/run-log.schema.json"
SPEC_MIN = ROOT / ".yamtam/schemas/examples/spec.min.json"
SPEC_FULL = ROOT / ".yamtam/schemas/examples/spec.full.json"
RUNLOG_MIN = ROOT / ".yamtam/schemas/examples/run-log.min.json"
RUNLOG_FULL = ROOT / ".yamtam/schemas/examples/run-log.full.json"


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _is_ci() -> bool:
    return os.getenv("CI", "").lower() in {"1", "true", "yes"}


def _fail(msg: str) -> int:
    print(f"ERROR: {msg}", file=sys.stderr)
    return 1


def _fallback_validate(spec_full: dict, runlog_min: dict, runlog_full: dict) -> int:
    vp = spec_full.get("verification_plan")
    if not isinstance(vp, list) or not vp:
        return _fail("spec.full.json verification_plan must be a non-empty array")

    for i, item in enumerate(vp):
        if not isinstance(item, dict):
            return _fail(f"verification_plan[{i}] must be an object")
        for field in ("type", "expected_evidence", "required"):
            if field not in item:
                return _fail(f"verification_plan[{i}] missing '{field}'")
        if not isinstance(item["required"], bool):
            return _fail(f"verification_plan[{i}].required must be boolean")

    for name, payload in (("run-log.min.json", runlog_min), ("run-log.full.json", runlog_full)):
        if not isinstance(payload.get("status"), str) or not payload.get("status"):
            return _fail(f"{name} must include non-empty status")

    if runlog_full.get("status") == "completed" and "ended_at" not in runlog_full:
        return _fail("run-log.full.json with status=completed must include ended_at")

    evidence = runlog_full.get("verification", {}).get("evidence")
    if evidence is not None:
        if not isinstance(evidence, list):
            return _fail("run-log.full.json verification.evidence must be an array")
        for i, item in enumerate(evidence):
            if not isinstance(item, dict):
                return _fail(f"evidence[{i}] must be an object")
            for field in ("kind", "ref"):
                if field not in item:
                    return _fail(f"evidence[{i}] missing '{field}'")

    print("OK: fallback validation passed locally (jsonschema unavailable).")
    return 0


def main() -> int:
    spec_schema = _load(SPEC_SCHEMA)
    runlog_schema = _load(RUNLOG_SCHEMA)
    spec_min = _load(SPEC_MIN)
    spec_full = _load(SPEC_FULL)
    runlog_min = _load(RUNLOG_MIN)
    runlog_full = _load(RUNLOG_FULL)

    try:
        from jsonschema import Draft202012Validator  # type: ignore
    except Exception:
        if _is_ci():
            return _fail("jsonschema is missing in CI; full semantic validation is required")
        return _fallback_validate(spec_full, runlog_min, runlog_full)

    Draft202012Validator(spec_schema).validate(spec_min)
    Draft202012Validator(spec_schema).validate(spec_full)
    Draft202012Validator(runlog_schema).validate(runlog_min)
    Draft202012Validator(runlog_schema).validate(runlog_full)
    print("OK: FULL schema validation ran with jsonschema.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
