#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str]):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True)


def _assert_ok(path: str) -> None:
    p = run(["bash", "bin/yana-ai", "check-context", path])
    if p.returncode != 0 or "Result: VALID" not in p.stdout:
        raise SystemExit(
            f"{path} should pass\ncode={p.returncode}\nstdout={p.stdout}\nstderr={p.stderr}"
        )


def _assert_invalid(path: str) -> None:
    p = run(["bash", "bin/yana-ai", "check-context", path])
    if p.returncode != 1 or "Result: INVALID" not in p.stdout:
        raise SystemExit(
            f"{path} should fail\ncode={p.returncode}\nstdout={p.stdout}\nstderr={p.stderr}"
        )


def _assert_json(path: str, expected_code: int, expected_status: str) -> dict:
    p = run(["bash", "bin/yana-ai", "check-context", path, "--json"])
    if p.returncode != expected_code:
        raise SystemExit(
            f"{path} json mode code mismatch\nexpected={expected_code}\ncode={p.returncode}\nstdout={p.stdout}\nstderr={p.stderr}"
        )
    try:
        payload = json.loads(p.stdout)
    except Exception as e:
        raise SystemExit(f"json parse failed for {path}: {e}\nstdout={p.stdout}\nstderr={p.stderr}")

    for key in ["schema_version", "command", "status", "exit_code", "findings", "summary"]:
        if key not in payload:
            raise SystemExit(f"missing key '{key}' in json payload: {payload}")

    if payload["schema_version"] != "1.0":
        raise SystemExit(f"unexpected schema_version: {payload['schema_version']}")
    if payload["command"] != "check-context":
        raise SystemExit(f"unexpected command: {payload['command']}")
    if payload["status"] != expected_status:
        raise SystemExit(f"unexpected status: {payload['status']} expected={expected_status}")
    if payload["exit_code"] != expected_code:
        raise SystemExit(f"unexpected exit_code in payload: {payload['exit_code']} expected={expected_code}")
    if not isinstance(payload["findings"], list):
        raise SystemExit("findings must be a list")
    if not isinstance(payload["summary"], dict):
        raise SystemExit("summary must be an object")
    if "finding_count" not in payload["summary"]:
        raise SystemExit("summary.finding_count is required")

    return payload


def _yana_ai_rt_available() -> bool:
    import shutil
    if shutil.which("yana-rt"):
        return True
    return (ROOT / "target" / "release" / "yana-rt").exists() or (ROOT / "target" / "debug" / "yana-rt").exists()


def main() -> int:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping context-pack regression tests")
        return 0
    _assert_ok("examples/context-packs/valid-basic")
    _assert_ok("examples/context-packs/valid-with-narrow-globs")

    _assert_invalid("examples/context-packs/invalid-broad-scope")
    _assert_invalid("examples/context-packs/invalid-vague-content")

    miss = run(["bash", "bin/yana-ai", "check-context", "examples/context-packs/not-found"])
    if miss.returncode != 2:
        raise SystemExit(
            f"missing dir should return code 2\ncode={miss.returncode}\nstdout={miss.stdout}\nstderr={miss.stderr}"
        )

    valid_json = _assert_json("examples/context-packs/valid-basic", 0, "valid")
    if valid_json["findings"]:
        raise SystemExit(f"valid json findings should be empty: {valid_json['findings']}")

    invalid_json = _assert_json("examples/context-packs/invalid-broad-scope", 1, "invalid")
    if not invalid_json["findings"]:
        raise SystemExit("invalid json findings should not be empty")

    _assert_json("examples/context-packs/not-found", 2, "error")

    print("OK: context-pack check regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
