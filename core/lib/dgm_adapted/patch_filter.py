"""Filter a unified diff/patch string down to (or excluding) specific files.

Origin:  jennyzzt/dgm (Darwin Godel Machine), utils/git_utils.py
         (`filter_patch_by_files`, `remove_patch_by_files`)
         (Apache-2.0) -- https://github.com/jennyzzt/dgm
         pinned commit a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2
Ported:  2026-06-20. Direct translation -- both functions are plain string/
         line scanning over an already-produced patch string, no subprocess
         calls. The rest of git_utils.py (get_git_commit_hash, apply_patch,
         diff_versus_commit, reset_to_commit) was deliberately NOT ported:
         those all shell out to `git`, and `reset_to_commit` specifically
         runs `git reset --hard` + `git clean -fd` against the agent's own
         working tree on every self-improvement cycle -- exactly the
         unsupervised-irreversible-action pattern this repo's own
         human-gate-policy.md and 49-immutable-infrastructure-law.md ban an
         agent from doing autonomously.
License: Apache-2.0 (see vendor/dgm/_upstream/LICENSE)

Purpose: splitting a generated patch so only certain files' changes get
applied/reviewed (or excluding files matching a pattern) is directly useful
for Yana AI's own scope discipline -- e.g. checking a diff against a
declared scope (64-scope-drift-law.md) before deciding whether to apply it,
without needing a real git checkout to do the split.
"""
from __future__ import annotations


def filter_patch_by_files(patch_str: str, target_files: list[str]) -> str:
    """Keep only the diff blocks (`diff --git a/<f> b/<f>` sections) for `target_files`."""
    lines = patch_str.splitlines()
    filtered_lines: list[str] = []
    include_block = False

    for line in lines:
        if line.startswith("diff --git"):
            include_block = any(
                f"a/{target}" in line and f"b/{target}" in line for target in target_files
            )
        if include_block:
            filtered_lines.append(line)
    return "\n".join(filtered_lines)


def remove_patch_by_files(patch_str: str, keyword: str = "polyglot") -> str:
    """Drop diff blocks whose filename contains `keyword` (case-insensitive)."""
    lines = patch_str.splitlines()
    filtered_lines: list[str] = []
    include_block = True

    for line in lines:
        if line.startswith("diff --git"):
            include_block = keyword.lower() not in line.lower()
        if include_block:
            filtered_lines.append(line)
    return "\n".join(filtered_lines)
