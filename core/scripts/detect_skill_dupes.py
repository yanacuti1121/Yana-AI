#!/usr/bin/env python3
"""detect_skill_dupes.py — flag skill directories that look like near-duplicate
names (the "X", "X_v2", "X_fixed" pattern), per TODO.md's skill-governance item.

This is name-based only, not semantic-duplicate detection. Two skills covering
the same ground under unrelated names (e.g. "prompt-master" vs
"prompt-engineering", found manually during skill-ingestion review) will NOT
be caught here — that needs the trigger-phrase-overlap check described in
rule-consistency-policy.md's "Pre-Skill Creation Checklist", which is a
judgment call per new skill, not a batch script. This script only catches
the mechanical case: two directory names that normalize to the same base
after stripping a version/variant suffix.

A hit is not automatically a bug — see continuous-learning vs
continuous-learning-v2 (2026-07-24 audit): a real, intentional, already
cross-referenced v1→v2 pair, not an accidental duplicate. Read both SKILL.md
files before assuming a hit needs cleanup.

Usage: python3 core/scripts/detect_skill_dupes.py
Exit: 0 always (this is an advisory report, not a gate — see rationale above)
"""
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SKILLS_DIR = REPO_ROOT / "core" / "skills"

SUFFIX_PATTERNS = [
    r"[-_]v\d+$",
    r"[-_]\d+$",
    r"[-_]fixed$",
    r"[-_]new$",
    r"[-_]old$",
    r"[-_]final$",
    r"[-_]copy$",
    r"[-_]backup$",
    r"[-_]draft$",
    r"[-_]updated$",
    r"[-_]revised$",
]


def normalize(name: str) -> str:
    n = name.lower()
    changed = True
    while changed:
        changed = False
        for pat in SUFFIX_PATTERNS:
            new_n = re.sub(pat, "", n)
            if new_n != n:
                n = new_n
                changed = True
    return n


def main() -> int:
    if not SKILLS_DIR.is_dir():
        print(f"[detect_skill_dupes] SKILLS_DIR not found: {SKILLS_DIR}", file=sys.stderr)
        return 2

    names = sorted(
        p.name for p in SKILLS_DIR.iterdir()
        if p.is_dir() and (p / "SKILL.md").is_file()
    )

    groups: dict[str, list[str]] = {}
    for name in names:
        groups.setdefault(normalize(name), []).append(name)

    collisions = {k: v for k, v in groups.items() if len(v) > 1}

    print(f"[detect_skill_dupes] {len(names)} skill dirs scanned, "
          f"{len(collisions)} name-collision group(s) found")

    if not collisions:
        print("[detect_skill_dupes] CLEAN — no near-duplicate skill names")
        return 0

    for norm, variants in sorted(collisions.items()):
        print(f"  {norm}:")
        for v in variants:
            print(f"    - {v}")

    print()
    print("A hit above is not automatically a bug — read each SKILL.md pair.")
    print("A legitimate vN pair should cross-reference its sibling in its")
    print("description (see continuous-learning / continuous-learning-v2 for")
    print("the pattern this repo already uses).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
