import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "core/scripts/audit_hook_execution_paths.py"
ROOT = SCRIPT.parents[2]
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

    def test_production_security_hooks_are_runtime_reachable(self):
        results = {item.name: item for item in MODULE.audit(ROOT)}
        expected_surfaces = {
            "guard-blast-radius.sh": {"claude-project", "codex", "claude-plugin"},
            "tool-validator.sh": {"claude-project", "codex", "claude-plugin"},
            "log-agent.sh": {"claude-project", "codex", "claude-plugin"},
        }
        for hook, surfaces in expected_surfaces.items():
            self.assertEqual(results[hook].execution_status, "WIRED")
            self.assertEqual(set(results[hook].surfaces), surfaces)

    @unittest.skipUnless(shutil.which("jq"), "jq is required by log-agent.sh")
    def test_log_agent_accepts_claude_and_codex_payload_shapes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir)
            (project / ".claude").mkdir()
            hook = ROOT / "core/hooks/log-agent.sh"
            environment = {**os.environ, "CLAUDE_PROJECT_DIR": str(project)}
            payloads = (
                {"tool_input": {"subagent_type": "architect-reviewer"}, "session_id": "claude-1"},
                {"agent_name": "code-auditor", "session_id": "codex-1"},
            )
            for payload in payloads:
                completed = subprocess.run(
                    ["bash", str(hook)],
                    input=json.dumps(payload),
                    text=True,
                    capture_output=True,
                    env=environment,
                    check=False,
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
            log_path = project / ".claude/state/agent-log.txt"
            log = log_path.read_text(encoding="utf-8")
            self.assertIn("agent=architect-reviewer  session=claude-1", log)
            self.assertIn("agent=code-auditor  session=codex-1", log)
            self.assertFalse((project / ".claude/agent-log.txt").exists())


if __name__ == "__main__":
    unittest.main()
