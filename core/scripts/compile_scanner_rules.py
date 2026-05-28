#!/usr/bin/env python3
"""Compile scanner YAML rules to stable JSON, and check for drift.

Usage:
  python3 core/scripts/compile_scanner_rules.py --write
  python3 core/scripts/compile_scanner_rules.py --check
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCANNER_DIR = ROOT / "scanner"
COMPILED_DIR = SCANNER_DIR / "compiled"


def _load_yaml(path: Path):
    try:
        import yaml  # type: ignore
    except Exception:
        print(
            "Error: PyYAML is required for compile/check mode. "
            "Install with: python3 -m pip install -r requirements-dev.txt",
            file=sys.stderr,
        )
        raise SystemExit(3)

    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _stable_json_text(data) -> str:
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def _targets() -> list[tuple[Path, Path]]:
    yml_files = sorted(SCANNER_DIR.glob("*.yml"))
    return [(yml, COMPILED_DIR / f"{yml.stem}.json") for yml in yml_files]


def write_mode() -> int:
    COMPILED_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    for yml_path, json_path in _targets():
        data = _load_yaml(yml_path)
        json_path.write_text(_stable_json_text(data), encoding="utf-8")
        count += 1
    print(f"Wrote {count} compiled scanner rule files to {COMPILED_DIR}")
    return 0


def check_mode() -> int:
    missing = []
    drifted = []
    for yml_path, json_path in _targets():
        expected = _stable_json_text(_load_yaml(yml_path))
        if not json_path.exists():
            missing.append(str(json_path.relative_to(ROOT)))
            continue
        actual = json_path.read_text(encoding="utf-8")
        if actual != expected:
            drifted.append(str(json_path.relative_to(ROOT)))

    if missing or drifted:
        if missing:
            print("Missing compiled rule files:", file=sys.stderr)
            for m in missing:
                print(f"  - {m}", file=sys.stderr)
        if drifted:
            print("Drift detected in compiled rule files:", file=sys.stderr)
            for d in drifted:
                print(f"  - {d}", file=sys.stderr)
        print(
            "Run: python3 core/scripts/compile_scanner_rules.py --write",
            file=sys.stderr,
        )
        return 1

    print("OK: compiled scanner rules are in sync with YAML sources.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if args.write:
        return write_mode()
    return check_mode()


if __name__ == "__main__":
    raise SystemExit(main())
