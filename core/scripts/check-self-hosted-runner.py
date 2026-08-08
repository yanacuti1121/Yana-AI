#!/usr/bin/env python3
"""Fail closed when a host cannot run Yana AI's self-hosted release gate."""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_SCHEMA = "yana-self-hosted-runner-preflight/v1"
REQUIRED_COMMANDS = {
    "bash": ("bash", "--version"),
    "git": ("git", "--version"),
    "node": ("node", "--version"),
    "npm": ("npm", "--version"),
    "cargo": ("cargo", "--version"),
    "rustc": ("rustc", "--version"),
}


@dataclass(frozen=True)
class CheckResult:
    name: str
    status: str
    detail: str


def result(name: str, passed: bool, detail: str) -> CheckResult:
    return CheckResult(name, "passed" if passed else "failed", detail)


def run(command: Sequence[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False, timeout=30)


def command_check(name: str, command: Sequence[str]) -> CheckResult:
    executable = shutil.which(command[0])
    if executable is None:
        return result(name, False, f"required command is not on PATH: {command[0]}")
    try:
        completed = run(command)
    except (OSError, subprocess.TimeoutExpired) as error:
        return result(name, False, f"could not execute {command[0]}: {error}")
    detail = (completed.stdout or completed.stderr).strip().splitlines()
    version = detail[0] if detail else f"exit {completed.returncode}"
    return result(name, completed.returncode == 0, version)


def python_check(python: str) -> CheckResult:
    if shutil.which(python) is None:
        return result("python", False, f"selected interpreter is not on PATH: {python}")
    try:
        completed = run((python, "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"))
    except (OSError, subprocess.TimeoutExpired) as error:
        return result("python", False, f"could not execute {python}: {error}")
    if completed.returncode != 0:
        return result("python", False, (completed.stderr or "Python version probe failed").strip())
    try:
        major, minor, _patch = (int(part) for part in completed.stdout.strip().split("."))
    except ValueError:
        return result("python", False, f"could not parse Python version: {completed.stdout.strip()!r}")
    return result("python", (major, minor) >= (3, 11), f"Python {completed.stdout.strip()} (requires 3.11+)")


def pytest_check(python: str) -> CheckResult:
    try:
        completed = run((python, "-c", "import pytest; print(pytest.__version__)"))
    except (OSError, subprocess.TimeoutExpired) as error:
        return result("pytest", False, f"could not import pytest: {error}")
    if completed.returncode != 0:
        lines = (completed.stderr or "pytest is not importable").strip().splitlines()
        return result("pytest", False, lines[-1] if lines else "pytest is not importable")
    return result("pytest", True, f"pytest {completed.stdout.strip()}")


def platform_check() -> CheckResult:
    system = platform.system()
    return result(
        "platform",
        system in {"Darwin", "Linux"},
        f"{system} {platform.release()} (supported: Darwin, Linux)",
    )


def artifact_root_check(artifact_root: Path) -> CheckResult:
    if not artifact_root.is_dir() or artifact_root.is_symlink():
        return result("artifact-root", False, f"artifact root is missing or unsafe: {artifact_root}")
    try:
        with tempfile.NamedTemporaryFile(dir=artifact_root, prefix=".yana-preflight-", delete=True):
            pass
    except OSError as error:
        return result("artifact-root", False, f"artifact root is not writable: {error}")
    available = shutil.disk_usage(artifact_root).free
    return result("artifact-root", True, f"writable; {available} bytes free")


def runner_contract_check(checkout: Path, artifact_root: Path, python: str) -> CheckResult:
    wrapper = checkout / "core/scripts/run-self-hosted-release-gate.sh"
    if not wrapper.is_file():
        return result("runner-contract", False, f"runner wrapper is missing: {wrapper}")
    environment = os.environ | {"YANA_RELEASE_PYTHON": python}
    try:
        completed = subprocess.run(
            ("bash", str(wrapper), "--checkout", str(checkout), "--artifact-root", str(artifact_root), "--dry-run"),
            text=True,
            capture_output=True,
            check=False,
            timeout=30,
            env=environment,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return result("runner-contract", False, f"could not validate runner wrapper: {error}")
    detail = (completed.stdout if completed.returncode == 0 else completed.stderr).strip()
    return result("runner-contract", completed.returncode == 0, detail or f"exit {completed.returncode}")


def preflight(checkout: Path, artifact_root: Path, python: str) -> list[CheckResult]:
    checks = [platform_check(), *(command_check(name, command) for name, command in REQUIRED_COMMANDS.items())]
    checks.append(python_check(python))
    checks.append(pytest_check(python))
    checks.append(artifact_root_check(artifact_root))
    checks.append(runner_contract_check(checkout, artifact_root, python))
    return checks


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check whether a host can run the self-hosted release gate.")
    parser.add_argument("--checkout", type=Path, required=True, help="Prepared detached candidate checkout.")
    parser.add_argument("--artifact-root", type=Path, required=True, help="Existing writable release evidence root.")
    parser.add_argument("--python", default=os.environ.get("YANA_RELEASE_PYTHON", "python3"), help="Python interpreter used by the release gate.")
    parser.add_argument("--json", action="store_true", help="Write only the machine-readable report to stdout.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    checks = preflight(args.checkout.expanduser(), args.artifact_root.expanduser(), args.python)
    passed = all(check.status == "passed" for check in checks)
    report = {
        "schema": REPORT_SCHEMA,
        "result": "passed" if passed else "failed",
        "checkout": str(args.checkout.expanduser()),
        "artifact_root": str(args.artifact_root.expanduser()),
        "checks": [asdict(check) for check in checks],
    }
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for check in checks:
            print(f"{'PASS' if check.status == 'passed' else 'FAIL'} {check.name}: {check.detail}")
        print(f"self-hosted-runner-preflight: {'PASS' if passed else 'FAIL'}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
