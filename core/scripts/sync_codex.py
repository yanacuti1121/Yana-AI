#!/usr/bin/env python3
"""Synchronize Yana AI's canonical capabilities into a Codex project."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[2]


def parse_frontmatter(source: str) -> tuple[dict[str, str], str]:
    if not source.startswith("---\n"):
        return {}, source.strip()

    end = source.find("\n---\n", 4)
    if end == -1:
        return {}, source.strip()

    metadata: dict[str, str] = {}
    lines = source[4:end].splitlines()
    index = 0
    while index < len(lines):
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", lines[index])
        if not match:
            index += 1
            continue

        key, raw_value = match.groups()
        if raw_value in {">", "|"}:
            parts: list[str] = []
            index += 1
            while index < len(lines) and lines[index][:1].isspace():
                parts.append(lines[index].strip())
                index += 1
            separator = " " if raw_value == ">" else "\n"
            metadata[key] = separator.join(parts).strip()
            continue

        metadata[key] = re.sub(r"^([\"'])(.*)\1$", r"\2", raw_value).strip()
        index += 1

    return metadata, source[end + 5 :].strip()


def first_paragraph(body: str) -> str:
    for paragraph in re.split(r"\n\s*\n", body):
        text = " ".join(
            line for line in paragraph.splitlines() if not re.match(r"^\s*#", line)
        )
        text = re.sub(r"[*_`]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            return text
    return "Yana AI specialist agent."


def canonical_agent_sources(source_root: Path = SOURCE_ROOT) -> list[Path]:
    agents_root = source_root / "core" / "agents"
    return sorted(
        path
        for path in agents_root.rglob("*.md")
        if path.name != "README.md" and not path.name[0].isupper()
    )


def agent_name(source_path: Path) -> str:
    metadata, _ = parse_frontmatter(source_path.read_text())
    return metadata.get("name") or source_path.stem


def agent_filename(source_path: Path) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", agent_name(source_path)).strip("-").lower()
    if not slug:
        raise ValueError(f"Agent name cannot be converted to a filename: {source_path}")
    return f"{slug}.toml"


def render_agent(source_path: Path) -> str:
    metadata, body = parse_frontmatter(source_path.read_text())
    name = metadata.get("name") or source_path.stem
    description = metadata.get("description") or metadata.get("role") or first_paragraph(body)
    if '"""' not in body:
        escaped_body = body.replace("\\", "\\\\")
        instructions = f'\"\"\"\n{escaped_body}\"\"\"'
    else:
        instructions = json.dumps(body, ensure_ascii=False)
    return "\n".join(
        [
            f"name = {json.dumps(name, ensure_ascii=False)}",
            f"description = {json.dumps(description, ensure_ascii=False)}",
            f"developer_instructions = {instructions}",
            "",
        ]
    )


def render_command_skill(source_path: Path) -> str:
    metadata, body = parse_frontmatter(source_path.read_text())
    command_name = source_path.stem
    skill_name = f"yana-command-{command_name}"
    description = metadata.get("description") or first_paragraph(body)
    adapter_description = f"Yana AI /{command_name} command adapter. {description}"
    return "\n".join(
        [
            "---",
            f"name: {skill_name}",
            f"description: {json.dumps(adapter_description, ensure_ascii=False)}",
            "---",
            "",
            f"# Yana AI Command: /{command_name}",
            "",
            f"Invoke this workflow explicitly as `${skill_name}`.",
            "Treat text supplied with the invocation as `$ARGUMENTS` wherever the source workflow references it.",
            "Follow the source workflow without weakening its approval, scope, safety, or verification requirements.",
            "",
            body,
            "",
        ]
    )


def relative_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(path.relative_to(root) for path in root.rglob("*") if path.is_file())


def stale_tree_files(source: Path, destination: Path) -> list[Path]:
    stale: list[Path] = []
    for relative_path in relative_files(source):
        source_path = source / relative_path
        destination_path = destination / relative_path
        if not destination_path.exists() or source_path.read_bytes() != destination_path.read_bytes():
            stale.append(relative_path)
    return stale


def copy_tree(source: Path, destination: Path, dry_run: bool = False) -> int:
    written = 0
    for relative_path in relative_files(source):
        source_path = source / relative_path
        destination_path = destination / relative_path
        if destination_path.exists() and source_path.read_bytes() == destination_path.read_bytes():
            continue
        written += 1
        if dry_run:
            continue
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination_path)
    return written


def copy_file(source: Path, destination: Path, dry_run: bool = False) -> int:
    if destination.exists() and source.read_bytes() == destination.read_bytes():
        return 0
    if not dry_run:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    return 1


def expected_agents(source_root: Path = SOURCE_ROOT) -> dict[str, str]:
    rendered: dict[str, str] = {}
    names: dict[str, Path] = {}
    for source_path in canonical_agent_sources(source_root):
        filename = agent_filename(source_path)
        if filename in rendered:
            raise ValueError(
                f"Codex agent filename collision: {source_path} and {names[filename]} -> {filename}"
            )
        rendered[filename] = render_agent(source_path)
        names[filename] = source_path
    return rendered


def sync_agents(source_root: Path, target_root: Path, dry_run: bool = False) -> int:
    target_dir = target_root / ".codex" / "agents"
    written = 0
    for filename, rendered in expected_agents(source_root).items():
        destination = target_dir / filename
        if destination.exists() and destination.read_text() == rendered:
            continue
        written += 1
        if dry_run:
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(rendered)
    return written


def sync_commands(source_root: Path, target_root: Path, dry_run: bool = False) -> int:
    source_dir = source_root / "core" / "commands"
    target_dir = target_root / ".agents" / "skills"
    written = 0
    for source_path in sorted(source_dir.glob("*.md")):
        destination = target_dir / f"yana-command-{source_path.stem}" / "SKILL.md"
        rendered = render_command_skill(source_path)
        if destination.exists() and destination.read_text() == rendered:
            continue
        written += 1
        if dry_run:
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(rendered)
    return written


def sync_codex(
    target_root: Path,
    source_root: Path = SOURCE_ROOT,
    dry_run: bool = False,
) -> dict[str, int]:
    target_root = target_root.resolve()
    counts = {
        "agents": sync_agents(source_root, target_root, dry_run),
        "commands": sync_commands(source_root, target_root, dry_run),
        "skills": copy_tree(
            source_root / "core" / "skills",
            target_root / ".agents" / "skills",
            dry_run,
        ),
        "hooks": copy_tree(
            source_root / "core" / "hooks",
            target_root / ".codex" / "hooks",
            dry_run,
        ),
        "config": copy_file(
            source_root / ".codex" / "config.toml",
            target_root / ".codex" / "config.toml",
            dry_run,
        ),
        "hook_config": copy_file(
            source_root / ".codex" / "hooks.json",
            target_root / ".codex" / "hooks.json",
            dry_run,
        ),
    }

    agents_path = target_root / "AGENTS.md"
    if not agents_path.exists():
        counts["guidance"] = copy_file(
            source_root / "adapters" / "codex.md", agents_path, dry_run
        )
    else:
        counts["guidance"] = 0
    return counts


def check_codex(target_root: Path, source_root: Path = SOURCE_ROOT) -> bool:
    target_root = target_root.resolve()
    if not target_root.is_dir():
        print(
            f"Codex target missing: {target_root}. "
            "Run sync_codex.py --target <directory> first.",
            file=sys.stderr,
        )
        return False

    failed = False

    missing_files: list[str] = []
    stale_files: list[str] = []
    required_files = {
        "AGENTS.md": None,
        ".codex/config.toml": source_root / ".codex" / "config.toml",
        ".codex/hooks.json": source_root / ".codex" / "hooks.json",
        ".codex/hooks/guard-destructive.sh": source_root / "core" / "hooks" / "guard-destructive.sh",
    }
    for relative_path, source_path in required_files.items():
        destination = target_root / relative_path
        if not destination.exists():
            missing_files.append(relative_path)
        elif source_path and destination.read_bytes() != source_path.read_bytes():
            stale_files.append(relative_path)

    missing_agents: list[str] = []
    stale_agents: list[str] = []
    for filename, rendered in expected_agents(source_root).items():
        destination = target_root / ".codex" / "agents" / filename
        if not destination.exists():
            missing_agents.append(filename.removesuffix(".toml"))
        elif destination.read_text() != rendered:
            stale_agents.append(filename.removesuffix(".toml"))

    source_skills = source_root / "core" / "skills"
    target_skills = target_root / ".agents" / "skills"
    source_skill_names = sorted(path.parent.name for path in source_skills.rglob("SKILL.md"))
    target_skill_names = {
        path.parent.name for path in target_skills.rglob("SKILL.md")
    } if target_skills.exists() else set()
    missing_skills = [name for name in source_skill_names if name not in target_skill_names]
    stale_skill_files = stale_tree_files(source_skills, target_skills)

    source_commands = sorted((source_root / "core" / "commands").glob("*.md"))
    stale_commands: list[str] = []
    for source_path in source_commands:
        destination = (
            target_root
            / ".agents"
            / "skills"
            / f"yana-command-{source_path.stem}"
            / "SKILL.md"
        )
        if not destination.exists() or destination.read_text() != render_command_skill(source_path):
            stale_commands.append(source_path.stem)

    stale_hook_files = stale_tree_files(
        source_root / "core" / "hooks", target_root / ".codex" / "hooks"
    )

    checks = [
        ("Missing Codex files", missing_files),
        ("Stale Codex files", stale_files),
        ("Missing Codex agents", missing_agents),
        ("Stale Codex agents", stale_agents),
        ("Missing Codex skills", missing_skills),
        ("Stale Codex skill files", [str(path) for path in stale_skill_files]),
        ("Stale Codex hook files", [str(path) for path in stale_hook_files]),
        ("Missing or stale Codex command adapters", stale_commands),
    ]
    for label, values in checks:
        if not values:
            continue
        failed = True
        suffix = ", ".join(values) if len(values) <= 12 else f"{len(values)}"
        print(f"{label}: {suffix}", file=sys.stderr)

    if failed:
        return False

    print(
        "Codex sync check: "
        f"{len(expected_agents(source_root))} agents, "
        f"{len(source_skill_names)} skills, "
        f"{len(source_commands)} commands, 0 missing or stale"
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default=".", help="Project directory (default: .)")
    parser.add_argument("--check", action="store_true", help="Report missing or stale files")
    parser.add_argument("--dry-run", action="store_true", help="Preview synchronization")
    args = parser.parse_args()
    target_root = Path(args.target)

    if args.check:
        return 0 if check_codex(target_root) else 1

    counts = sync_codex(target_root, dry_run=args.dry_run)
    prefix = "Codex sync preview" if args.dry_run else "Codex sync"
    print(
        f"{prefix}: {counts['agents']} agent files, "
        f"{counts['commands']} command adapters, "
        f"{counts['skills']} skill files, {counts['hooks']} hook files, "
        f"{counts['config'] + counts['hook_config'] + counts['guidance']} config files updated"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
