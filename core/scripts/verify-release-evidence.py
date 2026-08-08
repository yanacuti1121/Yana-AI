#!/usr/bin/env python3
"""Verify a self-hosted release evidence bundle without GitHub."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


REPORT_SCHEMA = "yana-release-gate/v1"
REVISION_PATTERN = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")


class EvidenceError(ValueError):
    """Raised when release evidence cannot be trusted for promotion."""


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest(), path.stat().st_size


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise EvidenceError(f"{label} must be a JSON object")
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise EvidenceError(f"{label} must be a JSON array")
    return value


def safe_file(root: Path, relative: Any, label: str) -> Path:
    if not isinstance(relative, str) or not relative:
        raise EvidenceError(f"{label} path must be a non-empty string")
    path = Path(relative)
    if path.is_absolute() or path.name in {"", ".", ".."} or ".." in path.parts:
        raise EvidenceError(f"{label} path must stay relative to its bundle root: {relative}")

    candidate = root
    for part in path.parts:
        candidate /= part
        if candidate.is_symlink():
            raise EvidenceError(f"{label} path must not traverse symlinks: {relative}")
    try:
        candidate.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise EvidenceError(f"{label} path escapes its bundle root: {relative}") from error
    if not candidate.is_file():
        raise EvidenceError(f"{label} file is missing: {relative}")
    return candidate


def parse_checksum_lines(path: Path, *, allow_empty: bool) -> dict[str, str]:
    if not path.is_file() or path.is_symlink():
        raise EvidenceError(f"checksum file is missing or unsafe: {path.name}")
    entries: dict[str, str] = {}
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines and not allow_empty:
        raise EvidenceError(f"checksum file is empty: {path.name}")
    for line_number, line in enumerate(lines, start=1):
        digest, separator, relative = line.partition("  ")
        if not separator or not SHA256_PATTERN.fullmatch(digest) or not relative:
            raise EvidenceError(f"invalid checksum entry in {path.name}:{line_number}")
        if relative in entries:
            raise EvidenceError(f"duplicate checksum path in {path.name}: {relative}")
        entries[relative] = digest
    return entries


def verify_file_claim(root: Path, claim: dict[str, Any], path_key: str, label: str) -> None:
    relative = claim.get(path_key)
    path = safe_file(root, relative, label)
    expected_digest = claim.get(f"{path_key}_sha256")
    expected_bytes = claim.get(f"{path_key}_bytes")
    if not isinstance(expected_digest, str) or not SHA256_PATTERN.fullmatch(expected_digest):
        raise EvidenceError(f"{label} has an invalid SHA-256 claim")
    if not isinstance(expected_bytes, int) or isinstance(expected_bytes, bool) or expected_bytes < 0:
        raise EvidenceError(f"{label} has an invalid byte-size claim")
    digest, size = sha256_file(path)
    if digest != expected_digest or size != expected_bytes:
        raise EvidenceError(f"{label} content does not match report.json: {relative}")


def verify_evidence(
    evidence_dir: Path,
    expected_revision: str,
    artifact_root: Path | None,
) -> dict[str, Any]:
    if not REVISION_PATTERN.fullmatch(expected_revision):
        raise EvidenceError("expected revision must be a full 40- or 64-character lowercase Git object ID")
    if not evidence_dir.is_dir() or evidence_dir.is_symlink():
        raise EvidenceError(f"evidence directory is missing or unsafe: {evidence_dir}")
    evidence_dir = evidence_dir.resolve()

    report_claims = parse_checksum_lines(evidence_dir / "report.sha256", allow_empty=False)
    if set(report_claims) != {"report.json"}:
        raise EvidenceError("report.sha256 must contain exactly the report.json checksum")
    report_path = safe_file(evidence_dir, "report.json", "report")
    report_digest, _ = sha256_file(report_path)
    if report_digest != report_claims["report.json"]:
        raise EvidenceError("report.json does not match report.sha256")

    try:
        report = require_mapping(json.loads(report_path.read_text(encoding="utf-8")), "report")
    except json.JSONDecodeError as error:
        raise EvidenceError(f"report.json is not valid JSON: {error}") from error

    if report.get("schema") != REPORT_SCHEMA:
        raise EvidenceError(f"unsupported report schema: {report.get('schema')!r}")
    if report.get("result") != "passed":
        raise EvidenceError("report result is not passed")
    if report.get("mode") != "release" or report.get("release_eligible") is not True:
        raise EvidenceError("diagnostic or ineligible reports cannot authorize promotion")

    repository = require_mapping(report.get("repository"), "repository")
    if repository.get("git_revision") != expected_revision:
        raise EvidenceError("report revision does not match the expected candidate revision")
    if repository.get("git_revision_after") != expected_revision:
        raise EvidenceError("candidate revision changed during the release gate")

    checks = require_list(report.get("checks"), "checks")
    if not checks:
        raise EvidenceError("release report contains no checks")
    seen_checks: set[str] = set()
    for index, value in enumerate(checks):
        check = require_mapping(value, f"checks[{index}]")
        name = check.get("name")
        if not isinstance(name, str) or not name or name in seen_checks:
            raise EvidenceError(f"check name is missing or duplicated at index {index}")
        seen_checks.add(name)
        exit_code = check.get("exit_code")
        if (
            check.get("status") != "passed"
            or not isinstance(exit_code, int)
            or isinstance(exit_code, bool)
            or exit_code != 0
        ):
            raise EvidenceError(f"check is not promotable: {name}")
        verify_file_claim(evidence_dir, check, "stdout", f"check {name} stdout")
        verify_file_claim(evidence_dir, check, "stderr", f"check {name} stderr")

    artifacts = require_list(report.get("artifacts"), "artifacts")
    artifact_claims = parse_checksum_lines(evidence_dir / "checksums.sha256", allow_empty=True)
    report_artifacts: dict[str, tuple[str, int]] = {}
    for index, value in enumerate(artifacts):
        artifact = require_mapping(value, f"artifacts[{index}]")
        relative = artifact.get("path")
        digest = artifact.get("sha256")
        size = artifact.get("bytes")
        if not isinstance(relative, str) or not relative or relative in report_artifacts:
            raise EvidenceError(f"artifact path is missing or duplicated at index {index}")
        if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest):
            raise EvidenceError(f"artifact has an invalid SHA-256 claim: {relative}")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise EvidenceError(f"artifact has an invalid byte-size claim: {relative}")
        report_artifacts[relative] = (digest, size)

    expected_checksums = {path: claim[0] for path, claim in report_artifacts.items()}
    if artifact_claims != expected_checksums:
        raise EvidenceError("checksums.sha256 does not exactly match report.json artifacts")
    if artifacts and artifact_root is None:
        raise EvidenceError("--artifact-root is required when the report contains artifacts")
    if artifact_root is not None:
        if not artifact_root.is_dir() or artifact_root.is_symlink():
            raise EvidenceError(f"artifact root is missing or unsafe: {artifact_root}")
        artifact_root = artifact_root.resolve()
        for relative, (expected_digest, expected_bytes) in report_artifacts.items():
            artifact_path = safe_file(artifact_root, relative, "artifact")
            digest, size = sha256_file(artifact_path)
            if digest != expected_digest or size != expected_bytes:
                raise EvidenceError(f"artifact content does not match report.json: {relative}")

    return {
        "revision": expected_revision,
        "checks": len(checks),
        "artifacts": len(artifacts),
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify a Yana AI release evidence bundle.")
    parser.add_argument("evidence_dir", type=Path, help="Directory containing report.json and check logs.")
    parser.add_argument("--expected-revision", required=True, help="Exact full Git object ID approved for promotion.")
    parser.add_argument("--artifact-root", type=Path, help="Root containing artifacts at report-relative paths.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        summary = verify_evidence(args.evidence_dir, args.expected_revision, args.artifact_root)
    except (EvidenceError, OSError, UnicodeError) as error:
        print(f"release-evidence: FAIL: {error}", file=sys.stderr)
        return 1
    print(
        "release-evidence: PASS "
        f"revision={summary['revision']} checks={summary['checks']} artifacts={summary['artifacts']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
