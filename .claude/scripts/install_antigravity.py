#!/usr/bin/env python3
"""Install Yana AI's Google Antigravity surface into a project.

Writes three things under <target>/.agents/:
  rules/yana-ai.md   workspace rule (copied from adapters/antigravity.md)
  hooks.json         a "yana-ai-guard" PreToolUse hook, merged into any
                     existing file so a user's own hooks are kept
  hooks/             the adapter and guard-destructive.sh it calls, unless
                     the target is a Yana checkout, where the hook points at
                     core/adapters directly so no copy can drift

Antigravity runs hook commands with the working directory set to .agents/
(verified live against agy 1.4.5 on 2026-10-22: a command written as
"node .agents/hooks/x.js" resolved to .agents/.agents/hooks/x.js), so hook
paths here are relative to .agents/.

Used by `yana-ai install --engine antigravity` and
`core/scripts/switch-engine.sh antigravity`.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOK_NAME = "yana-ai-guard"
HOOK_TIMEOUT_SECONDS = 30
ADAPTER_REL = Path("core/adapters/antigravity/pre-tool-use.js")
GUARD_REL = Path("core/hooks/guard-destructive.sh")
RULES_REL = Path("adapters/antigravity.md")
LEGACY_RULE = Path(".agent/rules/yana-ai.md")


def _hook_entry(command: str) -> dict:
    return {
        "PreToolUse": [
            {
                "matcher": "*",
                "hooks": [{"type": "command", "command": command, "timeout": HOOK_TIMEOUT_SECONDS}],
            }
        ]
    }


def _copy(src: Path, dst: Path, dry_run: bool, actions: list[str], target: Path) -> None:
    if not src.is_file():
        raise FileNotFoundError(f"missing source file: {src}")
    actions.append(f"write {dst.relative_to(target)}")
    if not dry_run:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def _load_hooks(hooks_path: Path) -> dict:
    """Read and validate an existing hooks.json before anything is written."""
    if hooks_path.is_symlink():
        raise ValueError(f"{hooks_path} is a symlink; refusing to write through it")
    if not hooks_path.is_file():
        return {}
    loaded = json.loads(hooks_path.read_text(encoding="utf-8-sig"))
    if not isinstance(loaded, dict):
        raise ValueError(f"{hooks_path} is not a JSON object; refusing to overwrite it")
    return loaded


def _merge_hooks(hooks_path: Path, config: dict, command: str, dry_run: bool, actions: list[str]) -> None:
    """Write config + our hook atomically, keeping a .bak of the previous file."""
    merged = {**config, HOOK_NAME: _hook_entry(command)}
    actions.append(f"merge '{HOOK_NAME}' into .agents/hooks.json")
    if dry_run:
        return
    hooks_path.parent.mkdir(parents=True, exist_ok=True)
    if hooks_path.is_file():
        shutil.copy2(hooks_path, hooks_path.with_name("hooks.json.bak"))
    tmp = hooks_path.with_name("hooks.json.tmp")
    tmp.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, hooks_path)


def _retire_legacy_rule(target: Path, dry_run: bool, actions: list[str]) -> None:
    legacy = target / LEGACY_RULE
    if not legacy.is_file():
        return
    backup = legacy.with_name(f"yana-ai.md.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    actions.append(f"move legacy {LEGACY_RULE} -> {backup.relative_to(target)} (rule now in .agents/rules/)")
    if not dry_run:
        legacy.rename(backup)


def install_antigravity(target: Path, dry_run: bool = False, source_root: Path = REPO_ROOT) -> list[str]:
    """Install or refresh the Antigravity surface; returns the actions taken."""
    target = target.resolve()
    agents = target / ".agents"
    actions: list[str] = []
    if agents.is_symlink():
        raise ValueError(f"{agents} is a symlink; refusing to write through it")
    existing_hooks = _load_hooks(agents / "hooks.json")  # validate before writing anything

    _copy(source_root / RULES_REL, agents / "rules" / "yana-ai.md", dry_run, actions, target)

    if (target / ADAPTER_REL).is_file() and (target / GUARD_REL).is_file():
        command = f"node ../{ADAPTER_REL.as_posix()}"
    else:
        _copy(source_root / ADAPTER_REL, agents / "hooks" / "yana-pre-tool-use.js", dry_run, actions, target)
        _copy(source_root / GUARD_REL, agents / "hooks" / "guard-destructive.sh", dry_run, actions, target)
        command = "node hooks/yana-pre-tool-use.js"

    _merge_hooks(agents / "hooks.json", existing_hooks, command, dry_run, actions)
    _retire_legacy_rule(target, dry_run, actions)
    return actions


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Yana AI's Antigravity rule and PreToolUse hook")
    parser.add_argument("target", nargs="?", default=".", help="Project directory (default: .)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    args = parser.parse_args()
    try:
        actions = install_antigravity(Path(args.target), dry_run=args.dry_run)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"install_antigravity: {exc}", file=sys.stderr)
        return 1
    prefix = "would " if args.dry_run else ""
    for action in actions:
        print(f"  {prefix}{action}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
