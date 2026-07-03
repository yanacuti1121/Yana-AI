#!/usr/bin/env python3
"""check_dangling_paths.py — catch references to paths that no longer exist.

Root cause this closes: this repo has, on 3 separate occasions, deleted or
moved a directory (electron/ -> tools/yana-desktop/, most recently) without
updating every script/config that pointed at the old location. Every prior
count-drift checker (drift-check.sh, check_counts.py, guards-index --check,
core-lock verify) checks that files exist and their *content* is consistent
— none of them check that a `cd <dir>` inside a script string, or a path
listed in package.json's `files[]`, still resolves to something real. This
is that check.

Also verifies within-axis version consistency (see VERSIONING.md) — the
three registry axes are allowed to differ from each other, but the two
files that both claim to be the *same* axis (pyproject.toml and
src/yana_ai/__init__.py, both "the Python package version") must agree
with each other. A mismatch there isn't intentional axis drift, it's a
release script that updated one and missed the other.

Usage: python3 core/scripts/check_dangling_paths.py
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def check_package_json_cd_targets() -> list[str]:
    """Every `cd <dir> && ...` inside package.json's scripts values must
    point at a directory that exists."""
    problems = []
    pkg_path = REPO / "package.json"
    scripts = json.loads(pkg_path.read_text()).get("scripts", {})
    for name, cmd in scripts.items():
        for m in re.finditer(r"\bcd\s+([^\s&|;]+)", cmd):
            target = m.group(1)
            if not (REPO / target).is_dir():
                problems.append(
                    f"package.json scripts.{name}: `cd {target}` — directory does not exist"
                )
    return problems


def check_package_json_files_field() -> list[str]:
    """Every entry in package.json's files[] must exist (as a literal path
    or, if it contains a glob character, be left unchecked — globs are
    npm's job to resolve, not ours)."""
    problems = []
    pkg_path = REPO / "package.json"
    files = json.loads(pkg_path.read_text()).get("files", [])
    for f in files:
        if any(ch in f for ch in "*?[{"):
            continue  # glob pattern — npm resolves these at pack time
        if not (REPO / f).exists():
            problems.append(f"package.json files[]: '{f}' — does not exist")
    return problems


def check_within_axis_python_version() -> list[str]:
    """pyproject.toml and src/yana_ai/__init__.py both claim to be the
    Python package version (see VERSIONING.md) — they must agree with
    each other, even though they're allowed to differ from the product
    version or the crate version (different axes entirely)."""
    problems = []
    pyproject = REPO / "pyproject.toml"
    init_py = REPO / "src/yana_ai/__init__.py"
    if not pyproject.is_file() or not init_py.is_file():
        return problems

    m1 = re.search(r'^version\s*=\s*"([^"]+)"', pyproject.read_text(), re.M)
    m2 = re.search(r'__version__\s*=\s*"([^"]+)"', init_py.read_text())
    if m1 and m2 and m1.group(1) != m2.group(1):
        problems.append(
            f"Python package version axis mismatch: pyproject.toml={m1.group(1)!r} "
            f"vs src/yana_ai/__init__.py={m2.group(1)!r} — VERSIONING.md's axes are "
            f"allowed to differ from EACH OTHER, not from themselves"
        )
    return problems


def main() -> int:
    problems = (
        check_package_json_cd_targets()
        + check_package_json_files_field()
        + check_within_axis_python_version()
    )
    if problems:
        print(f"check_dangling_paths: {len(problems)} issue(s) found")
        for p in problems:
            print(f"  DANGLING  {p}")
        return 1
    print("check_dangling_paths: CLEAN — no dangling paths, no within-axis version mismatch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
