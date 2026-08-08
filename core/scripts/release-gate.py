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
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_SCHEMA = "yana-release-gate/v1"
DEFAULT_CHECK_TIMEOUT_SECONDS = 30 * 60


@dataclass(frozen=True)
class Check:
    name: str
    description: str
    command: tuple[str, ...] | None = None
    handler: Callable[[Path, bool, dict[str, str]], tuple[int, str, str]] | None = None


def run_command(
    command: tuple[str, ...],
    root: Path,
    environment: dict[str, str],
    timeout_seconds: float = DEFAULT_CHECK_TIMEOUT_SECONDS,
) -> tuple[int, str, str]:
    try:
        process = subprocess.Popen(
            command,
            cwd=root,
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
    except OSError as error:
        return 127, "", f"could not execute {command[0]}: {error}\n"
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            stdout, stderr = process.communicate()
        stderr += f"command timed out after {timeout_seconds:g} seconds: {command[0]}\n"
        return 124, stdout, stderr
    return process.returncode, stdout, stderr


def git_state(root: Path, allow_dirty: bool, _environment: dict[str, str]) -> tuple[int, str, str]:
    code, stdout, stderr = run_command(("git", "status", "--porcelain"), root, os.environ.copy())
    if code != 0:
        return code, stdout, stderr
    if stdout.strip() and not allow_dirty:
        return 1, stdout, "release gate requires a clean working tree; use --allow-dirty only for local diagnostics\n"
    if stdout.strip():
        return 0, stdout, "working tree is dirty; accepted only because --allow-dirty was set\n"
    return 0, stdout, stderr


def shell_syntax(root: Path, _allow_dirty: bool, environment: dict[str, str]) -> tuple[int, str, str]:
    targets = sorted((root / "core/hooks").glob("*.sh")) + sorted((root / "core/scripts").glob("*.sh"))
    if not targets:
        return 2, "", "no shell files found under core/hooks or core/scripts\n"
    return run_command(("bash", "-n", *(str(path) for path in targets)), root, environment)


def flock_external_cwd(root: Path, _allow_dirty: bool, environment: dict[str, str]) -> tuple[int, str, str]:
    script = root / "core/tests/locking/test-flock-v1-production.sh"
    return run_command(("bash", str(script)), Path("/tmp"), environment)


def final_git_state(root: Path, allow_dirty: bool, environment: dict[str, str]) -> tuple[int, str, str]:
    code, stdout, stderr = git_state(root, allow_dirty, environment)
    if code != 0:
        return code, stdout, stderr
    expected_revision = environment.get("YANA_RELEASE_GATE_REVISION")
    current_revision = git_revision(root)
    if not expected_revision or current_revision != expected_revision:
        return (
            1,
            stdout,
            stderr
            + f"release gate HEAD changed during verification: expected {expected_revision}, found {current_revision}\n",
        )
    return code, stdout, stderr


def check_definitions(root: Path) -> dict[str, Check]:
    checks = [
        Check("git-state", "Clean working tree", handler=git_state),
        Check("shell-syntax", "Bash syntax for core hooks and scripts", handler=shell_syntax),
        Check("metadata", "Filesystem-derived project metadata", ("npm", "run", "metadata:check")),
        Check("drift", "Manifest, metadata, and documentation drift", ("bash", "core/scripts/drift-check.sh")),
        Check("dangling-paths", "Package paths and version-axis consistency", ("python3", "core/scripts/check_dangling_paths.py")),
        Check("guards-index", "Generated guard index drift", ("python3", "core/scripts/gen_guards_index.py", "--check")),
        Check("scanner-rules", "Compiled scanner rule drift", ("python3", "core/scripts/compile_scanner_rules.py", "--check")),
        Check("core-lock", "Pinned core infrastructure integrity", ("bash", "core/scripts/verify-core-lock.sh")),
        Check("skills-lock", "Pinned skill inventory integrity", ("bash", "core/scripts/verify-skills-lock.sh")),
        Check("hook-mirrors", "Claude and Codex hook mirrors", ("bash", "core/scripts/verify-hook-mirrors.sh")),
        Check("source-only-contract", "Fresh-target Codex generation contract", ("bash", "core/tests/codex/test-source-only-adapter-contract.sh")),
        Check("codex-support", "Codex support and engine parity", ("bash", "core/tests/codex/test-codex-support.sh")),
        Check("install-syntax", "Installer shell syntax", ("bash", "-n", "install.sh")),
        Check("harness-schema", "Harness scaling schema examples", ("python3", "tests/test_harness_schema_examples.py")),
        Check("yanaignore", ".yana-aiignore regression behavior", ("python3", "tests/test_yanaignore.py")),
        Check("validate-spec", "Spec command regression behavior", ("python3", "tests/test_validate_spec.py")),
        Check("context-pack", "Context-pack checker regression behavior", ("python3", "tests/test_context_pack_check.py")),
        Check("validator-schema", "Validator JSON schema contract", ("python3", "tests/test_validator_json_schema.py")),
        Check("audit-json", "Audit JSON MVP regression behavior", ("python3", "-m", "pytest", "tests/test_audit_json_mvp.py", "-q")),
        Check("metadata-tests", "Canonical metadata regression behavior", ("python3", "tests/test_project_metadata.py")),
        Check("release-gate-tests", "Self-hosted release gate report contract", ("python3", "tests/test_release_gate.py")),
        Check("release-evidence-tests", "Offline release evidence verification", ("python3", "tests/test_release_evidence.py")),
        Check("release-attestation-tests", "Vault Transit release-attestation boundary", ("python3", "tests/test_release_attestation.py")),
        Check("release-signer-template-tests", "Vault Agent release-signer template contract", ("python3", "tests/test_release_signer_templates.py")),
        Check("release-signer-preflight-tests", "Vault Transit release-signer preflight contract", ("python3", "tests/test_release_signer_preflight.py")),
        Check("release-runbook-tests", "Self-hosted release runbook contract", ("python3", "tests/test_self_hosted_release_runbook.py")),
        Check("runner-preflight-tests", "Self-hosted runner preflight regression", ("python3", "tests/test_self_hosted_runner_preflight.py")),
        Check("candidate-preparation-tests", "Self-hosted candidate preparation regression", ("python3", "tests/test_self_hosted_candidate_preparation.py")),
        Check("release-evidence-bundle-tests", "Portable release evidence bundle regression", ("python3", "tests/test_release_evidence_bundle.py")),
        Check("self-hosted-runner", "Immutable self-hosted runner contract", ("python3", "tests/test_self_hosted_release_runner.py")),
        Check("skill-triggering", "Skill trigger regression behavior", ("bash", "core/tests/skills/test-skill-triggering.sh")),
        Check("rust-build", "Release yana-rt build", ("cargo", "build", "--release", "--bin", "yana-rt")),
        Check("rust-unit", "Rust unit tests", ("cargo", "test", "--bin", "yana-rt", "--", "--test-threads=1")),
        Check("rust-integration", "Rust integration tests", ("cargo", "test", "--test", "integration_runtime", "--", "--test-threads=4")),
        Check("self-audit", "Yana AI scanner dogfooding", ("target/release/yana-rt", "scan", ".", "--fail-on", "high", "--ignore", "AU010", "--ignore", "CI008")),
        Check("hook-tests", "Hook regression suite", ("bash", "core/tests/hooks/run-hook-tests.sh")),
        Check("npm-package", "npm package surface", ("npm", "pack", "--dry-run")),
    ]
    if (root / "core/tests/locking/test-flock-v1-production.sh").is_file():
        checks.extend(
            [
                Check("flock-units", "Rust flock-v1 units", ("cargo", "test", "--features", "flock-v1", "flock_v1::tests", "--", "--test-threads=1")),
                Check("flock-python-units", "Python flock-v1 units", ("python3", "-m", "unittest", "-v", "core.tests.locking.test_flock_v1")),
                Check("flock-cutover", "Directory-to-file cutover regression", ("bash", "core/tests/locking/test-flock-v1-cutover.sh")),
                *[
                    Check(f"flock-matrix-{run}", f"Kernel flock production matrix {run}/5", ("bash", "core/tests/locking/test-flock-v1-production.sh"))
                    for run in range(1, 6)
                ],
                Check("flock-external-cwd", "Kernel flock matrix from an external cwd", handler=flock_external_cwd),
                Check("desktop-runtime-build", "Desktop release runtime build", ("cargo", "build", "--release", "--features", "cli,pty-bridge", "--bin", "yana-rt", "--bin", "pty_bridge")),
                Check("flock-packaging", "npm, PyPI, and desktop flock runtime surfaces", ("bash", "core/tests/locking/test-flock-v1-packaging.sh")),
            ]
        )
    checks.append(Check("git-state-final", "Working tree and HEAD remain stable after verification", handler=final_git_state))
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
    required_paths = [*requested_paths]
    if include_runtime:
        required_paths.insert(0, root / "target/release/yana-rt")
    candidates = [*required_paths]
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
    missing = [str(path) for path in required_paths if not path.exists()]
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


def environment_for_gate(root: Path, output: Path, revision: str | None) -> dict[str, str]:
    environment = os.environ.copy()
    environment["CLAUDE_PROJECT_DIR"] = str(root)
    environment["YANA_PROJECT_ROOT"] = str(root)
    environment["YANA_RT_BIN"] = str(root / "target/release/yana-rt")
    environment["npm_config_cache"] = str(output / "npm-cache")
    environment["YANA_RELEASE_GATE_REVISION"] = revision or ""
    existing_pythonpath = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = (
        f"{root}{os.pathsep}{existing_pythonpath}" if existing_pythonpath else str(root)
    )
    return environment


def execute_check(check: Check, root: Path, allow_dirty: bool, environment: dict[str, str]) -> tuple[int, str, str]:
    if check.handler is not None:
        return check.handler(root, allow_dirty, environment)
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

    candidate_revision = git_revision(REPO_ROOT)
    environment = environment_for_gate(REPO_ROOT, output, candidate_revision)
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
        stdout_sha256, stdout_bytes = sha256_file(stdout_path)
        stderr_sha256, stderr_bytes = sha256_file(stderr_path)
        result = {
            "name": check.name,
            "description": check.description,
            "command": list(check.command) if check.command is not None else None,
            "status": "passed" if code == 0 else "failed",
            "exit_code": code,
            "duration_seconds": round(time.monotonic() - check_started, 3),
            "stdout": str(stdout_path.relative_to(output)),
            "stdout_sha256": stdout_sha256,
            "stdout_bytes": stdout_bytes,
            "stderr": str(stderr_path.relative_to(output)),
            "stderr_sha256": stderr_sha256,
            "stderr_bytes": stderr_bytes,
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
        "repository": {
            "root": str(REPO_ROOT),
            "git_revision": candidate_revision,
            "git_revision_after": git_revision(REPO_ROOT),
            "platform": platform.platform(),
            "python": platform.python_version(),
        },
        "checks": results,
        "artifacts": artifacts,
    }
    report_path = write_report(output, report)
    print(f"REPORT {report_path}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
