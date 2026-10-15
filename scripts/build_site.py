#!/usr/bin/env python3
"""Build the public website (yana.vutam.link) from docs/ by copying an allowlist into site/.

docs/ holds the whole documentation of the repository, not only the website: internal runbooks, audit reports, state
files and scripts. A host that serves the whole folder publishes all of it. This step copies only what the website pages
use, so anything not listed here is never published, whatever else is added to docs/ later.

    python3 scripts/build_site.py [--src docs] [--out site]

It never follows a symbolic link, never writes into a folder that already has files, and exits 1 when a page links to a
file that was not published.
"""
import argparse
import os
import re
import shutil
import sys
from pathlib import Path

# Files at the top of docs/ that belong on the website, by suffix. latest.json and its signature are named exactly,
# because other .json files in docs/ are not website files.
TOP_LEVEL_SUFFIXES = {".html", ".css", ".js", ".txt", ".xml", ".ico", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"}
TOP_LEVEL_EXACT = {"latest.json", "latest.json.sig"}
# Folders the website pages use. Every other folder of docs/ is documentation for the repository.
ALLOWED_DIRS = ("assets", "music", "downloads")
# Never published, in any folder: repository documents, scripts and state.
BLOCKED_SUFFIXES = {".md", ".py", ".jsonl"}
LINK_PATTERN = re.compile(r"""(?:href|src)=["']([^"']*)["']""")
EXTERNAL_PATTERN = re.compile(r"^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//|#)")


class BuildError(Exception):
    pass


def _wanted_name(name: str) -> bool:
    return not name.startswith((".", "_"))


def _top_level_file_wanted(path: Path) -> bool:
    name = path.name
    if not _wanted_name(name) or path.suffix in BLOCKED_SUFFIXES:
        return False
    return name in TOP_LEVEL_EXACT or path.suffix in TOP_LEVEL_SUFFIXES


def _files_to_publish(src: Path):
    for entry in sorted(src.iterdir()):
        if entry.is_symlink():
            continue
        if entry.is_file() and _top_level_file_wanted(entry):
            yield entry
    for folder in ALLOWED_DIRS:
        root = src / folder
        if not root.is_dir() or root.is_symlink():
            continue
        for current, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if _wanted_name(d) and not (Path(current) / d).is_symlink())
            for name in sorted(files):
                path = Path(current) / name
                if _wanted_name(name) and path.suffix not in BLOCKED_SUFFIXES and not path.is_symlink():
                    yield path


def build(src: Path, out: Path) -> dict:
    src, out = Path(src).resolve(), Path(out).resolve()
    if not src.is_dir():
        raise BuildError(f"{src} is not a folder")
    if out == src or src in out.parents:
        raise BuildError("the output folder must be outside the source folder")
    if out.exists() and any(out.iterdir()):
        raise BuildError(f"{out} already has files; build into a new folder")
    count, size = 0, 0
    for path in _files_to_publish(src):
        target = out / path.relative_to(src)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        count += 1
        size += target.stat().st_size
    return {"files": count, "bytes": size}


def _resolves(site: Path, page: Path, ref: str) -> bool:
    base = site if ref.startswith("/") else page.parent
    target = (base / ref.lstrip("/")).resolve()
    if site not in target.parents and target != site:
        return False
    return target.is_file() or target.with_name(target.name + ".html").is_file() or (target.is_dir() and (target / "index.html").is_file())


def missing_links(site: Path) -> list:
    """(page, link) pairs where a local link does not resolve inside the published site. `download` finds download.html."""
    site = Path(site).resolve()
    missing = set()
    for page in sorted(site.rglob("*.html")):
        for ref in LINK_PATTERN.findall(page.read_text(errors="ignore")):
            ref = re.split(r"[#?]", ref, maxsplit=1)[0]
            if not ref or EXTERNAL_PATTERN.match(ref) or "$" in ref or "{" in ref:
                continue
            if not _resolves(site, page, ref):
                missing.add((str(page.relative_to(site)), ref))
    return sorted(missing)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--src", default="docs")
    parser.add_argument("--out", default="site")
    args = parser.parse_args(argv)
    try:
        result = build(Path(args.src), Path(args.out))
    except BuildError as error:
        print(f"build_site: {error}", file=sys.stderr)
        return 1
    print(f"build_site: published {result['files']} files, {result['bytes'] / 1_000_000:.1f} MB, into {args.out}")
    broken = missing_links(Path(args.out))
    for page, ref in broken:
        print(f"build_site: {page} links to {ref}, which is not published", file=sys.stderr)
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
