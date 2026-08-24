#!/usr/bin/env python3
"""Verify the published PyPI/crates.io versions match their latest git tags.

Added 2026-08-23 after `yana-ai` 0.42.5's PyPI publish silently failed
(hatchling 1.32.0 emitting Metadata-Version: 2.5, rejected by the pinned
pypa/gh-action-pypi-publish SHA) for hours before anyone noticed -- nothing
in this repo checked the *published* artifact against the tag that was
supposed to produce it. This script closes that gap: it is read-only,
makes no filesystem changes, and has no --fix, because a broken publish
needs a human to investigate and re-run, not an auto-generated commit.

Checks the Python package axis (py-v* tags -> PyPI `yana-ai`) and the Rust
crate axis (rt-v* tags -> crates.io `yana-rt`) independently -- see
VERSIONING.md for why the three version axes are never conflated.

Usage:
    python3 core/scripts/check_publish_parity.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request

PYPI_URL = "https://pypi.org/pypi/yana-ai/json"
CRATES_URL = "https://crates.io/api/v1/crates/yana-rt"
USER_AGENT = "yana-ai-check-publish-parity (+https://github.com/yanacuti1121/Yana-AI)"


class PublishParityError(RuntimeError):
    """Raised when a registry can't be reached or parsed."""


def _latest_tag(prefix: str) -> str | None:
    """Return the highest semver tag with the given prefix, or None if no
    such tag exists yet (e.g. before the first py-v*/rt-v* tag is pushed)."""
    result = subprocess.run(
        ["git", "tag", "-l", f"{prefix}*"],
        capture_output=True,
        text=True,
        check=True,
    )
    tags = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    versions: list[tuple[tuple[int, int, int], str]] = []
    for tag in tags:
        if not tag.startswith(prefix):
            continue
        rest = tag[len(prefix):]
        parts = rest.split(".")
        if len(parts) != 3 or not all(part.isdigit() for part in parts):
            continue
        versions.append(((int(parts[0]), int(parts[1]), int(parts[2])), tag))
    if not versions:
        return None
    return max(versions, key=lambda pair: pair[0])[1]


def _fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as error:
        raise PublishParityError(f"cannot reach {url}: {error}") from error


def pypi_latest_version() -> str:
    data = _fetch_json(PYPI_URL)
    info = data.get("info")
    if not isinstance(info, dict) or not isinstance(info.get("version"), str):
        raise PublishParityError(f"unexpected PyPI response shape from {PYPI_URL}")
    return info["version"]


def crates_latest_version() -> str:
    data = _fetch_json(CRATES_URL)
    crate = data.get("crate")
    if not isinstance(crate, dict) or not isinstance(crate.get("newest_version"), str):
        raise PublishParityError(f"unexpected crates.io response shape from {CRATES_URL}")
    return crate["newest_version"]


def check() -> list[str]:
    """Return a list of human-readable problems; empty means clean."""
    problems: list[str] = []

    latest_py_tag = _latest_tag("py-v")
    if latest_py_tag is not None:
        expected_py_version = latest_py_tag[len("py-v"):]
        try:
            actual_py_version = pypi_latest_version()
        except PublishParityError as error:
            problems.append(f"PyPI: {error}")
        else:
            if actual_py_version != expected_py_version:
                problems.append(
                    f"PyPI yana-ai is at {actual_py_version}, but the latest tag is "
                    f"{latest_py_tag} (expected {expected_py_version})"
                )

    latest_rt_tag = _latest_tag("rt-v")
    if latest_rt_tag is not None:
        expected_rt_version = latest_rt_tag[len("rt-v"):]
        try:
            actual_rt_version = crates_latest_version()
        except PublishParityError as error:
            problems.append(f"crates.io: {error}")
        else:
            if actual_rt_version != expected_rt_version:
                problems.append(
                    f"crates.io yana-rt is at {actual_rt_version}, but the latest tag is "
                    f"{latest_rt_tag} (expected {expected_rt_version})"
                )

    return problems


def main() -> int:
    try:
        problems = check()
    except subprocess.CalledProcessError as error:
        print(f"PUBLISH PARITY ERROR: 'git tag' failed: {error}", file=sys.stderr)
        return 2
    for problem in problems:
        print(f"PUBLISH PARITY MISMATCH: {problem}")
    if problems:
        print(f"check_publish_parity: {len(problems)} issue(s) -- a human needs to investigate the publish")
        return 1
    print("check_publish_parity: CLEAN -- published packages match their latest git tags")
    return 0


if __name__ == "__main__":
    sys.exit(main())
