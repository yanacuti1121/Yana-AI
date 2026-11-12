"""GitHub workflows must call scripts and actions that exist in this repository.

Workflows only run on GitHub, so a script that was moved or deleted shows up as a red run after
the fact. This reads every workflow and resolves the repository paths it uses, which also protects
the planned removal of the parts that moved to yana-web and Yana-studio: any workflow still
calling a removed script fails here before the removal is merged.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))
SCRIPT_CALL = re.compile(r"(?:^|\s)(?:bash|sh|python3|python|node)\s+(?!-)([A-Za-z0-9_./-]+\.(?:sh|py|js|mjs|cjs))\b")
LOCAL_ACTION = re.compile(r"^\s*-?\s*uses:\s*(\./\S+)")
TOP_LEVEL_PERMISSIONS = re.compile(r"^permissions:", re.MULTILINE)
JOB_PERMISSIONS = re.compile(r"^\s{4}permissions:", re.MULTILINE)


STEP_START = re.compile(r"^\s*-\s+(?:name|uses|run|id|if|env|with):")
WORKING_DIRECTORY = re.compile(r"^\s*working-directory:\s*(\S+)")


def run_lines(text: str) -> list[tuple[int, str, str]]:
    """Return (line number, text, working directory) for non-comment lines.

    The working directory is the step's own working-directory (empty when the step has none),
    because a path in run: is relative to it.
    """
    lines = []
    working_directory = ""
    for number, line in enumerate(text.splitlines(), 1):
        if STEP_START.match(line):
            working_directory = ""
        found = WORKING_DIRECTORY.match(line)
        if found:
            working_directory = found.group(1).strip("\"'")
        if line.strip().startswith("#"):
            continue
        lines.append((number, line, working_directory))
    return lines


class WorkflowIntegrity(unittest.TestCase):
    def test_workflows_were_found(self) -> None:
        self.assertGreater(len(WORKFLOWS), 5)

    def test_scripts_called_by_workflows_exist(self) -> None:
        missing = []
        for workflow in WORKFLOWS:
            for number, line, working_directory in run_lines(workflow.read_text(encoding="utf-8")):
                if "$" in line or "{{" in line or " cd " in line or line.strip().startswith("cd "):
                    continue  # variable paths and cd-relative paths cannot be resolved statically
                for match in SCRIPT_CALL.finditer(line):
                    path = match.group(1)
                    if path.startswith(("/", "~")):
                        continue
                    if not (ROOT / working_directory / path).is_file():
                        missing.append(f"{workflow.name}:{number} -> {working_directory}/{path}".replace("->/", "-> "))
        self.assertEqual(missing, [], "workflows call scripts that do not exist:\n" + "\n".join(missing))

    def test_working_directories_used_by_workflows_exist(self) -> None:
        missing = []
        for workflow in WORKFLOWS:
            for number, line, _ in run_lines(workflow.read_text(encoding="utf-8")):
                found = WORKING_DIRECTORY.match(line)
                if not found:
                    continue
                directory = found.group(1).strip("\"'")
                if "$" in directory or "{{" in directory:
                    continue
                if not (ROOT / directory).is_dir():
                    missing.append(f"{workflow.name}:{number} -> {directory}")
        self.assertEqual(missing, [], "workflows use working directories that do not exist:\n" + "\n".join(missing))

    def test_local_actions_exist(self) -> None:
        missing = []
        for workflow in WORKFLOWS:
            for number, line, _ in run_lines(workflow.read_text(encoding="utf-8")):
                match = LOCAL_ACTION.match(line)
                if not match:
                    continue
                action = ROOT / match.group(1)
                if not any((action / name).is_file() for name in ("action.yml", "action.yaml")):
                    missing.append(f"{workflow.name}:{number} -> {match.group(1)}")
        self.assertEqual(missing, [], "workflows use local actions that do not exist:\n" + "\n".join(missing))

    def test_every_workflow_limits_token_permissions(self) -> None:
        unrestricted = []
        for workflow in WORKFLOWS:
            text = workflow.read_text(encoding="utf-8")
            if not TOP_LEVEL_PERMISSIONS.search(text) and not JOB_PERMISSIONS.search(text):
                unrestricted.append(workflow.name)
        self.assertEqual(unrestricted, [], f"workflows with no permissions block: {unrestricted}")

    def test_workflow_names_are_unique(self) -> None:
        names = []
        for workflow in WORKFLOWS:
            match = re.search(r"^name:\s*(.+)$", workflow.read_text(encoding="utf-8"), re.MULTILINE)
            self.assertIsNotNone(match, f"{workflow.name} has no name:")
            names.append(match.group(1).strip().strip("\"'"))
        duplicates = sorted({n for n in names if names.count(n) > 1})
        self.assertEqual(duplicates, [], f"duplicate workflow names: {duplicates}")


if __name__ == "__main__":
    unittest.main()
