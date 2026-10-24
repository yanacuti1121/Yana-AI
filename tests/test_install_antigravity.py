"""Tests for core/scripts/install_antigravity.py."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "core" / "scripts"))

import install_antigravity as ia  # noqa: E402


def hooks_of(target: Path) -> dict:
    return json.loads((target / ".agents" / "hooks.json").read_text(encoding="utf-8"))


class InstallAntigravityTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.target = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_external_project_gets_copies_and_relative_hook(self) -> None:
        ia.install_antigravity(self.target)
        agents = self.target / ".agents"
        self.assertTrue((agents / "rules" / "yana-ai.md").is_file())
        self.assertTrue((agents / "hooks" / "yana-pre-tool-use.js").is_file())
        self.assertTrue((agents / "hooks" / "guard-destructive.sh").is_file())
        command = hooks_of(self.target)[ia.HOOK_NAME]["PreToolUse"][0]["hooks"][0]["command"]
        self.assertEqual(command, "node hooks/yana-pre-tool-use.js")

    def test_yana_checkout_points_at_core_without_copies(self) -> None:
        for rel in (ia.ADAPTER_REL, ia.GUARD_REL):
            (self.target / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.target / rel).write_text("x", encoding="utf-8")
        ia.install_antigravity(self.target)
        self.assertFalse((self.target / ".agents" / "hooks").exists())
        command = hooks_of(self.target)[ia.HOOK_NAME]["PreToolUse"][0]["hooks"][0]["command"]
        self.assertEqual(command, "node ../core/adapters/antigravity/pre-tool-use.js")

    def test_existing_user_hooks_are_kept(self) -> None:
        hooks = self.target / ".agents" / "hooks.json"
        hooks.parent.mkdir(parents=True)
        hooks.write_text(json.dumps({"my-linter": {"PostToolUse": []}}), encoding="utf-8")
        ia.install_antigravity(self.target)
        config = hooks_of(self.target)
        self.assertIn("my-linter", config)
        self.assertIn(ia.HOOK_NAME, config)

    def test_rerun_is_idempotent(self) -> None:
        ia.install_antigravity(self.target)
        first = hooks_of(self.target)
        ia.install_antigravity(self.target)
        self.assertEqual(first, hooks_of(self.target))

    def test_non_object_hooks_file_is_refused(self) -> None:
        hooks = self.target / ".agents" / "hooks.json"
        hooks.parent.mkdir(parents=True)
        hooks.write_text("[1, 2]", encoding="utf-8")
        with self.assertRaises(ValueError):
            ia.install_antigravity(self.target)
        self.assertEqual(hooks.read_text(encoding="utf-8"), "[1, 2]")
        self.assertFalse((self.target / ".agents" / "rules").exists(), "nothing written before validation")
        self.assertFalse((self.target / ".agents" / "hooks").exists(), "nothing written before validation")

    def test_previous_hooks_file_is_backed_up(self) -> None:
        hooks = self.target / ".agents" / "hooks.json"
        hooks.parent.mkdir(parents=True)
        hooks.write_text('{"mine": {}}', encoding="utf-8")
        ia.install_antigravity(self.target)
        self.assertEqual((hooks.parent / "hooks.json.bak").read_text(encoding="utf-8"), '{"mine": {}}')
        self.assertFalse((hooks.parent / "hooks.json.tmp").exists())

    def test_symlinked_agents_dir_is_refused(self) -> None:
        real = self.target / "elsewhere"
        real.mkdir()
        (self.target / ".agents").symlink_to(real)
        with self.assertRaises(ValueError):
            ia.install_antigravity(self.target)
        self.assertEqual(list(real.iterdir()), [])

    def test_malformed_hooks_file_is_refused(self) -> None:
        hooks = self.target / ".agents" / "hooks.json"
        hooks.parent.mkdir(parents=True)
        hooks.write_text("{not json", encoding="utf-8")
        with self.assertRaises(json.JSONDecodeError):
            ia.install_antigravity(self.target)
        self.assertEqual(hooks.read_text(encoding="utf-8"), "{not json")

    def test_dry_run_writes_nothing(self) -> None:
        actions = ia.install_antigravity(self.target, dry_run=True)
        self.assertTrue(actions)
        self.assertFalse((self.target / ".agents").exists())

    def test_legacy_rule_is_moved_aside(self) -> None:
        legacy = self.target / ia.LEGACY_RULE
        legacy.parent.mkdir(parents=True)
        legacy.write_text("old rule", encoding="utf-8")
        ia.install_antigravity(self.target)
        self.assertFalse(legacy.exists())
        backups = list(legacy.parent.glob("yana-ai.md.bak.*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "old rule")


if __name__ == "__main__":
    unittest.main()
