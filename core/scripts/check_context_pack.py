#!/usr/bin/env python3
"""Minimal Phase 1B context-pack checker (dependency-free)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

REQUIRED = ["goal.md", "constraints.md", "affected-files.md", "test-plan.md", "out-of-scope.md"]
BROAD_EXACT = {"/", ".", "./", "*", "/**"}
BROAD_PHRASES = ["repo root", "entire repo", "whole repo"]
CONSTRAINT_CUES = ["forbidden", "must not", "do not", "no commit", "no push"]
TEST_CUES = ["test", "command", "python3", "bash", "expected", "evidence"]
VAGUE_ONLY = ["tbd", "n/a", "none", "later"]


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace").strip()


def _mk_finding(message: str, *, finding_id: str = "CTX001", severity: str = "medium", file: str | None = None, rule: str | None = None) -> dict[str, str]:
    finding: dict[str, str] = {"id": finding_id, "severity": severity, "message": message}
    if file:
        finding["file"] = file
    if rule:
        finding["rule"] = rule
    return finding


def validate_context_pack(cp: Path) -> tuple[int, list[str]]:
    if not cp.exists() or not cp.is_dir():
        return 2, ["Context pack directory not found"]

    errs: list[str] = []
    contents: dict[str, str] = {}

    for name in REQUIRED:
        f = cp / name
        if not f.exists():
            errs.append(f"Missing required file: {name}")
            continue
        txt = read_text(f)
        contents[name] = txt
        if not txt:
            errs.append(f"Required file is empty: {name}")

    if "affected-files.md" in contents:
        af = contents["affected-files.md"].lower()
        broad = False
        for raw in af.splitlines():
            line = raw.strip()
            if line.startswith("#"):
                continue
            line = line.lstrip("-*").strip()
            if not line:
                continue
            if line in BROAD_EXACT:
                broad = True
                break
            if any(p in line for p in BROAD_PHRASES):
                broad = True
                break
        if broad:
            errs.append("affected-files.md contains broad scope patterns")

    if "constraints.md" in contents:
        c = contents["constraints.md"].lower()
        if not any(k in c for k in CONSTRAINT_CUES):
            errs.append("constraints.md does not mention forbidden-action constraints")

    if "test-plan.md" in contents:
        t = contents["test-plan.md"].lower()
        if not any(k in t for k in TEST_CUES):
            errs.append("test-plan.md missing concrete verification cues")

    if "out-of-scope.md" in contents:
        o = contents["out-of-scope.md"].lower().strip()
        if o in VAGUE_ONLY or (o.startswith("#") and any(v in o for v in VAGUE_ONLY) and len(o.split()) <= 6):
            errs.append("out-of-scope.md is vague-only content")

    if errs:
        return 1, errs

    return 0, []


def _json_payload(*, target: str, status: str, exit_code: int, findings: list[dict[str, str]]) -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "tool": "yamtam",
        "command": "check-context",
        "status": status,
        "exit_code": exit_code,
        "mode": "rule-based",
        "target": target,
        "findings": findings,
        "summary": {"finding_count": len(findings)},
    }


def main() -> int:
    json_mode = False
    args: list[str] = []
    for arg in sys.argv[1:]:
        if arg == "--json":
            json_mode = True
            continue
        args.append(arg)

    if len(args) != 1:
        if json_mode:
            payload = _json_payload(
                target="",
                status="error",
                exit_code=2,
                findings=[_mk_finding("Usage: yamtam check-context <context-pack-dir> [--json]", finding_id="CTXUSAGE", severity="high")],
            )
            print(json.dumps(payload, ensure_ascii=False))
        else:
            print("Error: Usage: yamtam check-context <context-pack-dir>", file=sys.stderr)
        return 2

    cp = Path(args[0]).resolve()

    code, errs = validate_context_pack(cp)

    if json_mode:
        if code == 0:
            payload = _json_payload(target=str(cp), status="valid", exit_code=0, findings=[])
        elif code == 1:
            findings = [_mk_finding(msg, finding_id="CTXRULE", severity="medium") for msg in errs]
            payload = _json_payload(target=str(cp), status="invalid", exit_code=1, findings=findings)
        else:
            findings = [_mk_finding(msg, finding_id="CTXERROR", severity="high") for msg in errs]
            payload = _json_payload(target=str(cp), status="error", exit_code=2, findings=findings)
        print(json.dumps(payload, ensure_ascii=False))
        return code

    print(f"Context-Pack Check: {cp}")
    if code == 2:
        print("Result: INVALID (usage/internal)")
        for e in errs:
            print(f" - {e}")
        return 2
    if code == 1:
        print("Result: INVALID")
        for e in errs:
            print(f" - {e}")
        return 1

    print("Result: VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
