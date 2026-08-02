#!/usr/bin/env python3
"""Check Claude and Codex capability parity against Yana AI core."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from sync_codex import (
    SOURCE_ROOT,
    agent_name,
    canonical_agent_sources,
    render_command_skill,
)


def skill_names(root: Path) -> set[str]:
    if not root.exists():
        return set()
    return {path.parent.name for path in root.rglob("SKILL.md")}


def command_names(root: Path) -> set[str]:
    if not root.exists():
        return set()
    return {path.stem for path in root.glob("*.md")}


def claude_agent_names(root: Path) -> set[str]:
    if not root.exists():
        return set()
    names: set[str] = set()
    for path in root.rglob("*.md"):
        if path.name == "README.md" or path.name[0].isupper():
            continue
        names.add(agent_name(path))
    return names


def codex_agent_names(root: Path) -> set[str]:
    if not root.exists():
        return set()
    names: set[str] = set()
    for path in root.glob("*.toml"):
        match = re.search(r'^name\s*=\s*"(.*)"\s*$', path.read_text(), re.MULTILINE)
        if match:
            names.add(json.loads(f'"{match.group(1)}"'))
    return names


def hook_scripts(config_path: Path, *, missing_ok: bool = False) -> set[str] | None:
    try:
        config_text = config_path.read_text()
    except FileNotFoundError:
        if missing_ok:
            return None
        raise
    config = json.loads(config_text)
    scripts: set[str] = set()
    for groups in config.get("hooks", {}).values():
        for group in groups:
            for hook in group.get("hooks", []):
                command = hook.get("command", "")
                scripts.update(
                    match.group(1)
                    for match in re.finditer(r"hooks/([A-Za-z0-9._-]+\.(?:sh|js))", command)
                )
    return scripts


def report_missing(label: str, source: set[str], target: set[str]) -> bool:
    missing = sorted(source - target)
    if not missing:
        return False
    print(f"FAIL: {label}: {', '.join(missing)}", file=sys.stderr)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default=".", help="Project directory (default: .)")
    args = parser.parse_args()
    target_root = Path(args.target).resolve()

    json.loads((SOURCE_ROOT / "core" / "config" / "engine-capabilities.json").read_text())

    source_agents = {agent_name(path) for path in canonical_agent_sources()}
    claude_agents = claude_agent_names(target_root / ".claude" / "agents")
    codex_agents = codex_agent_names(target_root / ".codex" / "agents")
    source_skills = skill_names(SOURCE_ROOT / "core" / "skills")
    claude_skills = skill_names(target_root / ".claude" / "skills")
    codex_skills = skill_names(target_root / ".agents" / "skills")
    source_commands = command_names(SOURCE_ROOT / "core" / "commands")
    claude_commands = command_names(target_root / ".claude" / "commands")
    claude_hooks = hook_scripts(SOURCE_ROOT / ".claude" / "settings.json")
    codex_hooks = hook_scripts(
        target_root / ".codex" / "hooks.json", missing_ok=True
    )
    if codex_hooks is None:
        print("FAIL: Codex target missing: .codex/hooks.json", file=sys.stderr)
        return 1

    failed = False
    failed = report_missing("Claude agents missing", source_agents, claude_agents) or failed
    failed = report_missing("Codex agents missing", source_agents, codex_agents) or failed
    failed = report_missing("Claude skills missing", source_skills, claude_skills) or failed
    failed = report_missing("Codex skills missing", source_skills, codex_skills) or failed
    failed = report_missing("Claude commands missing", source_commands, claude_commands) or failed
    failed = report_missing("Codex active hooks missing", claude_hooks, codex_hooks) or failed

    stale_commands: list[str] = []
    for command_name in sorted(source_commands):
        source_path = SOURCE_ROOT / "core" / "commands" / f"{command_name}.md"
        target_path = (
            target_root
            / ".agents"
            / "skills"
            / f"yana-command-{command_name}"
            / "SKILL.md"
        )
        if not target_path.exists() or target_path.read_text() != render_command_skill(source_path):
            stale_commands.append(command_name)
    if stale_commands:
        print(
            f"FAIL: Codex command adapters missing or stale: {', '.join(stale_commands)}",
            file=sys.stderr,
        )
        failed = True

    if not (target_root / "AGENTS.md").exists():
        print("FAIL: shared AGENTS.md missing", file=sys.stderr)
        failed = True

    if failed:
        return 1

    print("=== Claude ↔ Codex parity ===")
    print("Instructions: 1/1")
    print(f"Agents:       {len(source_agents)}/{len(source_agents)}")
    print(f"Skills:       {len(source_skills)}/{len(source_skills)}")
    print(f"Commands:     {len(source_commands)}/{len(source_commands)}")
    print(f"Active hooks: {len(claude_hooks)}/{len(claude_hooks)}")
    print("Result: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
