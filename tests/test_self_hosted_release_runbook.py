"""Keep the self-hosted release runbook aligned with checked-in commands."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNBOOK = ROOT / "docs/operations/self-hosted-release-runbook.md"


class SelfHostedReleaseRunbookTests(unittest.TestCase):
    def test_runbook_covers_the_fail_closed_release_flow(self) -> None:
        text = RUNBOOK.read_text(encoding="utf-8")
        for command in (
            "prepare-self-hosted-release-candidate.sh",
            "check-self-hosted-runner.py",
            "run-self-hosted-release-gate.sh",
            "bundle-release-evidence.py",
            "verify-release-evidence.py",
            "check-release-signer.py",
            "attest-release-evidence.py sign",
            "attest-release-evidence.py verify",
        ):
            self.assertIn(command, text)
        self.assertIn("does not publish, deploy", text)
        self.assertIn("human-approved", text)

    def test_runbook_does_not_pass_raw_vault_tokens(self) -> None:
        text = RUNBOOK.read_text(encoding="utf-8")
        self.assertNotIn("VAULT_TOKEN=", text)
        self.assertNotIn("--vault-token", text)
        self.assertIn("response-wrapped", text)


if __name__ == "__main__":
    unittest.main()
