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
        (self.root / "docs/desktop.html").write_text("desktop v0.9.0\n", encoding="utf-8")
        (self.root / ".claude/docs").mkdir(parents=True, exist_ok=True)
        (self.root / ".claude/docs/index.html").write_text(
            "stale mirror, not the same content as docs/index.html\n", encoding="utf-8"
        )
        (self.root / ".claude/docs/desktop.html").write_text("desktop v0.9.0\n", encoding="utf-8")

        (self.root / "docs/reference").mkdir(parents=True, exist_ok=True)
        (self.root / "docs/reference/architecture.md").write_text(
            "```\n"
            'AGENTS["🤖 9 specialist agents\\n(planner...)"]\n'
            "```\n"
            "\n"
            "| 🧩 Skills | **9** workflow skill definitions |\n"
            "| 🤖 Agents | **9** specialist agents |\n"
            "| 🪝 Hooks | **9** pre/post-execution hooks |\n"
            "| 🦀 Rust subcommands | **9** (`scan`, `graph`...) |\n"
            "\n"
            "```\n"
            "├── agents/         # 9 specialist agent definitions\n"
            "│   ├── core-lock.json    # SHA-256 manifest — 9 core files pinned\n"
            "```\n",
            encoding="utf-8",
        )
        (self.root / "core/config").mkdir(parents=True, exist_ok=True)
        self._write_json(
            "core/config/core-lock.json",
            {"files": {"core/rules/one.md": "sha256:abc", "core/hooks/one.sh": "sha256:def"}},
        )
        (self.root / "src").mkdir(parents=True, exist_ok=True)
        (self.root / "src/main.rs").write_text(
            "enum Commands {\n"
            "    Doctor {\n"
            "        target: String,\n"
            "    },\n"
            "    Scan(ScanArgs),\n"
            "    Chat,\n"
            "}\n",
            encoding="utf-8",
        )
        for readme_relative in project_metadata.README_FILES:
            with (self.root / readme_relative).open("a", encoding="utf-8") as handle:
                handle.write(
                    "core-lock.json    # SHA-256 manifest — 9 core files pinned\n"
                    "9 subcommands. Zero Python dependency\n"
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

    def test_mirror_drift_detects_and_fixes_diverged_claude_docs(self) -> None:
        # docs/index.html and .claude/docs/index.html start deliberately
        # different in the fixture (see setUp) -- this is exactly how
        # .claude/docs/desktop.html was found frozen on an entire prior
        # visual redesign, undetected by every count/version check, since
        # none of them ever compared the two files to each other.
        problems = project_metadata.drift(self.root)
        self.assertTrue(
            any(".claude/docs/index.html" in problem and "mirror" in problem for problem in problems)
        )

        changed = project_metadata.fix(self.root)
        self.assertIn(".claude/docs/index.html", changed)
        source = (self.root / "docs/index.html").read_bytes()
        mirror = (self.root / ".claude/docs/index.html").read_bytes()
        self.assertEqual(source, mirror)
        self.assertEqual(project_metadata.mirror_drift(self.root), [])

    def test_mirror_drift_is_silent_when_already_identical(self) -> None:
        # docs/desktop.html and .claude/docs/desktop.html start identical in
        # the fixture (unlike the index.html pair, deliberately diverged
        # above) -- confirms the byte-diff check doesn't false-fire on a
        # genuinely synced pair, even while another pair is drifted.
        diverged = project_metadata.mirror_drift(self.root)
        self.assertNotIn(("docs/desktop.html", ".claude/docs/desktop.html"), diverged)
        self.assertIn(("docs/index.html", ".claude/docs/index.html"), diverged)

    def test_architecture_md_count_anchors_check_and_fix(self) -> None:
        # The fixture's architecture.md claims 9 for everything; the real
        # fixture filesystem has exactly 1 of each component (see setUp),
        # plus core_lock_files=2 and subcommands=3 (Doctor/Scan/Chat in the
        # fixture's src/main.rs). Folded in from the former
        # generate-stats.py, which had no --fix at all -- this is the exact
        # drift class that required a manual fix during today's session.
        problems = project_metadata.drift(self.root)
        self.assertTrue(
            any("docs/reference/architecture.md" in problem for problem in problems)
        )

        changed = project_metadata.fix(self.root)
        self.assertIn("docs/reference/architecture.md", changed)
        architecture = (self.root / "docs/reference/architecture.md").read_text(encoding="utf-8")
        self.assertIn("**1** workflow skill definitions", architecture)
        self.assertIn("**1** specialist agents", architecture)
        self.assertIn("**1** pre/post-execution hooks", architecture)
        self.assertIn("Rust subcommands", architecture)
        self.assertIn("🤖 1 specialist agents", architecture)
        self.assertIn("# 1 specialist agent definitions", architecture)

        self.assertEqual(project_metadata.drift(self.root), [])

    def test_count_anchor_with_zero_matches_fails_loud_not_silent(self) -> None:
        # The script this replaced (generate-stats.py) explicitly reported
        # "pattern not found (format changed?)" when its anchor text no
        # longer matched -- a silent no-op here would go dark exactly the
        # same way and report CLEAN while actually checking nothing.
        architecture_path = self.root / "docs/reference/architecture.md"
        rewritten = architecture_path.read_text(encoding="utf-8").replace(
            "specialist agents", "totally different wording"
        )
        architecture_path.write_text(rewritten, encoding="utf-8")
        with self.assertRaises(project_metadata.MetadataError):
            project_metadata.drift(self.root)

    def test_core_lock_files_and_subcommands_counted_and_fixed_in_readme(self) -> None:
        self.assertEqual(project_metadata.core_lock_files_count(self.root), 2)
        self.assertEqual(project_metadata.subcommands_count(self.root), 3)

        project_metadata.fix(self.root)
        readme = (self.root / "README.md").read_text(encoding="utf-8")
        self.assertIn("core-lock.json    # SHA-256 manifest — 2 core files pinned", readme)
        self.assertIn("3 subcommands. Zero Python dependency", readme)


if __name__ == "__main__":
    unittest.main()
