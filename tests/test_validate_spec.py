#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str]):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)


def _assert_json(cmd: list[str], expected_code: int, expected_status: str) -> dict:
    p = run(cmd)
    if p.returncode != expected_code:
        raise SystemExit(
            f"json mode code mismatch\ncmd={' '.join(cmd)}\nexpected={expected_code}\ncode={p.returncode}\nstdout={p.stdout}\nstderr={p.stderr}"
        )
    try:
        payload = json.loads(p.stdout)
    except Exception as e:
        raise SystemExit(f"json parse failed: {e}\ncmd={' '.join(cmd)}\nstdout={p.stdout}\nstderr={p.stderr}")

    for key in ["schema_version", "command", "status", "exit_code", "mode", "findings", "summary", "context_pack"]:
        if key not in payload:
            raise SystemExit(f"missing key '{key}' in payload: {payload}")

    if payload["schema_version"] != "1.0":
        raise SystemExit(f"unexpected schema_version: {payload['schema_version']}")
    if payload["command"] != "validate-spec":
        raise SystemExit(f"unexpected command: {payload['command']}")
    if payload["status"] != expected_status:
        raise SystemExit(f"unexpected status: {payload['status']} expected={expected_status}")
    if payload["exit_code"] != expected_code:
        raise SystemExit(f"unexpected exit_code payload: {payload['exit_code']} expected={expected_code}")
    if not isinstance(payload["findings"], list):
        raise SystemExit("findings must be list")
    if not isinstance(payload["summary"], dict) or "finding_count" not in payload["summary"]:
        raise SystemExit("summary.finding_count missing")
    if not isinstance(payload["context_pack"], dict):
        raise SystemExit("context_pack must be object")

    return payload


def _yamtam_rt_available() -> bool:
    import shutil
    if shutil.which("yamtam-rt"):
        return True
    return (ROOT / "target" / "release" / "yamtam-rt").exists() or (ROOT / "target" / "debug" / "yamtam-rt").exists()


def main() -> int:
    if not _yamtam_rt_available():
        print("SKIP: yamtam-rt not installed — skipping validate-spec regression tests")
        return 0
    ok = run(["bash", "bin/yamtam", "validate-spec", "examples/specs/valid-task-spec.json"])
    if ok.returncode != 0 or "Final result: VALID" not in ok.stdout:
        raise SystemExit(
            f"valid spec failed\ncode={ok.returncode}\nstdout={ok.stdout}\nstderr={ok.stderr}"
        )

    bad = run(["bash", "bin/yamtam", "validate-spec", "examples/specs/invalid-task-spec.json"])
    if bad.returncode != 1 or "Final result: INVALID" not in bad.stdout:
        raise SystemExit(
            f"invalid spec did not fail as expected\ncode={bad.returncode}\nstdout={bad.stdout}\nstderr={bad.stderr}"
        )

    ok_cp = run([
        "bash",
        "bin/yamtam",
        "validate-spec",
        "examples/specs/valid-task-spec.json",
        "--context-pack",
        "examples/context-packs/valid-basic",
    ])
    if ok_cp.returncode != 0 or "Final result: VALID" not in ok_cp.stdout:
        raise SystemExit(
            f"valid spec + valid context pack failed\ncode={ok_cp.returncode}\nstdout={ok_cp.stdout}\nstderr={ok_cp.stderr}"
        )

    bad_cp = run([
        "bash",
        "bin/yamtam",
        "validate-spec",
        "examples/specs/valid-task-spec.json",
        "--context-pack",
        "examples/context-packs/invalid-broad-scope",
    ])
    if bad_cp.returncode != 1 or "Context-Pack result: INVALID" not in bad_cp.stdout:
        raise SystemExit(
            f"valid spec + invalid context pack should fail\ncode={bad_cp.returncode}\nstdout={bad_cp.stdout}\nstderr={bad_cp.stderr}"
        )

    miss_cp = run([
        "bash",
        "bin/yamtam",
        "validate-spec",
        "examples/specs/valid-task-spec.json",
        "--context-pack",
        "examples/context-packs/not-found",
    ])
    if miss_cp.returncode != 2:
        raise SystemExit(
            f"valid spec + missing context pack should return 2\ncode={miss_cp.returncode}\nstdout={miss_cp.stdout}\nstderr={miss_cp.stderr}"
        )

    js_ok = _assert_json(
        ["bash", "bin/yamtam", "validate-spec", "examples/specs/valid-task-spec.json", "--json"],
        0,
        "valid",
    )
    if js_ok["context_pack"]["status"] != "not_provided":
        raise SystemExit("json valid spec should mark context_pack.status=not_provided")

    js_bad = _assert_json(
        ["bash", "bin/yamtam", "validate-spec", "examples/specs/invalid-task-spec.json", "--json"],
        1,
        "invalid",
    )
    if not js_bad["findings"]:
        raise SystemExit("invalid spec json should include findings")

    js_ok_cp = _assert_json(
        [
            "bash",
            "bin/yamtam",
            "validate-spec",
            "examples/specs/valid-task-spec.json",
            "--context-pack",
            "examples/context-packs/valid-basic",
            "--json",
        ],
        0,
        "valid",
    )
    if js_ok_cp["context_pack"]["status"] != "valid":
        raise SystemExit("valid context pack should be status=valid")

    js_bad_cp = _assert_json(
        [
            "bash",
            "bin/yamtam",
            "validate-spec",
            "examples/specs/valid-task-spec.json",
            "--context-pack",
            "examples/context-packs/invalid-broad-scope",
            "--json",
        ],
        1,
        "invalid",
    )
    if js_bad_cp["context_pack"]["status"] != "invalid":
        raise SystemExit("invalid context pack should be status=invalid")

    js_miss_cp = _assert_json(
        [
            "bash",
            "bin/yamtam",
            "validate-spec",
            "examples/specs/valid-task-spec.json",
            "--context-pack",
            "examples/context-packs/not-found",
            "--json",
        ],
        2,
        "error",
    )
    if js_miss_cp["context_pack"]["status"] != "error":
        raise SystemExit("missing context pack should be status=error")

    print("OK: validate-spec regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
