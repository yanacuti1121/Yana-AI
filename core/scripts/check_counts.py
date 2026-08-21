#!/usr/bin/env python3
"""Synchronize filesystem-derived Yana AI project metadata.

The filesystem is the canonical source for component counts. This script
owns the derived count fields in MANIFEST.json, plugin metadata, selected
current-state marketing copy, and README status banners.

Usage:
    python3 core/scripts/check_counts.py          # check, exit 1 on drift
    python3 core/scripts/check_counts.py --fix    # rewrite managed surfaces
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[2]
COMPONENTS = (
    "agents",
    "commands",
    "hooks",
    "scripts",
    "skills",
    "templates",
    "tests",
    "rules",
)
TOP_LEVEL_COUNT_FIELDS = {
    "agents": "agents_count",
    "commands": "commands_count",
    "hooks": "hooks_count",
    "scripts": "scripts_count",
    "skills": "skills_count",
    "rules": "rules_count",
}
PLUGIN_COUNT_FIELDS = ("agents", "commands", "hooks", "scripts", "skills", "rules")
README_FILES = ("README.md", "README.ko.md", "README.vi.md", "README.zh.md")
MARKETING_FILES = (
    "skills/yana-ai/SKILL.md",
    "docs/index.html",
    "docs/desktop.html",
    "docs/commands.html",
    ".claude/docs/index.html",
    ".claude/docs/desktop.html",
)
# Files whose Product-version display (MANIFEST.json's top-level "version")
# gets checked/fixed in addition to component counts. Deliberately narrower
# than MARKETING_FILES: docs/desktop.html's version badge and download URLs
# track the Desktop app's own most-recently-*published* release (same v*
# tag namespace, but only true once that tag's desktop build/publish job
# actually succeeds) rather than "whatever MANIFEST.json currently says" --
# auto-rewriting it here could advertise a download that doesn't exist yet
# if a tag's desktop build failed. Left out of this list deliberately, not
# an oversight -- see docs/RELEASE-CHECKLIST.md's Sứ Giả section.
VERSION_FILES = ("docs/index.html", "docs/commands.html", *README_FILES)
# Each entry is (pattern, replacement-template); the template embeds the
# literal "v" prefix itself where the surrounding markup uses one, rather
# than leaving it dangling outside both capture groups (a bare 'v' outside
# \g<1>/\g<2> is part of the matched text but not the replacement, so it
# would silently be dropped -- caught by the local --fix verification test
# this same change was built against, see docs/RELEASE-CHECKLIST.md).
# Curated per exact surrounding context (not a blanket vX.Y.Z regex)
# because at least one deliberate historical marker exists in the wild that
# must never be touched -- docs/index.html has "new in v0.40.0 / v1.2.0"
# describing when a past feature shipped, not the current release.
_VERSION_ANCHORS: dict[str, list[tuple[re.Pattern[str], str]]] = {
    "docs/index.html": [
        (re.compile(r'(<span class="dot"></span> )v\d+\.\d+\.\d+(\s*&nbsp;)'), r"\g<1>v{version}\g<2>"),
        (
            re.compile(
                r'(color:var\(--blue\);padding:\.1rem \.4rem;border-radius:4px">)'
                r'v\d+\.\d+\.\d+(</span>)'
            ),
            r"\g<1>v{version}\g<2>",
        ),
        (re.compile(r'(<strong>Yana AI</strong> — Apache 2\.0 · )v\d+\.\d+\.\d+(<br>)'), r"\g<1>v{version}\g<2>"),
    ],
    "docs/commands.html": [
        (
            re.compile(
                r'(— đối chiếu trực tiếp với source\. )v\d+\.\d+\.\d+( · \d{4}-\d{2}-\d{2}\.)'
            ),
            r"\g<1>v{version}\g<2>",
        ),
    ],
}
_PRODUCT_TABLE_ROW = re.compile(
    r'(\| Product \(rules/hooks/skills/agents/CLI\) \| \*\*)\d+\.\d+\.\d+(\*\* \|)'
)
JSON_FILES = (
    "MANIFEST.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "package.json",
)


class MetadataError(RuntimeError):
    """Raised when a managed metadata surface cannot be parsed safely."""


def _regular_files(directory: Path) -> list[Path]:
    return [path for path in directory.iterdir() if path.is_file() and not path.name.startswith(".")]


def real_counts(repo: Path = REPO) -> dict[str, int]:
    """Return every managed component count using one shared definition."""
    agents = [
        path
        for path in (repo / "core/agents").rglob("*.md")
        if path.name != "README.md" and not path.name[0].isupper()
    ]
    hooks = [path for path in _regular_files(repo / "core/hooks") if path.name != "CLAUDE.md"]
    return {
        "agents": len(agents),
        "commands": len(list((repo / "core/commands").rglob("*.md"))),
        "hooks": len(hooks),
        "scripts": len(_regular_files(repo / "core/scripts")),
        "skills": len(list((repo / "core/skills").rglob("SKILL.md"))),
        "templates": len(list((repo / "core/templates").rglob("*.md"))),
        "tests": len(list((repo / "core/tests").rglob("*.sh"))),
        "rules": len(list((repo / "core/rules").rglob("*.md"))),
    }


def canonical_version(repo: Path = REPO) -> str:
    """Return MANIFEST.json's Product-version axis only.

    Never reads Cargo.toml or pyproject.toml here -- VERSIONING.md documents
    three deliberately independent version axes (Product, yana-rt crate,
    Python package); conflating them would recreate the exact bug a 2026-07-05
    review already fixed once in the publish workflows.
    """
    manifest, _ = _read_json(repo / "MANIFEST.json")
    version = manifest.get("version")
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise MetadataError(f"MANIFEST.json 'version' is missing or not X.Y.Z: {version!r}")
    return version


def _apply_version_anchors(text: str, relative: str, version: str) -> str:
    updated = text
    for pattern, template in _VERSION_ANCHORS.get(relative, ()):
        updated = pattern.sub(template.format(version=version), updated)
    if relative in README_FILES:
        updated = _PRODUCT_TABLE_ROW.sub(rf"\g<1>{version}\g<2>", updated)
    return updated


def actual_present(repo: Path, component: str) -> list[str]:
    """Return the deterministic MANIFEST inventory for one component."""
    if component == "agents":
        paths = [
            path
            for path in (repo / "core/agents").rglob("*.md")
            if path.name != "README.md" and not path.name[0].isupper()
        ]
    elif component == "commands":
        paths = list((repo / "core/commands").rglob("*.md"))
    elif component == "hooks":
        paths = [path for path in _regular_files(repo / "core/hooks") if path.name != "CLAUDE.md"]
    elif component == "scripts":
        paths = _regular_files(repo / "core/scripts")
    elif component == "skills":
        paths = list((repo / "core/skills").rglob("SKILL.md"))
    elif component == "templates":
        paths = list((repo / "core/templates").rglob("*.md"))
    elif component == "rules":
        paths = list((repo / "core/rules").rglob("*.md"))
    elif component == "tests":
        directories = {path.parent for path in (repo / "core/tests").rglob("*.sh")}
        return sorted(str(path.relative_to(repo)) for path in directories)
    else:
        raise MetadataError(f"unsupported MANIFEST component inventory: {component}")
    return sorted(str(path.relative_to(repo)) for path in paths)


def _read_json(path: Path) -> tuple[dict[str, Any], str]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as error:
        raise MetadataError(f"cannot read {path}: {error}") from error
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise MetadataError(f"cannot parse {path}: {error}") from error
    if not isinstance(data, dict):
        raise MetadataError(f"expected a JSON object in {path}")
    return data, raw


def _replace_claims(text: str, counts: dict[str, int], labels: tuple[str, ...]) -> str:
    updated = text
    for label in labels:
        optional_word = r"(?:safety\s+)?" if label == "hooks" else ""
        pattern = re.compile(
            rf"(?<![\w.])\d[\d,.]*\+?(?=\s+{optional_word}{re.escape(label)}\b)",
            re.IGNORECASE,
        )

        def replace(match: re.Match[str]) -> str:
            replacement = f"{counts[label]:,}"
            if "." in match.group(0) and "," not in match.group(0):
                replacement = replacement.replace(",", ".")
            return replacement

        updated = pattern.sub(replace, updated)
    return updated


def _update_manifest(data: dict[str, Any], repo: Path, counts: dict[str, int]) -> None:
    components = data.get("components")
    if not isinstance(components, dict):
        raise MetadataError("MANIFEST.json is missing object field 'components'")
    for name in COMPONENTS:
        component = components.get(name)
        if not isinstance(component, dict):
            raise MetadataError(f"MANIFEST.json is missing component object '{name}'")
        component["count"] = counts[name]
        if "actual_present" not in component:
            raise MetadataError(f"MANIFEST.json component '{name}' is missing 'actual_present'")
        component["actual_present"] = actual_present(repo, name)

    for name, field in TOP_LEVEL_COUNT_FIELDS.items():
        if field not in data:
            raise MetadataError(f"MANIFEST.json is missing top-level field '{field}'")
        data[field] = counts[name]


def _update_plugin(data: dict[str, Any], counts: dict[str, int]) -> None:
    contents = data.get("contents")
    if not isinstance(contents, dict):
        raise MetadataError("plugin.json is missing object field 'contents'")
    for name in PLUGIN_COUNT_FIELDS:
        if name not in contents:
            raise MetadataError(f"plugin.json contents is missing '{name}'")
        contents[name] = counts[name]
    breakdown = contents.get("checks_breakdown")
    total = contents.get("checks")
    if isinstance(breakdown, dict) and isinstance(total, int) and sum(breakdown.values()) != total:
        raise MetadataError(
            f"plugin.json checks={total} but checks_breakdown sums to {sum(breakdown.values())}"
        )


def _update_marketplace(data: dict[str, Any], counts: dict[str, int]) -> None:
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        raise MetadataError("marketplace.json is missing object field 'metadata'")
    for field in ("tagline", "highlights"):
        value = metadata.get(field)
        if isinstance(value, str):
            metadata[field] = _replace_claims(value, counts, PLUGIN_COUNT_FIELDS)
        elif isinstance(value, list):
            metadata[field] = [
                _replace_claims(item, counts, PLUGIN_COUNT_FIELDS) if isinstance(item, str) else item
                for item in value
            ]


def _update_package(data: dict[str, Any], counts: dict[str, int]) -> None:
    description = data.get("description")
    if not isinstance(description, str):
        raise MetadataError("package.json is missing string field 'description'")
    data["description"] = _replace_claims(description, counts, ("agents", "hooks", "skills"))


def _expected_json(repo: Path, relative: str, counts: dict[str, int]) -> tuple[dict[str, Any], str]:
    data, raw = _read_json(repo / relative)
    expected = copy.deepcopy(data)
    if relative == "MANIFEST.json":
        _update_manifest(expected, repo, counts)
    elif relative == ".claude-plugin/plugin.json":
        _update_plugin(expected, counts)
    elif relative == ".claude-plugin/marketplace.json":
        _update_marketplace(expected, counts)
    elif relative == "package.json":
        _update_package(expected, counts)
    return expected, raw


def _expected_text(repo: Path, relative: str, counts: dict[str, int], version: str) -> tuple[str, str]:
    path = repo / relative
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as error:
        raise MetadataError(f"cannot read {path}: {error}") from error
    if relative in README_FILES:
        lines = raw.splitlines(keepends=True)
        lines[:30] = [
            _replace_claims(line, counts, PLUGIN_COUNT_FIELDS + ("scripts",)) for line in lines[:30]
        ]
        updated = "".join(lines)
        return _apply_version_anchors(updated, relative, version), raw
    if relative == "AGENTS.md":
        updated = re.sub(
            r"(?m)^\d[\d,]* commands in `core/commands/`\.",
            f"{counts['commands']:,} commands in `core/commands/`.",
            raw,
        )
        updated = re.sub(
            r"(?m)^\d[\d,]* skills in `core/skills/`\.",
            f"{counts['skills']:,} skills in `core/skills/`.",
            updated,
        )
        return updated, raw
    if relative == "docs/commands.html":
        # Skip _replace_claims entirely here: this page embeds a large JS
        # data blob of the 170 slash commands' own free-text descriptions
        # (e.g. "...map of all 19 agents...", "...5 quality-control
        # agents...") -- the generic label-word regex would "helpfully"
        # rewrite those unrelated numbers to match this repo's own
        # component counts, corrupting the descriptions. Confirmed by
        # running this exact check locally before landing it. Version
        # anchoring only; no count-claims on this file.
        return _apply_version_anchors(raw, relative, version), raw
    updated = _replace_claims(raw, counts, PLUGIN_COUNT_FIELDS)
    return _apply_version_anchors(updated, relative, version), raw


def managed_files(repo: Path = REPO) -> list[str]:
    files = [*JSON_FILES, *README_FILES, "AGENTS.md"]
    files.extend(relative for relative in MARKETING_FILES if (repo / relative).is_file())
    return files


def _manifest_ghosts(repo: Path) -> list[str]:
    manifest, _ = _read_json(repo / "MANIFEST.json")
    components = manifest.get("components", {})
    ghosts: list[str] = []
    if not isinstance(components, dict):
        return ghosts
    for component in components.values():
        if not isinstance(component, dict):
            continue
        entries = component.get("actual_present", [])
        if not isinstance(entries, list):
            continue
        for relative in entries:
            if isinstance(relative, str) and not (repo / relative).exists():
                ghosts.append(relative)
    return sorted(set(ghosts))


def drift(repo: Path = REPO) -> list[str]:
    counts = real_counts(repo)
    version = canonical_version(repo)
    problems: list[str] = []
    for relative in managed_files(repo):
        if relative in JSON_FILES:
            current, _ = _read_json(repo / relative)
            expected, _ = _expected_json(repo, relative, counts)
            if current != expected:
                problems.append(f"{relative} differs from filesystem-derived metadata")
        else:
            expected, current = _expected_text(repo, relative, counts, version)
            if current != expected:
                what = "version and/or count" if relative in VERSION_FILES else "count"
                problems.append(f"{relative} contains stale current-state {what} claims")
    problems.extend(f"MANIFEST.json references missing path: {path}" for path in _manifest_ghosts(repo))
    return problems


def _write_json(path: Path, data: dict[str, Any], ensure_ascii: bool) -> None:
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=ensure_ascii) + "\n",
        encoding="utf-8",
    )


def fix(repo: Path = REPO) -> list[str]:
    counts = real_counts(repo)
    version = canonical_version(repo)
    changed: list[str] = []
    for relative in managed_files(repo):
        path = repo / relative
        if relative in JSON_FILES:
            current, raw = _read_json(path)
            expected, _ = _expected_json(repo, relative, counts)
            if current != expected:
                _write_json(path, expected, ensure_ascii=(relative == ".claude-plugin/marketplace.json"))
                changed.append(relative)
            elif not raw.endswith("\n"):
                path.write_text(raw + "\n", encoding="utf-8")
                changed.append(relative)
        else:
            expected, current = _expected_text(repo, relative, counts, version)
            if current != expected:
                path.write_text(expected, encoding="utf-8")
                changed.append(relative)
    return changed


def find_claims(counts: dict[str, int]) -> list[tuple[str, str, str, int]]:
    """Compatibility helper retained for callers of the former checker API."""
    problems: list[tuple[str, str, str, int]] = []
    for relative in README_FILES:
        path = REPO / relative
        if not path.is_file():
            continue
        for label in ("agents", "hooks", "skills", "scripts"):
            pattern = re.compile(rf"(?<![\w.])(\d[\d,.]*)\s+{label}\b", re.IGNORECASE)
            for match in pattern.finditer("".join(path.read_text(encoding="utf-8").splitlines(True)[:30])):
                claimed = int(match.group(1).replace(",", "").replace(".", ""))
                if claimed != counts[label]:
                    problems.append((relative, label, match.group(0), counts[label]))
    return problems


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check or synchronize filesystem-derived project metadata.")
    parser.add_argument("--fix", action="store_true", help="Rewrite managed metadata surfaces.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        counts = real_counts(REPO)
        version = canonical_version(REPO)
        print("Real counts: " + ", ".join(f"{name}={counts[name]}" for name in COMPONENTS))
        print(f"Canonical Product version: {version}")
        if args.fix:
            changed = fix(REPO)
            for relative in changed:
                print(f"UPDATED {relative}")
        problems = drift(REPO)
    except (MetadataError, OSError) as error:
        print(f"METADATA ERROR: {error}", file=sys.stderr)
        return 2

    for problem in problems:
        print(f"METADATA DRIFT: {problem}")
    if problems:
        print(f"check_counts: {len(problems)} issue(s); run with --fix")
        return 1
    print("check_counts: CLEAN — managed metadata matches the filesystem")
    return 0


if __name__ == "__main__":
    sys.exit(main())
