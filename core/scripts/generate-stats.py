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
    # Hooks are .sh and .js (3 hooks are .js: tool-attention, gitnexus-hook,
    # context-monitor). validate-counts.sh already counts both; this
    # function silently didn't, undercounting by 3 until fixed 2026-07-05.
    core_n = count_files("core/hooks", ".sh") + count_files("core/hooks", ".js")
    claude_n = count_files(".claude/hooks", ".sh") + count_files(".claude/hooks", ".js")
    return max(core_n, claude_n)


def rules_count():
    return max(count_files("core/rules", ".md"), count_files(".claude/rules", ".md"))


def commands_count():
    return max(count_files("core/commands", ".md"), count_files(".claude/commands", ".md"))


def core_lock_count():
    """Number of files pinned in core-lock.json — the number README.md
    quotes as "N core files pinned". Added 2026-08-12 after README said
    240 while the actual manifest had 277 (found during a doc-accuracy
    pass, same class of drift this whole script exists to catch)."""
    path = os.path.join(ROOT, "core", "config", "core-lock.json")
    if not os.path.isfile(path):
        return 0
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return len(data.get("files", {}))


def subcommands_count():
    """Top-level `yana-rt` subcommands — README quotes this as "N
    subcommands". Counts top-level variants of `enum Commands` in
    src/main.rs (4-space-indented `Name {`, `Name(`, and unit `Name,`
    variants only, so nested fields like `action: TaskAction,` inside a
    variant aren't counted).
    Added 2026-08-12 after README said 27 while the enum had 30."""
    path = os.path.join(ROOT, "src", "main.rs")
    if not os.path.isfile(path):
        return 0
    with open(path, encoding="utf-8") as f:
        text = f.read()
    match = re.search(r"^enum Commands \{(.*?)^\}", text, re.DOTALL | re.MULTILINE)
    if not match:
        return 0
    body = match.group(1)
    return len(re.findall(r"^    [A-Z][A-Za-z0-9_]*\s*(?:[({]|,)", body, re.MULTILINE))


def stats():
    return {
        "agents": len(unique_agents()),
        "skills": count_skill_md("core/skills"),
        "hooks": hooks_count(),
        "rules": rules_count(),
        "commands": commands_count(),
        "core_lock_files": core_lock_count(),
        "subcommands": subcommands_count(),
    }


def main():
    s = stats()
    if "--check" in sys.argv:
        # Cross-check the numbers actually printed against reality. The
        # Numbers table moved from README.md to docs/reference/architecture.md
        # on 2026-07-05 when the README was shortened; this check follows it.
        stats_file = os.path.join(ROOT, "docs", "reference", "architecture.md")
        readme = open(stats_file, encoding="utf-8").read()
        problems = []
        checks = [
            ("agents", r"\*\*(\d[\d,]*)\*\*\s*specialist agents"),
            ("skills", r"\*\*(\d[\d,]*)\*\*\s*workflow skill definitions"),
            ("hooks", r"\*\*(\d[\d,]*)\*\*\s*pre/post-execution hooks"),
            ("subcommands", r"Rust subcommands\s*\|\s*\*\*(\d[\d,]*)\*\*"),
        ]
        for key, pattern in checks:
            m = re.search(pattern, readme)
            if not m:
                problems.append(f"  {key}: pattern not found in README.md (README format changed?)")
                continue
            claimed = int(m.group(1).replace(",", ""))
            actual = s[key]
            if claimed != actual:
                problems.append(f"  {key}: docs/reference/architecture.md says {claimed}, filesystem has {actual}")

        # core-lock count and subcommand count also live directly in the
        # top-level README.md. Keep both the architecture table and README
        # checked because each is user-facing and can drift independently.
        readme_root_path = os.path.join(ROOT, "README.md")
        readme_root = open(readme_root_path, encoding="utf-8").read()
        readme_checks = [
            ("core_lock_files", r"core-lock\.json\s+# SHA-256 manifest — (\d[\d,]*) core files pinned"),
            ("subcommands", r"(\d[\d,]*) subcommands\. Zero Python dependency"),
        ]
        for key, pattern in readme_checks:
            m = re.search(pattern, readme_root)
            if not m:
                problems.append(f"  {key}: pattern not found in README.md (README format changed?)")
                continue
            claimed = int(m.group(1).replace(",", ""))
            actual = s[key]
            if claimed != actual:
                problems.append(f"  {key}: README.md says {claimed}, filesystem has {actual}")

        if problems:
            print("✗ docs are out of sync with the filesystem:")
            print("\n".join(problems))
            print("\nRe-run without --check to see current real numbers, then update")
            print("the reported documentation surfaces to match.")
            sys.exit(1)
        print("✓ docs/reference/architecture.md and README.md numbers match the filesystem.")
        return
    print(json.dumps(s, indent=2))


if __name__ == "__main__":
    main()
