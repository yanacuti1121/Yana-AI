import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "core/scripts/audit_hook_execution_paths.py"
SPEC = importlib.util.spec_from_file_location("hook_execution_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class HookExecutionPathTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        (root / "core/hooks").mkdir(parents=True)
        (root / "core/config").mkdir(parents=True)
        (root / ".claude").mkdir()
        (root / ".codex").mkdir()
        (root / ".cursor").mkdir()
        (root / ".claude-plugin/hooks").mkdir(parents=True)
        for path in MODULE.MANIFESTS.values():
            (root / path).write_text("{}", encoding="utf-8")
        return temporary, root

    def test_wired_indirect_and_dead_are_distinct(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "core/hooks/wired.sh").write_text("exec bash indirect.sh\n", encoding="utf-8")
        (root / "core/hooks/indirect.sh").write_text("exit 0\n", encoding="utf-8")
        (root / "core/hooks/dead.sh").write_text("exit 0\n", encoding="utf-8")
        (root / ".claude/settings.json").write_text(
            json.dumps({"hooks": [{"command": "bash .claude/hooks/wired.sh"}]}),
            encoding="utf-8",
        )
        (root / "core/config/hook-execution-dispositions.json").write_text(
            json.dumps({"hooks": {"dead.sh": {"disposition": "REFERENCE_ONLY", "reason": "fixture"}}}),
            encoding="utf-8",
        )
        results = {item.name: item for item in MODULE.audit(root)}
        self.assertEqual(results["wired.sh"].execution_status, "WIRED")
        self.assertEqual(results["indirect.sh"].execution_status, "INDIRECT")
        self.assertEqual(results["dead.sh"].execution_status, "DEAD")
        self.assertEqual(MODULE.validate(list(results.values()), root), [])

    def test_check_rejects_unclassified_dead_hook(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "core/hooks/dead.sh").write_text("exit 0\n", encoding="utf-8")
        (root / "core/config/hook-execution-dispositions.json").write_text(
            json.dumps({"hooks": {}}), encoding="utf-8"
        )
        results = MODULE.audit(root)
        self.assertIn("dead.sh: missing or invalid DEAD disposition", MODULE.validate(results, root))

    def test_check_rejects_wrong_hook_interpreter(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        (root / "core/hooks/example.js").write_text("process.exit(0)\n", encoding="utf-8")
        (root / ".claude-plugin/hooks/hooks.json").write_text(
            json.dumps({"hooks": [{"command": "bash hooks/example.js"}]}),
            encoding="utf-8",
        )
        (root / "core/config/hook-execution-dispositions.json").write_text(
            json.dumps({"hooks": {}}), encoding="utf-8"
        )
        errors = MODULE.validate(MODULE.audit(root), root)
        self.assertTrue(any("JavaScript hook registered with bash" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
