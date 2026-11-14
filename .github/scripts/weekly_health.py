#!/usr/bin/env python3
"""Weekly repository health report.

The daily CI run on main already covers the toolchain (latest stable Rust, the test suites, the
audit). This script covers what no pull request or daily run looks at:

  hard failures (exit 1)
    * a Python file in the skills trees that does not compile
    * a shell script in the skills trees that `bash -n` rejects

  information only (never fails the run)
    * invalid escape sequences and other SyntaxWarnings in the skills Python
    * files that differ between core/skills and .claude/skills (they are meant to be identical)
    * skills whose hash no longer matches core/config/skills-lock.json
    * tracked files nobody has touched for STALE_DAYS days, grouped by folder

The report is Markdown, written to $GITHUB_STEP_SUMMARY when set and to stdout otherwise.
Run it from the repository root: python3 .github/scripts/weekly_health.py
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import time
import warnings
from collections import Counter
from pathlib import Path

SKILL_TREES = ("core/skills", ".claude/skills")
STALE_DAYS = 150
SECONDS_PER_DAY = 86_400
TOP_LIST = 10
SUBPROCESS_TIMEOUT_SECONDS = 600
SKILLS_LOCK_SCRIPT = "core/scripts/verify-skills-lock.sh"


def skill_files(root: Path, suffix: str) -> list[Path]:
    """Every file with the given suffix under the skills trees, skipping vendored node_modules."""
    found: list[Path] = []
    for tree in SKILL_TREES:
        base = root / tree
        if base.is_dir():
            found.extend(p for p in base.rglob(f"*{suffix}") if "node_modules" not in p.parts)
    return sorted(found)


def check_python(root: Path) -> tuple[list[str], Counter[str], int]:
    """Compile every skills .py. Returns (syntax errors, warnings per file, files checked)."""
    errors: list[str] = []
    warned: Counter[str] = Counter()
    files = skill_files(root, ".py")
    for path in files:
        rel = str(path.relative_to(root))
        source = path.read_text(encoding="utf-8", errors="replace")
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            try:
                compile(source, rel, "exec")
            except SyntaxError as exc:
                errors.append(f"{rel}: {exc.msg} (line {exc.lineno})")
        warned[rel] += sum(1 for w in caught if issubclass(w.category, SyntaxWarning))
    return errors, +warned, len(files)


def check_shell(root: Path) -> tuple[list[str], int]:
    """Run `bash -n` on every skills .sh. Returns (failures, files checked)."""
    failures: list[str] = []
    files = skill_files(root, ".sh")
    for path in files:
        result = subprocess.run(
            ["bash", "-n", str(path)], capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_SECONDS
        )
        if result.returncode != 0:
            first = (result.stderr.strip().splitlines() or ["syntax error"])[0]
            failures.append(f"{path.relative_to(root)}: {first}")
    return failures, len(files)


def tree_hashes(base: Path) -> dict[str, str]:
    """Relative path -> sha256 for every file under one skills tree."""
    hashes: dict[str, str] = {}
    for path in base.rglob("*"):
        if path.is_file() and not path.is_symlink():
            hashes[str(path.relative_to(base))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def compare_trees(root: Path) -> tuple[list[str], list[str], list[str]]:
    """(only in core/skills, only in .claude/skills, content differs)."""
    first, second = (tree_hashes(root / tree) for tree in SKILL_TREES)
    only_first = sorted(set(first) - set(second))
    only_second = sorted(set(second) - set(first))
    differs = sorted(name for name in set(first) & set(second) if first[name] != second[name])
    return only_first, only_second, differs


def skills_lock_drift(root: Path) -> list[str]:
    """Names of skills whose hash differs from the lock file, or [] if the script is missing."""
    script = root / SKILLS_LOCK_SCRIPT
    if not script.is_file():
        return []
    result = subprocess.run(
        ["bash", str(script)], cwd=root, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_SECONDS
    )
    return [line.split()[-1] for line in result.stdout.splitlines() if "DRIFT" in line]


def last_touch_times(root: Path) -> dict[str, int]:
    """Path -> unix time of the last commit that touched it, from one pass over the history."""
    log = subprocess.run(
        ["git", "log", "--format=%ct", "--name-only", "--no-renames"],
        cwd=root, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_SECONDS, check=True,
    ).stdout
    latest: dict[str, int] = {}
    stamp = 0
    for line in log.splitlines():
        if not line:
            continue
        if line.isdigit():
            stamp = int(line)
        else:
            latest.setdefault(line, stamp)
    return latest


def stale_files(root: Path) -> tuple[int, int, Counter[str]]:
    """(stale count, tracked count, stale per top-level folder)."""
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=root, capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT_SECONDS, check=True
    ).stdout.splitlines()
    latest = last_touch_times(root)
    cutoff = int(time.time()) - STALE_DAYS * SECONDS_PER_DAY
    per_folder: Counter[str] = Counter()
    stale = 0
    for name in tracked:
        if latest.get(name, 0) and latest[name] < cutoff:
            stale += 1
            per_folder["/".join(name.split("/")[:2]) if "/" in name else "(root)"] += 1
    return stale, len(tracked), per_folder


def section(title: str, lines: list[str]) -> str:
    return "\n".join([f"### {title}", "", *lines, ""])


def build_report(root: Path) -> tuple[str, bool]:
    """Return (markdown, ok). ok is False only for the hard failures listed in the module docstring."""
    py_errors, py_warned, py_total = check_python(root)
    sh_failures, sh_total = check_shell(root)
    only_a, only_b, differs = compare_trees(root)
    drift = skills_lock_drift(root)
    stale, tracked, per_folder = stale_files(root)

    hard = [f"- `{e}`" for e in py_errors] + [f"- `{e}`" for e in sh_failures]
    parts = [
        "## Weekly repository health",
        "",
        section(
            "Hard failures",
            hard or [f"None: {py_total} Python and {sh_total} shell files in the skills trees compile."],
        ),
        section(
            "Escape-sequence and other SyntaxWarnings in skills Python (information)",
            [f"- {sum(py_warned.values())} warnings in {len(py_warned)} files"]
            + [f"  - `{name}`: {count}" for name, count in py_warned.most_common(TOP_LIST)],
        ),
        section(
            "core/skills vs .claude/skills (information)",
            [f"- only in core/skills: {len(only_a)}", f"- only in .claude/skills: {len(only_b)}",
             f"- content differs: {len(differs)}"]
            + [f"  - `{name}`" for name in (only_a + only_b + differs)[:TOP_LIST]],
        ),
        section(
            "Skills lock drift (information)",
            [f"- {len(drift)} skills differ from core/config/skills-lock.json"]
            + [f"  - `{name}`" for name in drift[:TOP_LIST]],
        ),
        section(
            f"Tracked files untouched for {STALE_DAYS}+ days (information)",
            [f"- {stale} of {tracked} tracked files"]
            + [f"  - `{name}`: {count}" for name, count in per_folder.most_common(TOP_LIST)],
        ),
    ]
    return "\n".join(parts), not hard


def main() -> int:
    root = Path.cwd()
    report, ok = build_report(root)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(report + "\n")
    sys.stdout.write(report + "\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
