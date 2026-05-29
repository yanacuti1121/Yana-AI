#!/usr/bin/env python3
"""
import_openai_plugins.py — Import openai/plugins skills into YAMTAM core/skills/

Source: https://github.com/openai/plugins (MIT)
Naming: openai--<plugin>--<skill-name>

Usage:
  python3 core/scripts/import_openai_plugins.py /tmp/openai-plugins
  python3 core/scripts/import_openai_plugins.py /tmp/openai-plugins --dry-run
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


def strip_existing_frontmatter(content: str) -> tuple[dict, str]:
    """Parse and remove existing YAML frontmatter from SKILL.md."""
    if not content.startswith("---"):
        return {}, content
    end = content.find("\n---", 3)
    if end == -1:
        return {}, content
    fm_block = content[3:end].strip()
    body = content[end + 4:].lstrip("\n")
    fm = {}
    for line in fm_block.splitlines():
        m = re.match(r'^(\w[\w-]*):\s*"?([^"]*)"?\s*$', line.strip())
        if m:
            fm[m.group(1)] = m.group(2)
    return fm, body


def build_frontmatter(plugin_name: str, skill_name: str, orig: dict) -> str:
    name = f"openai--{plugin_name}--{skill_name}"
    desc = orig.get("description", f"{plugin_name} — {skill_name}")
    # Escape quotes
    desc = desc.replace('"', "'")
    lines = [
        "---",
        f'name: {name}',
        f'description: >-',
        f'  {desc}',
        f'origin: "openai/plugins — {plugin_name}/{skill_name} (MIT)"',
        f'license: MIT',
        f'version: "0.1.0"',
        f'compatibility: "yamtam-engine >= 0.14.0"',
        "---",
    ]
    return "\n".join(lines) + "\n"


def import_skill(plugin_dir: Path, skill_dir: Path, dry_run: bool) -> bool:
    """Import one skill. Returns True if imported."""
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return False

    plugin_name = plugin_dir.name
    skill_name  = skill_dir.name
    dest_name   = f"openai--{plugin_name}--{skill_name}"
    dest_dir    = SKILLS_DIR / dest_name

    content = skill_md.read_text(errors="replace")
    orig_fm, body = strip_existing_frontmatter(content)
    new_fm = build_frontmatter(plugin_name, skill_name, orig_fm)
    new_content = new_fm + "\n" + body

    if dry_run:
        return True

    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / "SKILL.md").write_text(new_content)

    # Copy scripts/ if present
    scripts_src = skill_dir / "scripts"
    if scripts_src.is_dir():
        scripts_dst = dest_dir / "scripts"
        if scripts_dst.exists():
            shutil.rmtree(scripts_dst)
        shutil.copytree(scripts_src, scripts_dst)

    # Copy assets/ if present
    assets_src = skill_dir / "assets"
    if assets_src.is_dir():
        assets_dst = dest_dir / "assets"
        if assets_dst.exists():
            shutil.rmtree(assets_dst)
        shutil.copytree(assets_src, assets_dst)

    return True


def main():
    parser = argparse.ArgumentParser(
        prog="import_openai_plugins",
        description="Import openai/plugins skills into YAMTAM core/skills/",
    )
    parser.add_argument("source", help="Path to cloned openai/plugins repo")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without writing files")
    parser.add_argument("--only", metavar="PLUGIN", nargs="+",
                        help="Import only these plugin names")
    args = parser.parse_args()

    source = Path(args.source)
    plugins_dir = source / "plugins"
    if not plugins_dir.is_dir():
        print(c(RED, f"  ✗ Not found: {plugins_dir}"), file=sys.stderr)
        sys.exit(1)

    print()
    print(c(BOLD, "  import openai/plugins → yamtam core/skills/"))
    if args.dry_run:
        print(c(YELLOW, "  DRY RUN — no files written"))
    print()

    total_plugins = imported = skipped = 0
    plugin_dirs = sorted(d for d in plugins_dir.iterdir() if d.is_dir())

    if args.only:
        plugin_dirs = [d for d in plugin_dirs if d.name in args.only]

    for plugin_dir in plugin_dirs:
        skills_dir_src = plugin_dir / "skills"
        if not skills_dir_src.is_dir():
            continue

        skill_dirs = sorted(d for d in skills_dir_src.iterdir() if d.is_dir())
        if not skill_dirs:
            continue

        total_plugins += 1
        plugin_count = 0

        for skill_dir in skill_dirs:
            ok = import_skill(plugin_dir, skill_dir, args.dry_run)
            if ok:
                imported += 1
                plugin_count += 1
            else:
                skipped += 1

        status = c(GREEN, f"✓ {plugin_count} skill(s)")
        print(f"  {plugin_dir.name:<35} {status}")

    print()
    print(c(BOLD, f"  Summary"))
    print(f"    Plugins processed : {total_plugins}")
    print(f"    Skills imported   : {c(GREEN, str(imported))}")
    print(f"    Skills skipped    : {c(DIM, str(skipped))} (no SKILL.md)")

    if not args.dry_run and imported > 0:
        # Update MANIFEST.json skills count
        manifest_path = REPO_ROOT / "MANIFEST.json"
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text())
            comp = data.get("components", {})
            skills_comp = comp.get("skills", {})
            if isinstance(skills_comp, dict):
                old_count = skills_comp.get("count", 0)
                new_count = sum(1 for _ in SKILLS_DIR.glob("*/SKILL.md"))
                skills_comp["count"] = new_count
                comp["skills"] = skills_comp
                data["components"] = comp
                manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
                print()
                print(c(CYAN, f"  MANIFEST.json skills: {old_count} → {new_count}"))

    print()
    if not args.dry_run:
        print(c(GREEN, f"  ✓ Done. Run `yamtam rule test --all` to validate."))
    else:
        print(c(YELLOW, f"  Dry run complete. Remove --dry-run to apply."))
    print()


if __name__ == "__main__":
    main()
