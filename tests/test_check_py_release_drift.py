"""Tests for scripts/check_py_release_drift.py (2026-09-29 stale-PyPI incident)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_py_release_drift.py"
_spec = importlib.util.spec_from_file_location("check_py_release_drift", _SCRIPT)
drift = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(drift)


def test_incident_shape_unbumped_fix_fails():
    # main had the fix, pyproject still equal to the released 1.5.0
    ok, message = drift.evaluate((1, 5, 0), (1, 5, 0), changed_commits=3)
    assert ok is False
    assert "still 1.5.0" in message


def test_downgrade_fails_even_without_changes():
    ok, message = drift.evaluate((1, 5, 0), (1, 4, 2), changed_commits=0)
    assert ok is False
    assert "downgrade" in message


def test_bumped_version_passes():
    ok, _ = drift.evaluate((1, 5, 0), (1, 5, 1), changed_commits=3)
    assert ok is True


def test_no_package_changes_same_version_passes():
    ok, _ = drift.evaluate((1, 5, 0), (1, 5, 0), changed_commits=0)
    assert ok is True


def test_numeric_not_lexicographic_compare():
    # "1.10.0" < "1.9.0" as strings; must compare as numbers
    ok, _ = drift.evaluate((1, 9, 0), (1, 10, 0), changed_commits=1)
    assert ok is True


@pytest.mark.parametrize("tag", ["", "v1.5.0", "rt-v1.5.0", "py-v1.5", "py-v1.5.0\x00",
                                 "py-v../../etc", "py-v" + "9" * 65536])
def test_parse_tag_rejects_malformed(tag):
    assert drift.parse_tag(tag) is None


def test_parse_tag_accepts_valid():
    assert drift.parse_tag("py-v1.5.0") == (1, 5, 0)


def test_package_paths_cover_force_included_dirs():
    # Review finding on PR #379: bin/, core/, gates/ ... ship in the wheel
    # too, so changes there also need a version bump.
    pyproject = {"tool": {"hatch": {"build": {"targets": {"wheel": {
        "packages": ["src/yana_ai"],
        "force-include": {"bin": "yana_ai/bin", "core": "yana_ai/core",
                          ".codex/hooks.json": "yana_ai/.codex/hooks.json"},
    }}}}}}
    assert drift.package_paths(pyproject) == [
        ".codex/hooks.json", "bin", "core", "pyproject.toml", "src/yana_ai"]


def test_package_paths_match_real_pyproject():
    import tomllib
    real = tomllib.loads((_SCRIPT.parents[1] / "pyproject.toml").read_text(encoding="utf-8"))
    paths = drift.package_paths(real)
    for expected in ("src/yana_ai", "bin", "core", "gates", "scanner", "pyproject.toml"):
        assert expected in paths
