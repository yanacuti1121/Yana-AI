"""Regression tests for filesystem-derived project metadata synchronization."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "core/scripts/check_counts.py"
SPEC = importlib.util.spec_from_file_location("project_metadata", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
project_metadata = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(project_metadata)


class ProjectMetadataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        for relative in (
            "core/agents",
            "core/commands",
            "core/hooks",
            "core/scripts",
            "core/skills/one",
            "core/templates",
            "core/tests",
            "core/rules",
            ".claude-plugin",
        ):
            (self.root / relative).mkdir(parents=True, exist_ok=True)

        (self.root / "core/agents/one.md").write_text("agent\n", encoding="utf-8")
        (self.root / "core/agents/SOUL.md").write_text("companion\n", encoding="utf-8")
        (self.root / "core/commands/one.md").write_text("command\n", encoding="utf-8")
        (self.root / "core/hooks/one.sh").write_text("#!/bin/sh\n", encoding="utf-8")
        (self.root / "core/hooks/CLAUDE.md").write_text("companion\n", encoding="utf-8")
        (self.root / "core/scripts/one.py").write_text("pass\n", encoding="utf-8")
        (self.root / "core/skills/one/SKILL.md").write_text("skill\n", encoding="utf-8")
        (self.root / "core/templates/one.md").write_text("template\n", encoding="utf-8")
        (self.root / "core/tests/one.sh").write_text("#!/bin/sh\n", encoding="utf-8")
        (self.root / "core/rules/one.md").write_text("rule\n", encoding="utf-8")

        components = {
            name: {"count": 0, "actual_present": []}
            for name in project_metadata.COMPONENTS
        }
        manifest = {
            "version": "1.0.0",
            "components": components,
            **{field: 0 for field in project_metadata.TOP_LEVEL_COUNT_FIELDS.values()},
        }
        self._write_json("MANIFEST.json", manifest)
        self._write_json(
            ".claude-plugin/plugin.json",
            {
                "contents": {
                    **{name: 0 for name in project_metadata.PLUGIN_COUNT_FIELDS},
                    "checks": 3,
                    "checks_breakdown": {"one": 1, "two": 2},
                }
            },
        )
        self._write_json(
            ".claude-plugin/marketplace.json",
            {
                "metadata": {
                    "tagline": "9 hooks · 9 skills",
                    "highlights": ["9 safety hooks", "9 agents", "9 rules"],
                }
            },
        )
        self._write_json("package.json", {"description": "9 hooks · 9 skills · 9 agents"})
        for relative in project_metadata.README_FILES:
            (self.root / relative).write_text(
                "header\n9 agents · 9 skills\n9 rules · 9 hooks · 9 scripts\n"
                "\n"
                "| Axis | Version | Registry |\n"
                "|---|---|---|\n"
                "| Product (rules/hooks/skills/agents/CLI) | **0.9.0** | None |\n"
                "| Rust runtime (`yana-rt`) | **0.9.0** | crates.io |\n"
                "\n"
                "### What's new in v0.9.0\n",
                encoding="utf-8",
            )
        (self.root / "AGENTS.md").write_text(
            "9 commands in `core/commands/`.\n9 skills in `core/skills/`.\n",
            encoding="utf-8",
        )
        (self.root / "docs").mkdir(parents=True, exist_ok=True)
        (self.root / "docs/index.html").write_text(
            '<div class="hero-badge"><span class="dot"></span> v0.9.0 &nbsp;'
            "·&nbsp; yana-rt 2.0.0 &nbsp;·&nbsp; <span id=\"live-dl\"></span></div>\n"
            '<span style="font-size:.67rem;background:hsla(221,75%,48%,.1);'
            'color:var(--blue);padding:.1rem .4rem;border-radius:4px">v0.9.0</span>\n'
            '<strong>Yana AI</strong> — Apache 2.0 · v0.9.0<br>\n'
            '<span style="color:hsl(221 83% 70%)">■</span> new in v0.1.0 / v0.2.0\n',
            encoding="utf-8",
        )
        (self.root / "docs/commands.html").write_text(
            "<script>\n"
            'const SLASH_DATA = {"cmds": [{"n": "agent-map", '
            '"d": "map of all 19 agents"}]};\n'
            "</script>\n"
            '<span class="mono">Dựng từ core/commands/*.md + bin/yana + '
            "src/main.rs — đối chiếu trực tiếp với source. v0.9.0 · 2026-01-01.</span>\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_json(self, relative: str, value: object) -> None:
        (self.root / relative).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def test_fix_updates_all_managed_surfaces_and_is_idempotent(self) -> None:
        changed = project_metadata.fix(self.root)
        self.assertIn("MANIFEST.json", changed)
        self.assertIn(".claude-plugin/plugin.json", changed)
        self.assertIn("README.md", changed)
        self.assertEqual(project_metadata.drift(self.root), [])
        self.assertEqual(project_metadata.fix(self.root), [])

        manifest = json.loads((self.root / "MANIFEST.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["components"]["scripts"]["count"], 1)
        self.assertEqual(
            manifest["components"]["scripts"]["actual_present"],
            ["core/scripts/one.py"],
        )
        self.assertEqual(
            manifest["components"]["tests"]["actual_present"],
            ["core/tests"],
        )
        self.assertIn("1 scripts", (self.root / "README.md").read_text(encoding="utf-8"))

    def test_manifest_ghost_is_actionable_drift(self) -> None:
        project_metadata.fix(self.root)
        manifest_path = self.root / "MANIFEST.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["components"]["agents"]["actual_present"] = ["core/agents/missing.md"]
        self._write_json("MANIFEST.json", manifest)
        self.assertIn(
            "MANIFEST.json references missing path: core/agents/missing.md",
            project_metadata.drift(self.root),
        )

    def test_invalid_check_breakdown_fails_closed(self) -> None:
        plugin_path = self.root / ".claude-plugin/plugin.json"
        plugin = json.loads(plugin_path.read_text(encoding="utf-8"))
        plugin["contents"]["checks"] = 99
        self._write_json(".claude-plugin/plugin.json", plugin)
        with self.assertRaises(project_metadata.MetadataError):
            project_metadata.drift(self.root)

    def test_localized_thousands_separator_is_preserved(self) -> None:
        self.assertEqual(
            project_metadata._replace_claims("2.024 skills", {"skills": 2025}, ("skills",)),
            "2.025 skills",
        )

    def test_canonical_version_reads_manifest_product_axis(self) -> None:
        self.assertEqual(project_metadata.canonical_version(self.root), "1.0.0")

    def test_canonical_version_rejects_missing_or_malformed_field(self) -> None:
        manifest_path = self.root / "MANIFEST.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        del manifest["version"]
        self._write_json("MANIFEST.json", manifest)
        with self.assertRaises(project_metadata.MetadataError):
            project_metadata.canonical_version(self.root)

    def test_fix_updates_version_badges_and_preserves_historical_marker(self) -> None:
        changed = project_metadata.fix(self.root)
        self.assertIn("docs/index.html", changed)

        html = (self.root / "docs/index.html").read_text(encoding="utf-8")
        self.assertIn('<span class="dot"></span> v1.0.0 &nbsp;', html)
        self.assertIn("v1.0.0</span>", html)
        self.assertIn("Apache 2.0 · v1.0.0<br>", html)
        # The other axis on the same line, and the historical "shipped in"
        # marker, must survive untouched -- this is the regression this
        # anchor-list design exists to prevent (a blanket vX.Y.Z regex
        # would silently corrupt both).
        self.assertIn("yana-rt 2.0.0", html)
        self.assertIn("new in v0.1.0 / v0.2.0", html)

        self.assertEqual(project_metadata.drift(self.root), [])

    def test_fix_updates_readme_product_row_without_touching_other_axes_or_prose(self) -> None:
        project_metadata.fix(self.root)
        readme = (self.root / "README.md").read_text(encoding="utf-8")
        self.assertIn(
            "| Product (rules/hooks/skills/agents/CLI) | **1.0.0** | None |",
            readme,
        )
        # A different axis's row, and the narrative "what's new" heading
        # (tied to a specific past release's description), are a human
        # judgment call and must be left exactly as they were.
        self.assertIn("| Rust runtime (`yana-rt`) | **0.9.0** | crates.io |", readme)
        self.assertIn("### What's new in v0.9.0", readme)

    def test_fix_updates_commands_html_version_without_corrupting_embedded_json(self) -> None:
        changed = project_metadata.fix(self.root)
        self.assertIn("docs/commands.html", changed)

        html = (self.root / "docs/commands.html").read_text(encoding="utf-8")
        self.assertIn("— đối chiếu trực tiếp với source. v1.0.0 · 2026-01-01.</span>", html)
        # The free-text command description embedded in the JS data blob
        # contains "19 agents" -- a real regression risk (this repo's own
        # component count is a different number) that _replace_claims'
        # label-word regex would otherwise "fix" and corrupt.
        self.assertIn('"map of all 19 agents"', html)


if __name__ == "__main__":
    unittest.main()
