#!/usr/bin/env python3
"""Fail when the Python package has unreleased changes but no version bump.

Why (2026-09-29 incident): the yana-rt fork-bomb fix landed on main on
2026-09-17, but pyproject.toml stayed at 1.5.0 -- the version already on
PyPI since 2026-09-10. `pipx install yana-ai` therefore kept serving the
old, buggy 1.5.0 as "latest", and the machine fork-bombed again (~470
processes) right after a fresh install. The fix existed; it just could
never ship under a version number PyPI would accept.

Rule enforced here, against the latest `py-v*` tag:
  - current version < tag version            -> fail (downgrade)
  - package changed since tag, version == tag -> fail (fix can't ship)
  - otherwise                                 -> pass

Exit codes: 0 pass, 1 drift detected, 2 cannot determine (no tag / git error).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_PATHS = ("src/yana_ai", "pyproject.toml")
_VERSION_LINE = re.compile(r'^version\s*=\s*"(\d+)\.(\d+)\.(\d+)"', re.MULTILINE)
_TAG = re.compile(r"^py-v(\d+)\.(\d+)\.(\d+)$")


def parse_tag(tag: str) -> tuple[int, int, int] | None:
    match = _TAG.match(tag.strip())
    return tuple(int(p) for p in match.groups()) if match else None


def evaluate(tag_version: tuple[int, ...], current: tuple[int, ...],
             changed_commits: int) -> tuple[bool, str]:
    tag_s = ".".join(map(str, tag_version))
    cur_s = ".".join(map(str, current))
    if current < tag_version:
        return False, f"downgrade: pyproject {cur_s} < released py-v{tag_s}"
    if current == tag_version and changed_commits > 0:
        return False, (
            f"{changed_commits} commit(s) touched the Python package since "
            f"py-v{tag_s}, but pyproject is still {cur_s}. PyPI rejects "
            "re-uploads of an existing version, so these changes can never "
            "reach users. Bump the version in pyproject.toml and "
            "src/yana_ai/__init__.py."
        )
    return True, f"ok: pyproject {cur_s}, last release py-v{tag_s}"


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True,
                          capture_output=True, text=True).stdout


def main() -> int:
    try:
        tags = [t for t in _git("tag", "-l", "py-v*").split() if parse_tag(t)]
        if not tags:
            print("[py-release-drift] no py-v* tag found", file=sys.stderr)
            return 2
        latest = max(tags, key=parse_tag)
        commits = _git("rev-list", "--count", f"{latest}..HEAD", "--", *PACKAGE_PATHS)
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"[py-release-drift] git failed: {exc}", file=sys.stderr)
        return 2
    match = _VERSION_LINE.search((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    if not match:
        print("[py-release-drift] version not found in pyproject.toml", file=sys.stderr)
        return 2
    current = tuple(int(p) for p in match.groups())
    ok, message = evaluate(parse_tag(latest), current, int(commits.strip() or 0))
    print(f"[py-release-drift] {message}", file=sys.stderr if not ok else sys.stdout)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
