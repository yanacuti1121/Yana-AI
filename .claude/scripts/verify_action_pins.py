#!/usr/bin/env python3
"""Check that each pinned GitHub Action SHA is the commit of the tag its comment names.

A workflow line such as

    uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

is only consistent if that SHA currently is the commit of tag v7.0.1 in that
repository. Bulk updates sometimes change the SHA and leave the comment stale,
and a reviewer then has to compare them by hand. This script does the
comparison with `git ls-remote --tags` and prints one line per pin. It never
changes a file.

What a verdict means
    OK         the SHA is the commit of the tag named in the comment, right now.
    WEAK       same, but the comment names only a major version (v7). Upstream
               moves such tags routinely, so this is weak evidence.
    UNCHECKED  the comment names no version after the `#`, so nothing was tested.
    NO-TAG     the comment names a version but no tag points at that SHA.
    MISMATCH   the SHA is tagged, but not with the version in the comment.

OK is NOT a safety verdict. It does not prove the repository is the intended
one (a look-alike owner with a matching tag also gives OK), that the code is
safe, or that the tag will not be moved later. UNCHECKED, NO-TAG and MISMATCH
need a human decision.

Usage:
    python3 core/scripts/verify_action_pins.py [--strict] [workflow-dir]

Exit codes: 1 if any MISMATCH or NO-TAG (with --strict, also UNCHECKED) or if no
pins were found; otherwise 2 if a repository could not be reached; otherwise 0.
A problem (1) takes precedence over an unreachable repository (2).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

DEFAULT_WORKFLOW_DIR = ".github/workflows"
LS_REMOTE_TIMEOUT_SECONDS = 60  # one repository listing; generous for slow links
PROBLEM_VERDICTS = frozenset({"MISMATCH", "NO-TAG"})
# Keep git away from user config rewrites and from prompting for credentials.
GIT_ENV = {
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_SYSTEM": os.devnull,
}

_NAME = r"[A-Za-z0-9_][A-Za-z0-9_.-]*"  # may not start with "." or "-"
# Anchored to the start of a line so commented-out and in-string text is skipped.
_USES = re.compile(
    rf"^[ \t]*(?:-[ \t]+)?uses:[ \t]+(?P<repo>{_NAME}/{_NAME})(?P<path>/[A-Za-z0-9_./-]*)?"
    r"@(?P<sha>[0-9a-f]{40})\b(?P<comment>[^\n]*)",
    re.MULTILINE,
)
# The claim is the version written right after the comment's "#".
_CLAIM = re.compile(r"#[ \t]*(v\d+(?:\.\d+){0,2})(?![\w.-])")
_MAJOR_ONLY = re.compile(r"v\d+")


class RepoUnreachable(RuntimeError):
    """git ls-remote failed for a repository."""


def parse_pins(text: str) -> list[tuple[str, str, str]]:
    """Return (repo, sha, claimed_version) for each SHA-pinned `uses:` line.

    claimed_version is "" when the comment names no version after the `#`.
    """
    pins = []
    for match in _USES.finditer(text):
        claim = _CLAIM.search(match.group("comment"))
        pins.append((match.group("repo"), match.group("sha"), claim.group(1) if claim else ""))
    return pins


def tags_by_sha(ls_remote_output: str) -> dict[str, set[str]]:
    """Map a commit SHA to the tags that point at it, peeling annotated tags."""
    tag_commit: dict[str, str] = {}
    for line in ls_remote_output.splitlines():
        sha, _, ref = line.partition("\t")
        if not ref.startswith("refs/tags/"):
            continue
        name = ref[len("refs/tags/"):]
        if name.endswith("^{}"):
            tag_commit[name[:-3]] = sha  # the commit an annotated tag points at wins
        else:
            tag_commit.setdefault(name, sha)
    result: dict[str, set[str]] = {}
    for name, sha in tag_commit.items():
        result.setdefault(sha, set()).add(name)
    return result


def fetch_tags(repo: str) -> dict[str, set[str]]:
    """List a repository's tags with git, without a shell."""
    url = f"https://github.com/{repo}.git"
    try:
        done = subprocess.run(
            ["git", "ls-remote", "--tags", url],
            capture_output=True,
            text=True,
            timeout=LS_REMOTE_TIMEOUT_SECONDS,
            check=False,
            env={**os.environ, **GIT_ENV},
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RepoUnreachable(f"{repo}: {error}") from error
    if done.returncode != 0:
        raise RepoUnreachable(f"{repo}: git ls-remote exited {done.returncode}")
    return tags_by_sha(done.stdout)


def judge(claimed: str, tags: set[str]) -> str:
    """Return OK, WEAK, UNCHECKED, NO-TAG or MISMATCH for one pin."""
    if not claimed:
        return "UNCHECKED"  # pinned to a branch commit or uncommented; nothing to test
    if not tags:
        return "NO-TAG"
    if claimed not in tags:
        return "MISMATCH"
    return "WEAK" if _MAJOR_ONLY.fullmatch(claimed) else "OK"


def collect_pins(workflow_dir: Path) -> dict[tuple[str, str], set[str]]:
    """Group claimed versions by (repo, sha) across all workflow files."""
    grouped: dict[tuple[str, str], set[str]] = {}
    for path in sorted(workflow_dir.glob("*.y*ml")):
        for repo, sha, claimed in parse_pins(path.read_text(encoding="utf-8")):
            grouped.setdefault((repo, sha), set()).add(claimed)
    return grouped


def check_all(grouped, fetch=fetch_tags):
    """Return (rows, unreachable). Each repository is tried once, even when it fails."""
    cache: dict[str, dict[str, set[str]] | None] = {}
    rows = []
    unreachable: list[str] = []
    for (repo, sha), claims in sorted(grouped.items()):
        if repo not in cache:
            try:
                cache[repo] = fetch(repo)
            except RepoUnreachable as error:
                cache[repo] = None
                unreachable.append(str(error))
        if cache[repo] is None:
            continue
        tags = cache[repo].get(sha, set())
        for claimed in sorted(claims):
            rows.append((judge(claimed, tags), repo, sha, claimed, tags))
    return rows, unreachable


def exit_code(rows, unreachable: list[str], strict: bool) -> int:
    """1 for a problem, else 2 for an unreachable repository, else 0."""
    bad = PROBLEM_VERDICTS | ({"UNCHECKED"} if strict else frozenset())
    if any(row[0] in bad for row in rows):
        return 1
    return 2 if unreachable else 0


def print_report(rows, unreachable: list[str]) -> None:
    for verdict, repo, sha, claimed, tags in rows:
        shown = ", ".join(sorted(tags)) or "no tag points here"
        print(f"{verdict:9} {repo}@{sha[:8]} comment={claimed or '-'} tags=[{shown}]")
    for message in unreachable:
        print(f"UNREACHABLE {message}", file=sys.stderr)
    counts = {}
    for row in rows:
        counts[row[0]] = counts.get(row[0], 0) + 1
    summary = ", ".join(f"{n} {name}" for name, n in sorted(counts.items())) or "no pins checked"
    print(f"summary: {summary}, {len(unreachable)} unreachable")
    print("OK means only that the SHA is currently the commit of the tag in the comment; it is not a safety verdict.")


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    args = [arg for arg in argv[1:] if arg != "--strict"]
    workflow_dir = Path(args[0] if args else DEFAULT_WORKFLOW_DIR)
    if not workflow_dir.is_dir():
        print(f"verify_action_pins: not a directory: {workflow_dir}", file=sys.stderr)
        return 2
    grouped = collect_pins(workflow_dir)
    if not grouped:
        print(f"verify_action_pins: no SHA-pinned `uses:` lines found in {workflow_dir}", file=sys.stderr)
        return 1
    rows, unreachable = check_all(grouped)
    print_report(rows, unreachable)
    return exit_code(rows, unreachable, strict)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
