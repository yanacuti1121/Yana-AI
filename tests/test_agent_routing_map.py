#!/usr/bin/env python3
"""Regression tests for core/config/agent-routing-map.json.

Nothing in this repo currently parses agent-routing-map.json and
dispatches to an agent with it -- it's read by the calling LLM per
core/commands/route.md. That means the routing rules had no
deterministic check at all: a rule could point at a renamed or deleted
agent and nothing would fail. This file adds two things:

1. A small reference matcher (`route()`) implementing the same
   first-match-wins, case-insensitive, word-boundary semantics the
   rules are written to express, so hint -> expected-primary can
   actually be asserted instead of eyeballed.
2. Referential integrity: every agent name the map points at (rule
   primary/verify_with, and the fallback) must exist under
   core/agents/. Word-boundary matching, not naive substring `in`,
   mirrors the fix src/route.rs's own regression suite already
   required for its classifier (a bare "ci" keyword must not fire on
   "specific" or "official").
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "core" / "config" / "agent-routing-map.json"


def _load_map() -> dict:
    with open(MAP_PATH, encoding="utf-8") as f:
        return json.load(f)


def _real_agent_names() -> set[str]:
    return {
        p.stem
        for p in (ROOT / "core" / "agents").rglob("*.md")
        if p.name != "README.md"
    }


def route(hint: str, config: dict) -> dict:
    """First rule whose match list has a word-boundary hit wins; else fallback."""
    hint_lower = hint.lower()
    for rule in config["rules"]:
        for keyword in rule["match"]:
            pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
            if re.search(pattern, hint_lower):
                return {"primary": rule["primary"], "verify_with": rule.get("verify_with")}
    return config["fallback"]


def _assert_route(config: dict, hint: str, expected_primary: str) -> None:
    result = route(hint, config)
    if result["primary"] != expected_primary:
        raise SystemExit(
            f"hint {hint!r} routed to {result['primary']!r}, expected {expected_primary!r}"
        )


def _verify_pack_routing_surface() -> None:
    node = shutil.which("node")
    if node is None:
        raise SystemExit("node is required to test verify-claude-pack.js")

    with tempfile.TemporaryDirectory() as temp_dir:
        project = Path(temp_dir)
        for name in ("CLAUDE.md", "README.md", "MEMORY.md", "PRD.md"):
            (project / name).write_text(f"# {name}\n", encoding="utf-8")

        claude = project / ".claude"
        (claude / "agents").mkdir(parents=True)
        (claude / "commands").mkdir()
        (claude / "config").mkdir()
        (claude / "agents" / "reviewer.md").write_text(
            "---\n"
            "name: reviewer\n"
            "description: Review changes\n"
            "tools: Read\n"
            "memory: project\n"
            "---\n"
            "Review changes.\n",
            encoding="utf-8",
        )
        (claude / "commands" / "review.md").write_text(
            "---\ndescription: Review changes\n---\n",
            encoding="utf-8",
        )
        (claude / "settings.json").write_text('{"hooks": {}}\n', encoding="utf-8")
        routing_path = claude / "config" / "agent-routing-map.json"
        routing_path.write_text(
            json.dumps({"rules": [{"primary": "reviewer"}]}),
            encoding="utf-8",
        )

        script = ROOT / "core" / "scripts" / "verify-claude-pack.js"
        valid = subprocess.run(
            [node, str(script)],
            cwd=project,
            text=True,
            capture_output=True,
            check=False,
        )
        if valid.returncode != 0:
            raise SystemExit(
                "verify-claude-pack.js rejected the installed routing-map layout:\n"
                f"stdout:\n{valid.stdout}\nstderr:\n{valid.stderr}"
            )
        expected = "OK   .claude/config/agent-routing-map.json checked"
        if expected not in valid.stdout:
            raise SystemExit(f"verifier did not confirm the canonical routing surface: {valid.stdout}")
        if "missing .claude/agent-routing-map.json" in valid.stdout:
            raise SystemExit("verifier still checks the retired routing-map path")

        routing_path.write_text(
            json.dumps(
                {
                    "rules": [{"primary": "reviewer"}],
                    "fallback": {"primary": "missing-agent"},
                }
            ),
            encoding="utf-8",
        )
        invalid = subprocess.run(
            [node, str(script)],
            cwd=project,
            text=True,
            capture_output=True,
            check=False,
        )
        if invalid.returncode != 1:
            raise SystemExit(
                "verifier must fail when the canonical routing map references a missing agent"
            )
        if "routing map references missing agent: missing-agent" not in invalid.stdout:
            raise SystemExit(f"missing-agent diagnostic was not actionable: {invalid.stdout}")


def main() -> int:
    config = _load_map()
    real_agents = _real_agent_names()

    # ── Referential integrity: every name the map points at must exist ──
    referenced: set[str] = {config["fallback"]["primary"], config["fallback"]["verify_with"]}
    for rule in config["rules"]:
        referenced.add(rule["primary"])
        if "verify_with" in rule:
            referenced.add(rule["verify_with"])

    missing = sorted(name for name in referenced if name not in real_agents)
    if missing:
        raise SystemExit(
            f"agent-routing-map.json references agents with no file under core/agents/: {missing}"
        )

    # ── Per-rule regression: one realistic hint per rule, derived from the ──
    # ── rule's own keywords so this can't silently drift from the config ──
    for rule in config["rules"]:
        keyword = rule["match"][0]
        hint = f"can you help with the {keyword} for this feature"
        _assert_route(config, hint, rule["primary"])

    # ── Fallback: a hint matching none of the configured keywords ──
    _assert_route(config, "write a haiku about the weather today", config["fallback"]["primary"])

    # ── Word-boundary regression (mirrors src/route.rs's own fix for this ──
    # ── exact bug class): short keywords like "ci"/"cd" must not fire on ──
    # ── substrings inside unrelated words. ──
    result = route("let's discuss the specific official policy wording", config)
    if result["primary"] == "cicd-engineer":
        raise SystemExit(
            "'specific official policy' should not match the 2-letter 'ci'/'cd' "
            "keywords as unanchored substrings"
        )

    _verify_pack_routing_surface()

    print(f"OK: agent routing map regression checks passed ({len(config['rules'])} rules).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
