#!/usr/bin/env python3
"""Build a portable, verified self-hosted release evidence bundle."""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent


class BundleError(ValueError):
    """Raised when a portable release bundle cannot be built safely."""


def load_verifier() -> ModuleType:
    path = SCRIPT_DIR / "verify-release-evidence.py"
    spec = importlib.util.spec_from_file_location("yana_release_evidence_verifier", path)
    if spec is None or spec.loader is None:
        raise BundleError(f"could not load verifier: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


VERIFIER = load_verifier()


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BundleError(f"{label} must be a JSON object")
    return value


def resolve_output(output: Path, evidence_dir: Path, source_root: Path) -> Path:
    if output.exists() or output.is_symlink():
        raise BundleError(f"refusing to overwrite existing bundle output: {output}")
    parent = output.parent
    if not parent.is_dir() or parent.is_symlink():
        raise BundleError(f"bundle output parent is missing or unsafe: {parent}")
    resolved = parent.resolve() / output.name
    for protected, label in ((evidence_dir.resolve(), "evidence directory"), (source_root.resolve(), "artifact source root")):
        try:
            resolved.relative_to(protected)
        except ValueError:
            continue
        raise BundleError(f"bundle output must not be inside the {label}: {resolved}")
    return resolved


def copy_verified_file(source_root: Path, relative: Any, destination_root: Path, label: str) -> None:
    source = VERIFIER.safe_file(source_root, relative, label)
    destination = destination_root / Path(relative)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def read_verified_report(evidence_dir: Path, source_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    report_path = VERIFIER.safe_file(evidence_dir, "report.json", "report")
    try:
        report = require_mapping(json.loads(report_path.read_text(encoding="utf-8")), "report")
    except json.JSONDecodeError as error:
        raise BundleError(f"report.json is not valid JSON: {error}") from error
    repository = require_mapping(report.get("repository"), "repository")
    revision = repository.get("git_revision")
    if not isinstance(revision, str):
        raise BundleError("report repository revision is missing")
    try:
        summary = VERIFIER.verify_evidence(evidence_dir, revision, source_root)
    except (VERIFIER.EvidenceError, OSError, UnicodeError) as error:
        raise BundleError(str(error)) from error
    return report, summary


def build_bundle(evidence_dir: Path, source_root: Path, output: Path) -> dict[str, Any]:
    if not evidence_dir.is_dir() or evidence_dir.is_symlink():
        raise BundleError(f"evidence directory is missing or unsafe: {evidence_dir}")
    if not source_root.is_dir() or source_root.is_symlink():
        raise BundleError(f"artifact source root is missing or unsafe: {source_root}")
    evidence_dir = evidence_dir.resolve()
    source_root = source_root.resolve()
    output = resolve_output(output, evidence_dir, source_root)
    report, summary = read_verified_report(evidence_dir, source_root)

    output.mkdir()
    for relative in ("report.json", "report.sha256", "checksums.sha256"):
        copy_verified_file(evidence_dir, relative, output, "evidence")
    checks = report.get("checks")
    if not isinstance(checks, list):
        raise BundleError("report checks must be a JSON array")
    for index, value in enumerate(checks):
        check = require_mapping(value, f"checks[{index}]")
        copy_verified_file(evidence_dir, check.get("stdout"), output, f"check {index} stdout")
        copy_verified_file(evidence_dir, check.get("stderr"), output, f"check {index} stderr")

    artifacts = report.get("artifacts")
    if not isinstance(artifacts, list):
        raise BundleError("report artifacts must be a JSON array")
    artifact_destination = output / "artifacts"
    artifact_destination.mkdir()
    for index, value in enumerate(artifacts):
        artifact = require_mapping(value, f"artifacts[{index}]")
        copy_verified_file(source_root, artifact.get("path"), artifact_destination, f"artifact {index}")

    try:
        VERIFIER.verify_evidence(output, summary["revision"], artifact_destination)
    except (VERIFIER.EvidenceError, OSError, UnicodeError) as error:
        raise BundleError(f"copied bundle did not verify: {error}") from error
    return {**summary, "output": str(output)}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a portable Yana AI release evidence bundle.")
    parser.add_argument("--evidence-dir", type=Path, required=True, help="Verified release-gate report directory.")
    parser.add_argument("--source-root", type=Path, required=True, help="Candidate checkout containing report-relative artifacts.")
    parser.add_argument("--output", type=Path, required=True, help="New bundle directory outside both inputs.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        summary = build_bundle(args.evidence_dir, args.source_root, args.output)
    except (BundleError, OSError, UnicodeError) as error:
        print(f"release-evidence-bundle: FAIL: {error}", file=sys.stderr)
        return 1
    print(
        "release-evidence-bundle: PASS "
        f"revision={summary['revision']} checks={summary['checks']} artifacts={summary['artifacts']} output={summary['output']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
