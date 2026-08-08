"""Regression coverage for local self-hosted candidate preparation."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/prepare-self-hosted-release-candidate.sh"


class SelfHostedCandidatePreparationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "local-mirror"
        self.source.mkdir()
        self._git(self.source, "init", "-q")
        self._git(self.source, "config", "user.email", "candidate-test@example.invalid")
        self._git(self.source, "config", "user.name", "Candidate Test")
        (self.source / "README.md").write_text("candidate\n", encoding="utf-8")
        self._git(self.source, "add", "README.md")
        self._git(self.source, "commit", "-qm", "candidate")
        self.revision = self._git(self.source, "rev-parse", "HEAD").stdout.strip()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def _git(directory: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ("git", "-C", str(directory), *arguments),
            text=True,
            capture_output=True,
            check=True,
        )

    def _run(self, checkout: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            (
                "bash",
                str(SCRIPT),
                "--source-repo",
                str(self.source),
                "--revision",
                self.revision,
                "--checkout",
                str(checkout),
                *arguments,
            ),
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_prepares_a_clean_detached_self_contained_checkout(self) -> None:
        checkout = self.root / "candidates/release"
        completed = self._run(checkout)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(self._git(checkout, "rev-parse", "HEAD").stdout.strip(), self.revision)
        detached = subprocess.run(
            ("git", "-C", str(checkout), "symbolic-ref", "-q", "HEAD"),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(detached.returncode, 0)
        self.assertEqual(self._git(checkout, "status", "--porcelain").stdout, "")
        self.assertFalse((checkout / ".git/objects/info/alternates").exists())

    def test_dry_run_does_not_create_the_checkout_parent(self) -> None:
        checkout = self.root / "not-created/release"
        completed = self._run(checkout, "--dry-run")

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertFalse(checkout.parent.exists())

    def test_rejects_existing_checkout_without_modifying_it(self) -> None:
        checkout = self.root / "existing"
        checkout.mkdir()
        marker = checkout / "keep.txt"
        marker.write_text("keep\n", encoding="utf-8")
        completed = self._run(checkout)

        self.assertEqual(completed.returncode, 2)
        self.assertIn("refusing to overwrite", completed.stderr)
        self.assertEqual(marker.read_text(encoding="utf-8"), "keep\n")

    def test_rejects_a_short_or_uppercase_revision(self) -> None:
        checkout = self.root / "candidate"
        for revision in (self.revision[:12], self.revision.upper()):
            completed = subprocess.run(
                (
                    "bash",
                    str(SCRIPT),
                    "--source-repo",
                    str(self.source),
                    "--revision",
                    revision,
                    "--checkout",
                    str(checkout),
                ),
                cwd=self.root,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 2)
            self.assertIn("full 40- or 64-character", completed.stderr)

    def test_rejects_a_non_directory_source(self) -> None:
        checkout = self.root / "candidate"
        source_file = self.root / "not-a-repo"
        source_file.write_text("not a repository\n", encoding="utf-8")
        completed = subprocess.run(
            (
                "bash",
                str(SCRIPT),
                "--source-repo",
                str(source_file),
                "--revision",
                self.revision,
                "--checkout",
                str(checkout),
            ),
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 2)
        self.assertIn("local directory", completed.stderr)


if __name__ == "__main__":
    unittest.main()
