#!/usr/bin/env python3
"""Run Yana AI's release verification outside GitHub Actions.

The gate is intentionally a local orchestration layer: it invokes the same
checked-in commands used by CI, writes durable evidence, and never deploys,
publishes, or mutates a release. A self-hosted runner can make promotion
decisions from its JSON report without needing GitHub to be available.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_SCHEMA = "yana-release-gate/v1"


@dataclass(frozen=True)
class Check:
    name: str
    description: str
    command: tuple[str, ...] | None = None
    handler: Callable[[Path, bool], tuple[int, str, str]] | None = None


def run_command(command: tuple[str, ...], root: Path, environment: dict[str, str]) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(command, cwd=root, env=environment, capture_output=True, text=True, check=False)
    except OSError as error:
        return 127, "", f"could not execute {command[0]}: {error}\n"
    return completed.returncode, completed.stdout, completed.stderr


def git_state(root: Path, allow_dirty: bool) -> tuple[int, str, str]:
    code, stdout, stderr = run_command(("git", "status", "--porcelain"), root, os.environ.copy())
    if code != 0:
        return code, stdout, stderr
    if stdout.strip() and not allow_dirty:
        return 1, stdout, "release gate requires a clean working tree; use --allow-dirty only for local diagnostics\n"
    if stdout.strip():
        return 0, stdout, "working tree is dirty; accepted only because --allow-dirty was set\n"
    return 0, stdout, stderr


def shell_syntax(root: Path, _allow_dirty: bool) -> tuple[int, str, str]:
    targets = sorted((root / "core/hooks").glob("*.sh")) + sorted((root / "core/scripts").glob("*.sh"))
    if not targets:
        return 2, "", "no shell files found under core/hooks or core/scripts\n"
    return run_command(("bash", "-n", *(str(path) for path in targets)), root, os.environ.copy())


def check_definitions(root: Path) -> dict[str, Check]:
    checks = [
        Check("git-state", "Clean working tree", handler=git_state),
        Check("shell-syntax", "Bash syntax for core hooks and scripts", handler=shell_syntax),
        Check("drift", "Manifest, metadata, and documentation drift", ("bash", "core/scripts/drift-check.sh")),
        Check("core-lock", "Pinned core infrastructure integrity", ("bash", "core/scripts/verify-core-lock.sh")),
        Check("hook-mirrors", "Claude and Codex hook mirrors", ("bash", "core/scripts/verify-hook-mirrors.sh")),
        Check("source-only-contract", "Fresh-target Codex generation contract", ("bash", "core/tests/codex/test-source-only-adapter-contract.sh")),
        Check("codex-support", "Codex support and engine parity", ("bash", "core/tests/codex/test-codex-support.sh")),
        Check("rust-build", "Release yana-rt build", ("cargo", "build", "--release", "--bin", "yana-rt")),
        Check("rust-unit", "Rust unit tests", ("cargo", "test", "--bin", "yana-rt", "--", "--test-threads=1")),
        Check("rust-integration", "Rust integration tests", ("cargo", "test", "--test", "integration_runtime", "--", "--test-threads=4")),
        Check("hook-tests", "Hook regression suite", ("bash", "core/tests/hooks/run-hook-tests.sh")),
        Check("npm-package", "npm package surface", ("npm", "pack", "--dry-run")),
    ]
    if (root / "core/tests/locking/test-flock-v1-production.sh").is_file():
        checks.append(Check("flock-v1", "Kernel flock production matrix", ("bash", "core/tests/locking/test-flock-v1-production.sh")))
    return {check.name: check for check in checks}


def select_checks(available: dict[str, Check], requested: list[str], skipped: set[str]) -> list[Check]:
    names = requested or list(available)
    unknown = sorted(set(names).union(skipped).difference(available))
    if unknown:
        raise ValueError(f"unknown check name(s): {', '.join(unknown)}")
    selected = [available[name] for name in names if name not in skipped]
    if not selected:
        raise ValueError("no checks selected")
    return selected


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest(), path.stat().st_size


def collect_artifacts(
    root: Path,
    requested: list[str],
    include_runtime: bool = False,
) -> list[dict[str, object]]:
    root = root.resolve()
    requested_paths = [
        path if path.is_absolute() else root / path
        for item in requested
        for path in [Path(item).expanduser()]
    ]
    candidates = [*requested_paths]
    if include_runtime:
        candidates.insert(0, root / "target/release/yana-rt")
    artifacts: list[dict[str, object]] = []
    seen: set[Path] = set()
    for candidate in candidates:
        path = candidate.resolve()
        if path in seen or not path.exists():
            continue
        if not path.is_file():
            raise ValueError(f"artifact must be a regular file: {candidate}")
        seen.add(path)
        digest, size = sha256_file(path)
        try:
            display_path = str(path.relative_to(root))
        except ValueError:
            display_path = str(path)
        artifacts.append({"path": display_path, "sha256": digest, "bytes": size})
    missing = [str(path) for path in requested_paths if not path.exists()]
    if missing:
        raise ValueError(f"requested artifact(s) not found: {', '.join(missing)}")
    return artifacts


def write_checksums(output: Path, artifacts: list[dict[str, object]]) -> None:
    lines = [f"{artifact['sha256']}  {artifact['path']}" for artifact in artifacts]
    (output / "checksums.sha256").write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def write_report(output: Path, report: dict[str, object]) -> Path:
    report_path = output / "report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    digest, _ = sha256_file(report_path)
    (output / "report.sha256").write_text(f"{digest}  report.json\n", encoding="utf-8")
    return report_path


def git_revision(root: Path) -> str | None:
    code, stdout, _ = run_command(("git", "rev-parse", "HEAD"), root, os.environ.copy())
    return stdout.strip() if code == 0 else None


def create_output_dir(root: Path, requested: str | None) -> Path:
    if requested:
        output = Path(requested).expanduser().resolve()
    else:
        run_id = f"{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}-{os.getpid()}"
        output = root / "artifacts" / "release-gate" / run_id
    output.mkdir(parents=True, exist_ok=False)
    (output / "checks").mkdir()
    return output


def environment_for_gate(root: Path, output: Path) -> dict[str, str]:
    environment = os.environ.copy()
    environment["CLAUDE_PROJECT_DIR"] = str(root)
    environment["YANA_PROJECT_ROOT"] = str(root)
    environment["YANA_RT_BIN"] = str(root / "target/release/yana-rt")
    environment["npm_config_cache"] = str(output / "npm-cache")
    return environment


def execute_check(check: Check, root: Path, allow_dirty: bool, environment: dict[str, str]) -> tuple[int, str, str]:
    if check.handler is not None:
        return check.handler(root, allow_dirty)
    assert check.command is not None
    return run_command(check.command, root, environment)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the self-hosted Yana AI release gate.")
    parser.add_argument("--output", help="New directory for report.json and per-check logs.")
    parser.add_argument("--artifact", action="append", default=[], help="Additional artifact to checksum (repeatable).")
    parser.add_argument("--check", action="append", default=[], help="Run only a named check (repeatable).")
    parser.add_argument("--skip", action="append", default=[], help="Skip a named check (repeatable).")
    parser.add_argument("--allow-dirty", action="store_true", help="Allow a dirty worktree for diagnostics only.")
    parser.add_argument("--list-checks", action="store_true", help="List available checks and exit.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    available = check_definitions(REPO_ROOT)
    if args.list_checks:
        for check in available.values():
            print(f"{check.name}\t{check.description}")
        return 0

    try:
        checks = select_checks(available, args.check, set(args.skip))
        output = create_output_dir(REPO_ROOT, args.output)
    except (OSError, ValueError) as error:
        print(f"release-gate: {error}", file=sys.stderr)
        return 2

    environment = environment_for_gate(REPO_ROOT, output)
    diagnostic_mode = args.allow_dirty or bool(args.check) or bool(args.skip)
    started_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    started = time.monotonic()
    results: list[dict[str, object]] = []
    for check in checks:
        check_started = time.monotonic()
        code, stdout, stderr = execute_check(check, REPO_ROOT, args.allow_dirty, environment)
        stdout_path = output / "checks" / f"{check.name}.stdout.log"
        stderr_path = output / "checks" / f"{check.name}.stderr.log"
        stdout_path.write_text(stdout, encoding="utf-8")
        stderr_path.write_text(stderr, encoding="utf-8")
        result = {
            "name": check.name,
            "description": check.description,
            "command": list(check.command) if check.command is not None else None,
            "status": "passed" if code == 0 else "failed",
            "exit_code": code,
            "duration_seconds": round(time.monotonic() - check_started, 3),
            "stdout": str(stdout_path.relative_to(output)),
            "stderr": str(stderr_path.relative_to(output)),
        }
        results.append(result)
        print(f"{'PASS' if code == 0 else 'FAIL'} {check.name} ({result['duration_seconds']}s)")

    try:
        runtime_built = any(
            result["name"] == "rust-build" and result["status"] == "passed"
            for result in results
        )
        artifacts = collect_artifacts(REPO_ROOT, args.artifact, include_runtime=runtime_built)
    except ValueError as error:
        results.append({"name": "artifacts", "description": "Requested artifact validation", "status": "failed", "exit_code": 2, "duration_seconds": 0, "stdout": None, "stderr": str(error)})
        artifacts = []
    write_checksums(output, artifacts)

    passed = all(result["status"] == "passed" for result in results)
    report = {
        "schema": REPORT_SCHEMA,
        "result": "passed" if passed else "failed",
        "mode": "diagnostic" if diagnostic_mode else "release",
        "release_eligible": passed and not diagnostic_mode,
        "started_at": started_at,
        "duration_seconds": round(time.monotonic() - started, 3),
        "repository": {"root": str(REPO_ROOT), "git_revision": git_revision(REPO_ROOT), "platform": platform.platform(), "python": platform.python_version()},
        "checks": results,
        "artifacts": artifacts,
    }
    report_path = write_report(output, report)
    print(f"REPORT {report_path}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
