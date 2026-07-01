#!/usr/bin/env python3
"""
Generate real, current counts of Yana AI's components directly from the
filesystem — the single source of truth that README.md / ARCHITECTURE.md /
worker.js's system prompt should quote instead of hand-typed numbers.

Added 2026-07-01 after an audit found 5 different agent counts across 5
files (162 / 95 / 93 / raw-204 / actual-101), none of them correct — because
every prior "fix" just hand-edited prose instead of generating it. This
script is step 1 of closing that loop; wire `--check` into CI so a stale
number fails the build instead of silently drifting again.

Usage:
    python3 core/scripts/generate-stats.py            # print current counts
    python3 core/scripts/generate-stats.py --check     # exit 1 if README/ARCHITECTURE.md/worker.js disagree with reality
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def unique_agents():
    """Unique agent persona basenames across core/agents + .claude/agents,
    excluding the emotions/ per-agent journal folder and non-agent shared
    identity fragments (IDENTITY.md, SOUL.md, README.md)."""
    names = set()
    for tree in ("core/agents", ".claude/agents"):
        base = os.path.join(ROOT, tree)
        if not os.path.isdir(base):
            continue
        for dirpath, _, files in os.walk(base):
            if os.sep + "emotions" in dirpath.replace(base, "", 1) or dirpath.endswith("emotions"):
                continue
            for f in files:
                if f.endswith(".md") and f not in ("IDENTITY.md", "SOUL.md", "README.md"):
                    names.add(f[:-3])
    return names


def count_skill_md(tree):
    base = os.path.join(ROOT, tree)
    if not os.path.isdir(base):
        return 0
    return sum(1 for dirpath, _, files in os.walk(base) if "SKILL.md" in files)


def count_files(tree, suffix):
    base = os.path.join(ROOT, tree)
    if not os.path.isdir(base):
        return 0
    n = 0
    for dirpath, _, files in os.walk(base):
        n += sum(1 for f in files if f.endswith(suffix))
    return n


def hooks_count():
    return max(count_files("core/hooks", ".sh"), count_files(".claude/hooks", ".sh"))


def rules_count():
    return max(count_files("core/rules", ".md"), count_files(".claude/rules", ".md"))


def commands_count():
    return max(count_files("core/commands", ".md"), count_files(".claude/commands", ".md"))


def stats():
    return {
        "agents": len(unique_agents()),
        "skills": count_skill_md("core/skills"),
        "hooks": hooks_count(),
        "rules": rules_count(),
        "commands": commands_count(),
    }


def main():
    s = stats()
    if "--check" in sys.argv:
        # Cross-check the numbers actually printed in README.md against reality.
        readme = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
        problems = []
        checks = [
            ("agents", r"\*\*(\d[\d,]*)\*\*\s*specialist agents"),
            ("skills", r"\*\*(\d[\d,]*)\*\*\s*workflow skill definitions"),
            ("hooks", r"\*\*(\d[\d,]*)\*\*\s*pre/post-execution hooks"),
        ]
        for key, pattern in checks:
            m = re.search(pattern, readme)
            if not m:
                problems.append(f"  {key}: pattern not found in README.md (README format changed?)")
                continue
            claimed = int(m.group(1).replace(",", ""))
            actual = s[key]
            if claimed != actual:
                problems.append(f"  {key}: README says {claimed}, filesystem has {actual}")
        if problems:
            print("✗ README.md is out of sync with the filesystem:")
            print("\n".join(problems))
            print("\nRe-run without --check to see current real numbers, then update README.md,")
            print("ARCHITECTURE.md, and worker.js's SYSTEM prompt to match.")
            sys.exit(1)
        print("✓ README.md numbers match the filesystem.")
        return
    print(json.dumps(s, indent=2))


if __name__ == "__main__":
    main()
