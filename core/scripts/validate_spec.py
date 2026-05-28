#!/usr/bin/env python3
"""Validate task spec file against .yamtam/schemas/spec.schema.json.

Exit codes:
  0 valid
  1 invalid spec
  2 usage/dependency/internal error
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from check_context_pack import validate_context_pack


def _fail(msg: str, code: int = 2) -> int:
    print(f"Error: {msg}", file=sys.stderr)
    return code


def _load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in {path}: {e}")


def _is_ci() -> bool:
    return os.getenv("CI", "").lower() in {"1", "true", "yes"}


def _fallback_validate(spec: dict) -> list[str]:
    errs: list[str] = []

    for key in ("id", "title", "goal", "scope", "acceptance_criteria", "verification_plan"):
        if key not in spec:
            errs.append(f"Missing required field: {key}")

    if "acceptance_criteria" in spec:
        ac = spec.get("acceptance_criteria")
        if not isinstance(ac, list) or not ac:
            errs.append("acceptance_criteria must be a non-empty array")

    vp = spec.get("verification_plan")
    if isinstance(vp, list):
        for i, item in enumerate(vp):
            if not isinstance(item, dict):
                errs.append(f"verification_plan[{i}] must be an object")
                continue
            for field in ("type", "expected_evidence", "required"):
                if field not in item:
                    errs.append(f"verification_plan[{i}] missing '{field}'")
            if "required" in item and not isinstance(item["required"], bool):
                errs.append(f"verification_plan[{i}].required must be boolean")
    else:
        errs.append("verification_plan must be an array")

    return errs


def _mk_finding(message: str, *, finding_id: str, severity: str = "medium", file: str | None = None, rule: str | None = None) -> dict[str, str]:
    f: dict[str, str] = {"id": finding_id, "severity": severity, "message": message}
    if file:
        f["file"] = file
    if rule:
        f["rule"] = rule
    return f


def _json_payload(*, status: str, exit_code: int, mode: str, target: str, findings: list[dict[str, str]], context_pack: dict[str, object]) -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "tool": "yamtam",
        "command": "validate-spec",
        "status": status,
        "exit_code": exit_code,
        "mode": mode,
        "target": target,
        "context_pack": context_pack,
        "findings": findings,
        "summary": {"finding_count": len(findings)},
    }


def _parse_args(argv: list[str]) -> tuple[Path, Path | None, bool] | None:
    args = argv[1:]
    json_mode = False
    if "--json" in args:
        args = [a for a in args if a != "--json"]
        json_mode = True

    if len(args) not in (1, 3):
        return None

    spec_path = Path(args[0]).resolve()
    context_pack = None
    if len(args) == 3:
        if args[1] != "--context-pack":
            return None
        context_pack = Path(args[2]).resolve()
    return spec_path, context_pack, json_mode


def main() -> int:
    parsed = _parse_args(sys.argv)
    if parsed is None:
        return _fail("Usage: yamtam validate-spec <spec-file> [--context-pack <context-pack-dir>] [--json]")

    spec_path, context_pack_path, json_mode = parsed
    repo_root = Path(__file__).resolve().parents[2]
    schema_path = repo_root / ".yamtam/schemas/spec.schema.json"

    mode = "fallback-structural"
    cp_payload: dict[str, object] = {
        "target": str(context_pack_path) if context_pack_path else "",
        "status": "not_provided",
        "mode": "rule-based",
        "finding_count": 0,
    }

    if not spec_path.exists():
        if json_mode:
            payload = _json_payload(
                status="error",
                exit_code=2,
                mode=mode,
                target=str(spec_path),
                findings=[_mk_finding(f"Spec file not found: {spec_path}", finding_id="SPECERROR", severity="high")],
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 2
        return _fail(f"Spec file not found: {spec_path}")
    if not schema_path.exists():
        if json_mode:
            payload = _json_payload(
                status="error",
                exit_code=2,
                mode=mode,
                target=str(spec_path),
                findings=[_mk_finding(f"Schema file not found: {schema_path}", finding_id="SPECERROR", severity="high")],
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 2
        return _fail(f"Schema file not found: {schema_path}")

    try:
        spec_obj = _load_json(spec_path)
        schema_obj = _load_json(schema_path)
    except FileNotFoundError as e:
        if json_mode:
            payload = _json_payload(
                status="error",
                exit_code=2,
                mode=mode,
                target=str(spec_path),
                findings=[_mk_finding(str(e), finding_id="SPECERROR", severity="high")],
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 2
        return _fail(str(e))
    except ValueError as e:
        if json_mode:
            payload = _json_payload(
                status="error",
                exit_code=2,
                mode=mode,
                target=str(spec_path),
                findings=[_mk_finding(str(e), finding_id="SPECERROR", severity="high")],
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 2
        return _fail(str(e))

    if not isinstance(spec_obj, dict):
        if json_mode:
            payload = _json_payload(
                status="invalid",
                exit_code=1,
                mode=mode,
                target=str(spec_path),
                findings=[_mk_finding("spec root must be a JSON object", finding_id="SPECRULE", severity="medium")],
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 1
        print("INVALID: spec root must be a JSON object")
        return 1

    errors: list[str] = []

    try:
        from jsonschema import Draft202012Validator  # type: ignore

        mode = "full-jsonschema"
        validator = Draft202012Validator(schema_obj)
        for err in validator.iter_errors(spec_obj):
            loc = ".".join(str(p) for p in err.path)
            prefix = f"{loc}: " if loc else ""
            errors.append(prefix + err.message)
    except Exception:
        if _is_ci():
            if json_mode:
                payload = _json_payload(
                    status="error",
                    exit_code=2,
                    mode=mode,
                    target=str(spec_path),
                    findings=[_mk_finding("jsonschema is required in CI for full validate-spec checks", finding_id="SPECERROR", severity="high")],
                    context_pack=cp_payload,
                )
                print(json.dumps(payload, ensure_ascii=False))
                return 2
            return _fail("jsonschema is required in CI for full validate-spec checks")
        mode = "fallback-structural"
        errors = _fallback_validate(spec_obj)

    if errors:
        if json_mode:
            findings = [_mk_finding(msg, finding_id="SPECRULE", severity="medium") for msg in errors]
            payload = _json_payload(
                status="invalid",
                exit_code=1,
                mode=mode,
                target=str(spec_path),
                findings=findings,
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 1

        print(f"Spec Validator mode: {mode}")
        print(f"Spec file: {spec_path}")
        print("Spec result: INVALID")
        for e in errors:
            print(f" - {e}")
        print("Final result: INVALID")
        return 1

    cp_code = 0
    cp_errors: list[str] = []
    if context_pack_path is not None:
        cp_code, cp_errors = validate_context_pack(context_pack_path)
        cp_payload = {
            "target": str(context_pack_path),
            "status": "valid" if cp_code == 0 else ("invalid" if cp_code == 1 else "error"),
            "mode": "rule-based",
            "finding_count": len(cp_errors),
        }

    if json_mode:
        if context_pack_path is None:
            payload = _json_payload(
                status="valid",
                exit_code=0,
                mode=mode,
                target=str(spec_path),
                findings=[],
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 0

        if cp_code == 0:
            payload = _json_payload(
                status="valid",
                exit_code=0,
                mode=mode,
                target=str(spec_path),
                findings=[],
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 0

        if cp_code == 1:
            findings = [_mk_finding(msg, finding_id="CTXRULE", severity="medium") for msg in cp_errors]
            payload = _json_payload(
                status="invalid",
                exit_code=1,
                mode=mode,
                target=str(spec_path),
                findings=findings,
                context_pack=cp_payload,
            )
            print(json.dumps(payload, ensure_ascii=False))
            return 1

        findings = [_mk_finding(msg, finding_id="CTXERROR", severity="high") for msg in cp_errors]
        payload = _json_payload(
            status="error",
            exit_code=2,
            mode=mode,
            target=str(spec_path),
            findings=findings,
            context_pack=cp_payload,
        )
        print(json.dumps(payload, ensure_ascii=False))
        return 2

    print(f"Spec Validator mode: {mode}")
    print(f"Spec file: {spec_path}")
    print("Spec result: VALID")

    if context_pack_path is not None:
        print(f"Context-Pack path: {context_pack_path}")
        if cp_code == 2:
            print("Context-Pack result: INVALID (usage/internal)")
            for e in cp_errors:
                print(f" - {e}")
            print("Final result: INVALID")
            return 2
        if cp_code == 1:
            print("Context-Pack result: INVALID")
            for e in cp_errors:
                print(f" - {e}")
            print("Final result: INVALID")
            return 1
        print("Context-Pack result: VALID")

    print("Final result: VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
