"""Regression coverage for the immutable self-hosted release runner wrapper."""

from __future__ import annotations

import json
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNNER = REPO_ROOT / "core/scripts/run-self-hosted-release-gate.sh"
SYSTEMD_TEMPLATE = REPO_ROOT / "ops/release-gate/systemd/yana-release-gate.service"
LAUNCHD_TEMPLATE = REPO_ROOT / "ops/release-gate/launchd/com.yana.release-gate.plist"


class SelfHostedReleaseRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.checkout = self.root / "candidate checkout"
        self.artifacts = self.root / "release artifacts"
        self.checkout.mkdir()
        self.artifacts.mkdir()
        gate = self.checkout / "core/scripts/release-gate.py"
        gate.parent.mkdir(parents=True)
        gate.write_text(
            """import json
import sys
from pathlib import Path

output = Path(sys.argv[sys.argv.index('--output') + 1])
output.mkdir()
(output / 'invocation.json').write_text(json.dumps(sys.argv), encoding='utf-8')
""",
            encoding="utf-8",
        )
        self._git("init", "-q")
        self._git("config", "user.email", "runner-test@example.invalid")
        self._git("config", "user.name", "Runner Test")
        self._git("add", ".")
        self._git("commit", "-qm", "candidate")
        self.branch = self._git("branch", "--show-current").stdout.strip()
        self._git("checkout", "--detach", "-q")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _git(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ("git", "-C", str(self.checkout), *arguments),
            check=True,
            text=True,
            capture_output=True,
        )

    def _run(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        environment = os.environ | {"YANA_RELEASE_PYTHON": sys.executable}
        return subprocess.run(
            (
                "bash",
                str(RUNNER),
                "--checkout",
                str(self.checkout),
                "--artifact-root",
                str(self.artifacts),
                *arguments,
            ),
            text=True,
            capture_output=True,
            env=environment,
            cwd=self.root,
        )

    def test_dry_run_preserves_arguments_and_creates_no_output(self) -> None:
        result = self._run("--dry-run")

        self.assertEqual(result.returncode, 0, result.stderr)
        revision = self._git("rev-parse", "HEAD").stdout.strip()
        self.assertIn(f"candidate revision: {revision}", result.stdout)
        self.assertIn("release-gate.py --output", result.stdout)
        self.assertEqual(list(self.artifacts.iterdir()), [])

    def test_invokes_gate_for_a_unique_output_directory(self) -> None:
        result = self._run()

        self.assertEqual(result.returncode, 0, result.stderr)
        invocations = list(self.artifacts.glob("*/*/invocation.json"))
        self.assertEqual(len(invocations), 1)
        invocation = json.loads(invocations[0].read_text(encoding="utf-8"))
        self.assertEqual(invocation[-2], "--output")
        self.assertEqual(Path(invocation[-1]).resolve(), invocations[0].parent.resolve())

    def test_rejects_a_branch_checkout(self) -> None:
        self._git("switch", "-q", self.branch)

        result = self._run("--dry-run")

        self.assertEqual(result.returncode, 2)
        self.assertIn("detached HEAD", result.stderr)

    def test_rejects_a_dirty_checkout(self) -> None:
        (self.checkout / "local.txt").write_text("local\n", encoding="utf-8")

        result = self._run("--dry-run")

        self.assertEqual(result.returncode, 2)
        self.assertIn("checkout must be clean", result.stderr)

    def test_rejects_an_artifact_root_inside_the_checkout(self) -> None:
        nested_artifacts = self.checkout / "artifacts"
        nested_artifacts.mkdir()
        (nested_artifacts / ".gitkeep").write_text("\n", encoding="utf-8")
        self._git("add", "artifacts/.gitkeep")
        self._git("commit", "-qm", "tracked artifact directory")

        environment = os.environ | {"YANA_RELEASE_PYTHON": sys.executable}
        result = subprocess.run(
            (
                "bash",
                str(RUNNER),
                "--checkout",
                str(self.checkout),
                "--artifact-root",
                str(nested_artifacts),
                "--dry-run",
            ),
            text=True,
            capture_output=True,
            env=environment,
        )

        self.assertEqual(result.returncode, 2)
        self.assertIn("must not be inside", result.stderr)

    def test_platform_templates_invoke_the_immutable_runner(self) -> None:
        systemd = SYSTEMD_TEMPLATE.read_text(encoding="utf-8")
        self.assertIn("Type=oneshot", systemd)
        self.assertIn("NoNewPrivileges=true", systemd)
        self.assertIn("run-self-hosted-release-gate.sh", systemd)
        self.assertIn("--checkout /srv/yana-ai-candidate", systemd)

        with LAUNCHD_TEMPLATE.open("rb") as source:
            launchd = plistlib.load(source)
        arguments = launchd["ProgramArguments"]
        self.assertIn("run-self-hosted-release-gate.sh", arguments[1])
        self.assertEqual(arguments[2:], ["--checkout", "/srv/yana-ai-candidate", "--artifact-root", "/var/db/yana-ai/release-gate"])


if __name__ == "__main__":
    unittest.main()
