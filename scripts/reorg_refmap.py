#!/usr/bin/env python3
"""reorg_refmap.py: list which files reference a path, before and after a move.

Used by the repo reorganisation plan (.planning/repo-reorg/PLAN.md). Moving a
file or directory breaks every string that points at the old path, and the
existing checkers only cover a few known places. This tool answers one
question for any path: who still mentions it?

Counts are plain string matches, so they are an upper bound: a generic name
such as README.md matches unrelated mentions.

Usage:
  python3 scripts/reorg_refmap.py                      full survey
  python3 scripts/reorg_refmap.py --target plans/      files that mention plans/
  python3 scripts/reorg_refmap.py --target plans/ --expect-zero
      exit 1 if code, CI or config files still mention the path (use after a move)

Skipped on purpose: .claude/ (mirror of core/), core/skills/, vendor/, lock
files and build output.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass

CODE_EXTENSIONS = {
    ".rs", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".sh",
    ".yml", ".yaml", ".toml", ".json", ".jsonc", ".swift", ".plist",
}
SKIP_PREFIXES = (".claude/", "core/skills/", "vendor/", ".codex/skills/")
SKIP_PARTS = ("node_modules/", "/target/", "package-lock.json", "Cargo.lock", "compiled/")
MAX_FILE_BYTES = 1_500_000  # skip generated or binary-like blobs
NAME_BOUNDARY = r"(?<![\w/.-])"  # a path must not be the tail of a longer name
TOP_SAMPLE = 3


@dataclass(frozen=True)
class ScanFile:
    path: str
    text: str
    is_doc: bool


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)
    return [f for f in out.stdout.split("\n") if f]


def load_scan_set(files: list[str]) -> list[ScanFile]:
    scan: list[ScanFile] = []
    for path in files:
        if path.startswith(SKIP_PREFIXES) or any(p in path for p in SKIP_PARTS):
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext not in CODE_EXTENSIONS and ext != ".md":
            continue
        try:
            if os.path.getsize(path) > MAX_FILE_BYTES:
                continue
            with open(path, encoding="utf-8", errors="ignore") as fh:
                scan.append(ScanFile(path, fh.read(), ext == ".md"))
        except OSError as exc:
            sys.stderr.write(f"reorg_refmap: cannot read {path}: {exc}\n")
    return scan


def find_refs(scan: list[ScanFile], target: str, own_prefix: str | None = None):
    """Return (code_hits, doc_hits) as lists of (file, match_count)."""
    # A directory target ends with "/", so only a file or bare name needs the
    # end boundary (tools/yana-web must not match tools/yana-web-extra).
    end = "" if target.endswith("/") else r"(?![\w-])"
    rx = re.compile(NAME_BOUNDARY + re.escape(target) + end)
    code: list[tuple[str, int]] = []
    docs: list[tuple[str, int]] = []
    for item in scan:
        if item.path == target or (own_prefix and item.path.startswith(own_prefix)):
            continue
        hits = len(rx.findall(item.text))
        if hits:
            (docs if item.is_doc else code).append((item.path, hits))
    return code, docs


def out(line: str = "") -> None:
    sys.stdout.write(line + "\n")


def summarise(label: str, scan: list[ScanFile], target: str, own_prefix: str | None) -> None:
    code, docs = find_refs(scan, target, own_prefix)
    top = ", ".join(p for p, _ in sorted(code, key=lambda x: -x[1])[:TOP_SAMPLE])
    out(f"{label:34s} code/CI/config={len(code):3d}  docs={len(docs):3d}  {top}")


def survey(scan: list[ScanFile], files: list[str]) -> None:
    out("== Root .md files")
    root_md = sorted(f for f in files if "/" not in f and f.endswith(".md"))
    free = [f for f in root_md if not find_refs(scan, f)[0]]
    out(f"movable with doc-only edits ({len(free)}): " + ", ".join(free))
    out(f"referenced by code/CI/config ({len(root_md) - len(free)}): "
        + ", ".join(f for f in root_md if f not in free))
    out()
    out("== Directories")
    for d in ("plans/", ".planning/", "gates/", "core/gates/", "adapters/",
              "core/adapters/", "policy/", "examples/", ".yana-ai/"):
        summarise(d, scan, d, d)
    out()
    out("== tools/*")
    for tool in sorted(t for t in os.listdir("tools") if os.path.isdir(f"tools/{t}")):
        summarise(f"tools/{tool}", scan, f"tools/{tool}", f"tools/{tool}/")


def show_target(scan: list[ScanFile], target: str, expect_zero: bool) -> int:
    own = target.rstrip("/") + "/" if os.path.isdir(target) else None
    code, docs = find_refs(scan, target, own)
    out(f"target: {target}")
    out(f"code/CI/config files: {len(code)}")
    for path, hits in sorted(code, key=lambda x: -x[1]):
        out(f"  {hits:4d}  {path}")
    out(f"doc files: {len(docs)}")
    for path, hits in sorted(docs, key=lambda x: -x[1]):
        out(f"  {hits:4d}  {path}")
    if expect_zero and code:
        sys.stderr.write(f"reorg_refmap: {len(code)} code/CI/config file(s) still mention {target}\n")
        return 1
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Who references a path?")
    parser.add_argument("--target", help="a file or directory path, e.g. plans/")
    parser.add_argument("--expect-zero", action="store_true",
                        help="exit 1 if code, CI or config files still mention --target")
    args = parser.parse_args(argv)
    files = tracked_files()
    scan = load_scan_set(files)
    if args.target:
        return show_target(scan, args.target, args.expect_zero)
    survey(scan, files)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
