#!/usr/bin/env python3
"""check_counts.py — single source of truth for skills/hooks/agents counts.

Computes the real counts directly from disk, then scans a curated list of
"about this project" docs (README variants, ARCHITECTURE.md, package.json,
etc.) for stale count claims.

Deliberately narrow scope — a repo-wide scan is mostly false positives:
CHANGELOG.md/HISTORY.md narrate counts AT THE TIME of past releases (not
current-state claims), core/commands/*.md and core/rules/*.md mention
counts as part of workflow instructions ("spawn 3 agents"), and
.claude/assistant/*.md holds personal session notes — none of those are
"drift" in the sense this script cares about.

MANIFEST.json / plugin.json / marketplace.json are deliberately excluded
too: those files encode TWO legitimate, different "agent count" metrics
(raw file count under core/agents/ including emotion-journal companions,
vs. real agent-definition count excluding them) that a blanket text regex
can't tell apart without false positives. Those are covered instead by
core/scripts/validate-counts.sh (raw-count metric) and
core/scripts/drift-check.sh (real-definition metric), both CI-enforced.
This script only checks the human-prose docs that talk about "N agents"
in one unambiguous sense — the real-definition count.

Usage: python3 core/scripts/check_counts.py
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# The only files treated as authoritative "current state" prose claims
# about the project. Add to this list deliberately — do not switch to a
# repo-wide rglob or add MANIFEST/plugin/marketplace JSON; see module
# docstring for why that produces mostly noise or false positives.
SCAN_FILES = [
    "README.md",
    "README.ko.md",
    "README.vi.md",
    "README.zh.md",
    "ARCHITECTURE.md",
    "AGENTS.md",
    "package.json",
]


def real_counts() -> dict[str, int]:
    # Mirrors the exact same `find` semantics core/scripts/drift-check.sh
    # uses for its own cross_check calls, so this script can never disagree
    # with the CI-enforced drift check about what "real" means.
    skills = len(list((REPO / "core/skills").rglob("SKILL.md")))
    hooks = len([
        p for p in (REPO / "core/hooks").iterdir()
        if p.is_file() and p.name != "CLAUDE.md" and not p.name.startswith(".")
    ])
    agents = len([
        p for p in (REPO / "core/agents").rglob("*.md")
        if "emotions" not in p.parts and p.name != "README.md" and not p.name[0].isupper()
    ])
    return {"skills": skills, "hooks": hooks, "agents": agents}


def find_claims(counts: dict[str, int]) -> list[tuple[str, str, str, int]]:
    problems = []
    # Matches "1989 skills", "1,989 skills", "101 agents", "50 hooks" etc.
    # Requires a comma-free or comma-grouped integer directly before the
    # label word, word-boundaried so "50 hooks" doesn't match "150 hookshire".
    patterns = {
        label: re.compile(rf"(?<![\w.])([\d][\d,]*)\+?\s+{label}\b", re.I)
        for label in counts
    }
    for rel in SCAN_FILES:
        f = REPO / rel
        if not f.is_file():
            continue
        for line in f.read_text(errors="replace").splitlines():
            for label, pat in patterns.items():
                # "N agents" is structurally ambiguous — this repo's docs
                # also use it for workflow examples ("Launch 3 agents in
                # parallel", "/audit ... via 5 agents") that aren't claims
                # about the project total. Empirically, every genuine total
                # claim in these docs co-occurs with a skills mention on
                # the same line (stats banners, "N agents · M skills");
                # workflow examples never do. Restrict to that shape.
                if label == "agents" and "skill" not in line.lower():
                    continue
                real = counts[label]
                for m in pat.finditer(line):
                    claimed = int(m.group(1).replace(",", ""))
                    if claimed != real:
                        problems.append((rel, label, m.group(0), real))
    return problems


def main() -> int:
    counts = real_counts()
    print(f"Real counts: {counts}")
    problems = find_claims(counts)
    for path, label, matched, real in problems:
        print(f"  DRIFT  {path}: found {matched!r} — actual {label} count is {real}")
    if problems:
        print(f"\n{len(problems)} stale count claim(s) found.")
        return 1
    print("\ncheck_counts: CLEAN — no stale skills/hooks/agents claims in docs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
