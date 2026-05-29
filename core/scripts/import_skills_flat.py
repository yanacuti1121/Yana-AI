#!/usr/bin/env python3
"""
import_skills_flat.py — Import skills from flat skills/<name>/SKILL.md repos.

Sources supported:
  TerminalSkills/skills  (Apache-2.0)
  veniceai/skills        (MIT)
  machina-sports/sports-skills (MIT)
  Any repo with skills/<name>/SKILL.md structure

Usage:
  python3 core/scripts/import_skills_flat.py /tmp/terminal-skills --prefix terminal
  python3 core/scripts/import_skills_flat.py /tmp/venice-skills   --prefix venice
  python3 core/scripts/import_skills_flat.py /tmp/sports-skills   --prefix sports
  python3 core/scripts/import_skills_flat.py /tmp/terminal-skills --prefix terminal --dry-run
"""

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

REPO_ROOT  = Path(__file__).parent.parent.parent
SKILLS_DIR = REPO_ROOT / "core" / "skills"

BOLD  = "\033[1m"; GREEN = "\033[32m"; RED = "\033[31m"
CYAN  = "\033[36m"; DIM  = "\033[2m"; YELLOW = "\033[33m"; RESET = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def detect_license(source_root: Path) -> str:
    for name in ("LICENSE", "LICENSE.txt", "LICENSE.md"):
        f = source_root / name
        if f.exists():
            txt = f.read_text(errors="replace").lower()
            if "apache" in txt: return "Apache-2.0"
            if "mit" in txt:    return "MIT"
            if "gpl" in txt:    return "GPL-3.0"
    return "unknown"


def strip_existing_frontmatter(content: str) -> tuple[dict, str]:
    if not content.startswith("---"):
        return {}, content
    end = content.find("\n---", 3)
    if end == -1:
        return {}, content
    fm_block = content[3:end].strip()
    body = content[end + 4:].lstrip("\n")
    fm: dict = {}
    for line in fm_block.splitlines():
        m = re.match(r'^([\w-]+):\s*(.*)$', line.strip())
        if m:
            val = m.group(2).strip().strip('"').strip("'")
            fm[m.group(1)] = val
    return fm, body


def build_frontmatter(prefix: str, skill_name: str, orig: dict,
                      license_str: str, source_url: str) -> str:
    dest_name = f"{prefix}--{skill_name}"
    desc = orig.get("description", f"{prefix} — {skill_name}")
    # Flatten multiline description
    desc = re.sub(r'\s+', ' ', desc).strip()
    desc = desc.replace('"', "'")[:300]

    # Preserve original tags/category if present
    extra = []
    if orig.get("metadata"):
        pass  # skip nested metadata block
    if orig.get("license"):
        license_str = orig["license"]

    lines = [
        "---",
        f"name: {dest_name}",
        f"description: >-",
        f"  {desc}",
        f'origin: "{source_url} (skill: {skill_name})"',
        f"license: {license_str}",
        f'version: "1.0.0"',
        f'compatibility: "yamtam-engine >= 0.14.0"',
        "---",
    ]
    return "\n".join(lines) + "\n"


def get_existing_skills() -> set[str]:
    return {d.name for d in SKILLS_DIR.iterdir() if d.is_dir()}


def import_flat_skills(source_dir: Path, prefix: str, license_str: str,
                       source_url: str, dry_run: bool,
                       skip_existing: bool = True) -> tuple[int, int, int]:
    """Return (imported, skipped_dup, skipped_no_skill)."""
    skills_path = source_dir / "skills"
    if not skills_path.is_dir():
        # Try root level
        skills_path = source_dir

    existing = get_existing_skills()
    imported = skipped_dup = skipped_no = 0

    skill_dirs = sorted(d for d in skills_path.iterdir() if d.is_dir()
                        and not d.name.startswith("."))

    for skill_dir in skill_dirs:
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            skipped_no += 1
            continue

        skill_name = skill_dir.name
        dest_name  = f"{prefix}--{skill_name}"

        if skip_existing and dest_name in existing:
            skipped_dup += 1
            continue

        content = skill_md.read_text(errors="replace")
        orig_fm, body = strip_existing_frontmatter(content)
        new_fm = build_frontmatter(prefix, skill_name, orig_fm, license_str, source_url)
        new_content = new_fm + "\n" + body

        if not dry_run:
            dest_dir = SKILLS_DIR / dest_name
            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / "SKILL.md").write_text(new_content)

            # Copy scripts/ if present
            for subdir in ("scripts", "assets", "agents"):
                src = skill_dir / subdir
                if src.is_dir():
                    dst = dest_dir / subdir
                    if dst.exists():
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)

        imported += 1

    return imported, skipped_dup, skipped_no


def update_counts(new_total: int) -> None:
    manifest_path = REPO_ROOT / "MANIFEST.json"
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text())
        comp = data.get("components", {})
        skills_comp = comp.get("skills", {})
        if isinstance(skills_comp, dict):
            old = skills_comp.get("count", 0)
            skills_comp["count"] = new_total
            comp["skills"] = skills_comp
            data["components"] = comp
            manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            print(c(CYAN, f"  MANIFEST.json skills: {old} → {new_total}"))

    for pfile in [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]:
        path = REPO_ROOT / pfile
        if not path.exists():
            continue
        d = json.loads(path.read_text())
        for section in [d, d.get("stats", {}), d.get("contents", {})]:
            if isinstance(section, dict) and "skills" in section and isinstance(section["skills"], int):
                section["skills"] = new_total
        path.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
        print(c(CYAN, f"  {pfile} skills → {new_total}"))


def main():
    parser = argparse.ArgumentParser(
        prog="import_skills_flat",
        description="Import skills from flat skills/<name>/SKILL.md repos",
    )
    parser.add_argument("source", help="Path to cloned skill repo")
    parser.add_argument("--prefix", required=True,
                        help="Namespace prefix (e.g. terminal, venice, sports)")
    parser.add_argument("--license", default=None,
                        help="Override license (auto-detected if not set)")
    parser.add_argument("--source-url", default=None,
                        help="Source URL for attribution")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-overwrite", action="store_true",
                        help="Re-import even if skill already exists")
    args = parser.parse_args()

    source = Path(args.source)
    license_str = args.license or detect_license(source)
    source_url  = args.source_url or f"github.com/{source.name}"

    print()
    print(c(BOLD, f"  import {source.name} → yamtam core/skills/  [{args.prefix}--*]"))
    if args.dry_run:
        print(c(YELLOW, "  DRY RUN"))
    print(c(DIM,  f"  License: {license_str}  |  Source: {source_url}"))
    print()

    imported, skipped_dup, skipped_no = import_flat_skills(
        source, args.prefix, license_str, source_url,
        dry_run=args.dry_run,
        skip_existing=not args.allow_overwrite,
    )

    total_now = sum(1 for _ in SKILLS_DIR.glob("*/SKILL.md"))

    print(f"  {c(GREEN, f'✓ Imported : {imported}')}")
    if skipped_dup:
        print(f"  {c(DIM, f'  Skipped (dup) : {skipped_dup}')}")
    if skipped_no:
        print(f"  {c(DIM, f'  Skipped (no SKILL.md) : {skipped_no}')}")
    print()
    print(f"  Total skills now: {c(BOLD, str(total_now))}")

    if not args.dry_run and imported > 0:
        print()
        update_counts(total_now)

    print()


if __name__ == "__main__":
    main()
