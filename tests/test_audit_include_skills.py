#!/usr/bin/env python3
"""Regression checks for `yana audit --include-skills`.

scanner/auth-credential-checks.yml and scanner/env-secret-checks.yml were
narrowed (file_patterns_extra for *.md, exclude_patterns for core/skills/**)
after evidence showed most of their default findings on this repo were
false positives from skill-library docs/demo scripts, not real risk. This
verifies the narrowing actually excludes that surface by default, and that
--include-skills restores it — using a small synthetic fixture against the
real scanner/*.yml rules, not the whole repo (which is slow and would make
the test's expected counts drift as the skill library grows).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# AU002 (auth-credentials): GOOGLE_APPLICATION_CREDENTIALS pointing at a path
AUTH_TRIGGER = 'GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/key.json\n'
# SE004 (secrets): AWS access key ID pattern
SECRET_TRIGGER = 'AKIA1234567890ABCDEF\n'


def _run(cmd: list[str]) -> tuple[int, str, str]:
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _yana_ai_rt_available() -> bool:
    if shutil.which("yana-rt"):
        return True
    release = ROOT / "target" / "release" / "yana-rt"
    debug = ROOT / "target" / "debug" / "yana-rt"
    return release.exists() or debug.exists()


def _make_fixture(root: Path) -> None:
    skill_dir = root / "core" / "skills" / "fake-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(AUTH_TRIGGER, encoding="utf-8")
    (skill_dir / "script.py").write_text(SECRET_TRIGGER, encoding="utf-8")

    (root / "app.js").write_text(AUTH_TRIGGER, encoding="utf-8")
    (root / "tool.py").write_text(SECRET_TRIGGER, encoding="utf-8")


def _finding_files(payload: dict) -> set[str]:
    return {f.get("file", "") for f in payload.get("findings", [])}


def test_auth_credentials_excludes_skill_md_by_default() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping --include-skills regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        _make_fixture(fixture)

        code, out, err = _run(["bash", "bin/yana", "audit", str(fixture), "--only", "auth-credentials", "--json"])
        _assert(code in (0, 1, 2), f"default run failed: code={code}\nSTDERR:\n{err}")
        files = _finding_files(json.loads(out))
        _assert(any("app.js" in f for f in files), f"app.js should still be flagged by default: {files}")
        _assert(not any("SKILL.md" in f for f in files), f"SKILL.md should be excluded by default: {files}")

        code2, out2, _ = _run(["bash", "bin/yana", "audit", str(fixture), "--only", "auth-credentials", "--json", "--include-skills"])
        files2 = _finding_files(json.loads(out2))
        _assert(any("app.js" in f for f in files2), f"app.js should still be flagged with --include-skills: {files2}")
        _assert(any("SKILL.md" in f for f in files2), f"SKILL.md should be flagged with --include-skills: {files2}")


def test_secrets_excludes_core_skills_by_default() -> None:
    if not _yana_ai_rt_available():
        print("SKIP: yana-rt not installed — skipping --include-skills regression tests")
        return
    with tempfile.TemporaryDirectory() as tmp:
        fixture = Path(tmp)
        _make_fixture(fixture)

        code, out, err = _run(["bash", "bin/yana", "audit", str(fixture), "--only", "secrets", "--json"])
        _assert(code in (0, 1, 2), f"default run failed: code={code}\nSTDERR:\n{err}")
        files = _finding_files(json.loads(out))
        _assert(any("tool.py" in f for f in files), f"tool.py should still be flagged by default: {files}")
        _assert(not any("core/skills" in f for f in files), f"core/skills/** should be excluded by default: {files}")

        code2, out2, _ = _run(["bash", "bin/yana", "audit", str(fixture), "--only", "secrets", "--json", "--include-skills"])
        files2 = _finding_files(json.loads(out2))
        _assert(any("tool.py" in f for f in files2), f"tool.py should still be flagged with --include-skills: {files2}")
        _assert(any("core/skills" in f for f in files2), f"core/skills/** should be flagged with --include-skills: {files2}")


if __name__ == "__main__":
    test_auth_credentials_excludes_skill_md_by_default()
    test_secrets_excludes_core_skills_by_default()
    print("OK: --include-skills regression tests passed.")
