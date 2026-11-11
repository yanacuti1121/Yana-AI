"""Workflows that clone this repository and run its CLI must name a file that exists in bin/.

yana-audit.yml ran /tmp/yana-ai/bin/yana-ai, but bin/ only holds `yana` (package.json maps the
yana-ai command to ./bin/yana). The step failed with "No such file or directory" on every run, on
main and on every pull request, and the audit never executed.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))
CLONED_BIN = re.compile(r"/tmp/yana-ai/bin/([A-Za-z0-9_.-]+)")


class WorkflowCliBinaries(unittest.TestCase):
    def test_workflows_were_found(self) -> None:
        self.assertGreater(len(WORKFLOWS), 5)

    def test_every_cloned_bin_file_a_workflow_runs_exists(self) -> None:
        missing = []
        for workflow in WORKFLOWS:
            for number, line in enumerate(workflow.read_text(encoding="utf-8").splitlines(), 1):
                for match in CLONED_BIN.finditer(line):
                    if not (ROOT / "bin" / match.group(1)).is_file():
                        missing.append(f"{workflow.name}:{number} -> bin/{match.group(1)}")
        self.assertEqual(missing, [], "workflows run bin files that do not exist:\n" + "\n".join(missing))

    def test_the_audit_workflow_still_runs_a_cloned_cli(self) -> None:
        # If the workflow stops using the cloned CLI, the check above would pass for the wrong reason.
        text = (ROOT / ".github" / "workflows" / "yana-audit.yml").read_text(encoding="utf-8")
        self.assertRegex(text, CLONED_BIN)


if __name__ == "__main__":
    unittest.main()
