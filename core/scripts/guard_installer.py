#!/usr/bin/env python3
"""YAMTAM Guard Installer — runtime control layer hooks for Claude Code projects."""

import sys
import os
import json
import shutil
import argparse
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML required. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(3)

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parent.parent
GUARDS_DIR = REPO_ROOT / "guards"
INDEX_FILE = GUARDS_DIR / "index.yml"
HOOKS_SRC  = REPO_ROOT / "core" / "hooks"

# ── colors ────────────────────────────────────────────────────────────────────

_nc = not sys.stdout.isatty() or bool(os.environ.get("NO_COLOR"))

def _c(code, t): return t if _nc else f"\033[{code}m{t}\033[0m"
def bold(t):   return _c("1", t)
def cyan(t):   return _c("36", t)
def green(t):  return _c("32", t)
def yellow(t): return _c("33", t)
def red(t):    return _c("31", t)
def dim(t):    return _c("2", t)

RISK_COLOR = {"critical": red, "high": yellow, "medium": cyan}

# ── helpers ───────────────────────────────────────────────────────────────────

def load_index():
    if not INDEX_FILE.exists():
        print(red(f"Error: guards index not found at {INDEX_FILE}"), file=sys.stderr)
        sys.exit(3)
    with open(INDEX_FILE) as f:
        return yaml.safe_load(f).get("guards", {})


def load_settings(path: Path) -> dict:
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}


def save_settings(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def hook_command(meta: dict) -> str:
    return f"bash .claude/hooks/{meta['file']}"


def is_installed(settings: dict, hook_type: str, command: str) -> bool:
    for group in settings.get("hooks", {}).get(hook_type, []):
        for h in group.get("hooks", []):
            if h.get("command") == command:
                return True
    return False


def add_hook_to_settings(settings: dict, hook_type: str, matcher: str, command: str) -> dict:
    hooks = settings.setdefault("hooks", {})
    groups = hooks.setdefault(hook_type, [])

    # Find existing group with same matcher
    for group in groups:
        if group.get("matcher", "") == matcher:
            entry = {"type": "command", "command": command}
            if entry not in group.get("hooks", []):
                group.setdefault("hooks", []).append(entry)
            return settings

    # No matching group — create one
    groups.append({
        "matcher": matcher,
        "hooks": [{"type": "command", "command": command}]
    })
    return settings


def remove_hook_from_settings(settings: dict, hook_type: str, command: str) -> dict:
    for group in settings.get("hooks", {}).get(hook_type, []):
        group["hooks"] = [h for h in group.get("hooks", []) if h.get("command") != command]
    # Prune empty groups
    if hook_type in settings.get("hooks", {}):
        settings["hooks"][hook_type] = [g for g in settings["hooks"][hook_type] if g.get("hooks")]
    return settings

# ── commands ──────────────────────────────────────────────────────────────────

def cmd_list(args):
    guards = load_index()
    print()
    print(bold(cyan("  YAMTAM Guard Installer")) + dim(" — runtime control layer"))
    print()
    print(f"  {bold('NAME'):<22} {dim('HOOK TYPE'):<16} {dim('RISK'):<12} DESCRIPTION")
    print(f"  {'─'*18} {'─'*14} {'─'*10} {'─'*30}")
    for name, meta in guards.items():
        risk = meta.get("risk_level", "")
        colored_risk = RISK_COLOR.get(risk, dim)(risk)
        ht = meta.get("hook_type", "")
        desc = meta.get("description", "")[:50]
        print(f"  {bold(name):<22} {dim(ht):<16} {colored_risk:<20} {dim(desc)}")
    print()
    print(dim("  yamtam guard install <name>   — install a guard"))
    print(dim("  yamtam guard install all      — install all 5 guards"))
    print(dim("  yamtam guard status           — check installed guards"))
    print()


def cmd_status(args):
    guards = load_index()
    target_dir = Path(args.target) if args.target else Path.cwd()
    settings_path = target_dir / ".claude" / "settings.json"
    settings = load_settings(settings_path)

    print()
    print(bold(cyan("  Guard Status")) + dim(f"  —  {target_dir}"))
    print()

    any_missing = False
    for name, meta in guards.items():
        cmd = hook_command(meta)
        hook_type = meta["hook_type"]
        installed = is_installed(settings, hook_type, cmd)
        hook_file = target_dir / ".claude" / "hooks" / meta["file"]
        script_present = hook_file.exists()

        if installed and script_present:
            status = green("✓ installed")
        elif installed and not script_present:
            status = yellow("⚠ registered but script missing")
            any_missing = True
        else:
            status = dim("✗ not installed")
            any_missing = True

        print(f"  {bold(name):<22} {status}")

    print()
    if any_missing:
        print(dim("  Run: yamtam guard install <name>  or  yamtam guard install all"))
    print()


def cmd_install(args):
    guards = load_index()
    target_dir = Path(args.target) if args.target else Path.cwd()
    settings_path = target_dir / ".claude" / "settings.json"

    names = list(guards.keys()) if args.name == "all" else [args.name]

    for name in names:
        if name not in guards:
            print(red(f"Error: unknown guard '{name}'"), file=sys.stderr)
            print(dim("Run 'yamtam guard list' to see available guards."), file=sys.stderr)
            sys.exit(1)

    print()
    print(bold(f"  Installing to: {target_dir}"))
    print()

    for name in names:
        meta   = guards[name]
        src    = HOOKS_SRC / meta["file"]
        dst    = target_dir / ".claude" / "hooks" / meta["file"]
        cmd    = hook_command(meta)

        if not src.exists():
            print(f"  {yellow('⚠')} {name}: source hook not found at {src} — skipped")
            continue

        settings = load_settings(settings_path)

        if is_installed(settings, meta["hook_type"], cmd) and dst.exists():
            print(f"  {yellow('⚠')} {bold(name)} already installed — skipped")
            continue

        # Copy script
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

        # Register in settings.json
        settings = add_hook_to_settings(settings, meta["hook_type"], meta.get("matcher", ""), cmd)
        save_settings(settings_path, settings)

        risk = meta.get("risk_level", "")
        colored_risk = RISK_COLOR.get(risk, dim)(f"[{risk}]")
        print(f"  {green('✓')} {bold(name):<22} {colored_risk}  {dim(meta['description'])}")

    print()
    print(dim(f"  settings.json updated: {settings_path}"))
    print(dim("  Run: yamtam guard status   to verify"))
    print()


def cmd_remove(args):
    guards = load_index()
    name = args.name
    if name not in guards:
        print(red(f"Error: unknown guard '{name}'"), file=sys.stderr)
        sys.exit(1)

    target_dir = Path(args.target) if args.target else Path.cwd()
    settings_path = target_dir / ".claude" / "settings.json"
    settings = load_settings(settings_path)

    meta = guards[name]
    cmd  = hook_command(meta)
    hook_file = target_dir / ".claude" / "hooks" / meta["file"]

    print()
    remove_hook_from_settings(settings, meta["hook_type"], cmd)
    save_settings(settings_path, settings)
    print(f"  {green('✓')} {bold(name)} removed from settings.json")

    if hook_file.exists():
        hook_file.unlink()
        print(f"  {green('✓')} hook script deleted: {hook_file}")

    print()

# ── main ──────────────────────────────────────────────────────────────────────

USAGE = """
Usage: yamtam guard <subcommand> [name] [flags]

Subcommands:
  list                 List available guards and their risk levels
  status               Show which guards are installed in this project
  install <name|all>   Install a guard (copy script + register in settings.json)
  remove <name>        Uninstall a guard

Flags:
  --target <path>      Target project directory (default: current directory)
  --no-color           Disable color output

Examples:
  yamtam guard list
  yamtam guard status
  yamtam guard install guard-destructive
  yamtam guard install all
  yamtam guard install all --target /path/to/other-project
  yamtam guard remove truth-gate
"""


def main():
    parser = argparse.ArgumentParser(prog="yamtam guard", add_help=False)
    parser.add_argument("subcommand", nargs="?", default="list")
    parser.add_argument("name", nargs="?")
    parser.add_argument("--target")
    parser.add_argument("--no-color", action="store_true")
    parser.add_argument("-h", "--help", action="store_true")
    args = parser.parse_args()

    global _nc
    if args.no_color:
        _nc = True

    if args.help or args.subcommand in ("help", None):
        print(USAGE)
        return

    if args.subcommand in ("install", "remove") and not args.name:
        print(red(f"Error: '{args.subcommand}' requires a name argument."), file=sys.stderr)
        sys.exit(1)

    dispatch = {
        "list":    cmd_list,
        "status":  cmd_status,
        "install": cmd_install,
        "remove":  cmd_remove,
    }

    fn = dispatch.get(args.subcommand)
    if fn is None:
        print(red(f"Error: unknown subcommand '{args.subcommand}'"), file=sys.stderr)
        sys.exit(1)

    fn(args)


if __name__ == "__main__":
    main()
