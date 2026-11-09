#!/usr/bin/env python3
"""Classify canonical hooks by evidence-backed runtime execution path."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MANIFESTS = {
    "claude-project": Path(".claude/settings.json"),
    "codex": Path(".codex/hooks.json"),
    "claude-plugin": Path(".claude-plugin/hooks/hooks.json"),
    "cursor": Path(".cursor/hooks.json"),
}
IGNORED_HOOK_FILES = {".gitkeep", "CLAUDE.md"}
VALID_DISPOSITIONS = {"SHOULD_WIRE", "SUPERSEDED", "REFERENCE_ONLY", "DELETE"}


@dataclass(frozen=True)
class HookResult:
    name: str
    execution_status: str
    surfaces: tuple[str, ...]
    callers: tuple[str, ...]
    disposition: str | None
    reason: str | None


def strings(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


def load_manifest_strings(root: Path) -> dict[str, str]:
    output: dict[str, str] = {}
    for surface, relative in MANIFESTS.items():
        path = root / relative
        if not path.is_file():
            output[surface] = ""
            continue
        parsed = json.loads(path.read_text(encoding="utf-8"))
        output[surface] = "\n".join(strings(parsed))
    return output


def executable_text(path: Path) -> str:
    lines = []
    in_block_comment = False
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = raw.strip()
        if stripped.startswith("/*"):
            in_block_comment = True
        if not in_block_comment and stripped and not stripped.startswith(("#", "//", "*")):
            lines.append(raw)
        if in_block_comment and "*/" in stripped:
            in_block_comment = False
    return "\n".join(lines)


def audit(root: Path) -> list[HookResult]:
    hooks_dir = root / "core/hooks"
    hook_paths = {
        path.name: path
        for path in hooks_dir.iterdir()
        if path.is_file() and path.name not in IGNORED_HOOK_FILES
    }
    manifests = load_manifest_strings(root)
    direct = {
        name: tuple(surface for surface, text in manifests.items() if name in text)
        for name in hook_paths
    }

    references: dict[str, set[str]] = {name: set() for name in hook_paths}
    for caller, path in hook_paths.items():
        text = executable_text(path)
        for target in hook_paths:
            if target != caller and re.search(rf"(?<![\w.-]){re.escape(target)}(?![\w.-])", text):
                references[target].add(caller)

    reachable = {name for name, surfaces in direct.items() if surfaces}
    changed = True
    while changed:
        changed = False
        for target, callers in references.items():
            if target not in reachable and callers & reachable:
                reachable.add(target)
                changed = True

    config_path = root / "core/config/hook-execution-dispositions.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    dispositions = config.get("hooks", {})
    results = []
    for name in sorted(hook_paths):
        surfaces = direct[name]
        live_callers = tuple(sorted(references[name] & reachable))
        if surfaces:
            status = "WIRED"
        elif name in reachable:
            status = "INDIRECT"
        else:
            status = "DEAD"
        override = dispositions.get(name, {}) if status == "DEAD" else {}
        results.append(
            HookResult(
                name=name,
                execution_status=status,
                surfaces=surfaces,
                callers=live_callers,
                disposition=override.get("disposition"),
                reason=override.get("reason"),
            )
        )
    return results


def validate(results: list[HookResult], root: Path) -> list[str]:
    errors = []
    dead = {item.name for item in results if item.execution_status == "DEAD"}
    config = json.loads(
        (root / "core/config/hook-execution-dispositions.json").read_text(encoding="utf-8")
    ).get("hooks", {})
    stale = set(config) - dead
    if stale:
        errors.append(f"stale dispositions for runtime-reachable hooks: {', '.join(sorted(stale))}")
    for item in results:
        if item.execution_status != "DEAD":
            continue
        if item.disposition not in VALID_DISPOSITIONS:
            errors.append(f"{item.name}: missing or invalid DEAD disposition")
        if not item.reason:
            errors.append(f"{item.name}: disposition reason is required")
    for surface, text in load_manifest_strings(root).items():
        for command in text.splitlines():
            if re.search(r"(?:^|[;&]\s*|\s)bash\s+[^\n]*\.js(?:[\"']|\s|$)", command):
                errors.append(f"{surface}: JavaScript hook registered with bash: {command}")
            if re.search(r"(?:^|[;&]\s*|\s)node\s+[^\n]*\.sh(?:[\"']|\s|$)", command):
                errors.append(f"{surface}: shell hook registered with node: {command}")
    return errors


def summary(results: list[HookResult]) -> dict[str, int]:
    counts = {"WIRED": 0, "INDIRECT": 0, "DEAD": 0}
    for item in results:
        counts[item.execution_status] += 1
    return counts


def markdown(results: list[HookResult], root: Path) -> str:
    counts = summary(results)
    lines = [
        "# Hook Execution-Path Audit",
        "",
        "Generated from runtime manifests by `core/scripts/audit_hook_execution_paths.py`.",
        "A hook header such as `Status: active` is descriptive metadata, not execution evidence.",
        "",
        f"- Canonical hooks: **{len(results)}**",
        f"- WIRED: **{counts['WIRED']}**",
        f"- INDIRECT: **{counts['INDIRECT']}**",
        f"- DEAD (no path from a known runtime manifest): **{counts['DEAD']}**",
        "",
        "Known runtime manifests: " + ", ".join(f"`{path}`" for path in MANIFESTS.values()) + ".",
        "",
        "| Hook | Execution | Runtime surface / caller | DEAD disposition | Evidence |",
        "|---|---|---|---|---|",
    ]
    for item in results:
        path = "<br>".join(item.surfaces or item.callers) or "—"
        disposition = item.disposition or "—"
        reason = (item.reason or "Direct or reachable runtime execution path.").replace("|", "\\|")
        lines.append(
            f"| `{item.name}` | {item.execution_status} | {path} | {disposition} | {reason} |"
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- `WIRED` means at least one known runtime manifest names the hook.",
            "- `INDIRECT` means executable code in a reachable hook invokes it.",
            "- `DEAD` means this audit found no execution path; it does not automatically mean delete.",
            "- `SHOULD_WIRE` is a review queue, not authorization to register the hook without latency, overlap, and exit-contract testing.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    results = audit(root)
    errors = validate(results, root)
    if args.json:
        print(json.dumps({"summary": summary(results), "hooks": [item.__dict__ for item in results]}, indent=2))
    elif args.markdown:
        print(markdown(results, root))
    else:
        counts = summary(results)
        print(f"hook execution paths: {len(results)} total · {counts['WIRED']} WIRED · {counts['INDIRECT']} INDIRECT · {counts['DEAD']} DEAD")
        for item in results:
            if item.execution_status == "DEAD":
                print(f"  {item.name}: {item.disposition} — {item.reason}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    return 1 if args.check and errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
