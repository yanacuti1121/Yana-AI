"""Regression checks for the secretless Vault Agent release-signer templates."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ops/release-signer/vault-agent.hcl.example"
SERVICE = ROOT / "ops/release-signer/systemd/yana-release-signer-vault-agent.service"


class ReleaseSignerTemplateTests(unittest.TestCase):
    def test_agent_uses_a_dedicated_forced_unix_proxy(self) -> None:
        text = AGENT.read_text(encoding="utf-8")
        self.assertIn('method "approle"', text)
        self.assertIn('listener "unix"', text)
        self.assertIn('address = "/run/yana-release-signer/vault-proxy.sock"', text)
        self.assertIn('use_auto_auth_token = "force"', text)
        self.assertNotIn('type = "token_file"', text)
        self.assertNotIn('sink "file"', text)

    def test_service_protects_the_agent_runtime_directory(self) -> None:
        text = SERVICE.read_text(encoding="utf-8")
        for requirement in (
            "User=yana",
            "UMask=0077",
            "RuntimeDirectory=yana-release-signer",
            "NoNewPrivileges=true",
            "ProtectSystem=strict",
            "ReadWritePaths=/run/yana-release-signer",
        ):
            self.assertIn(requirement, text)


if __name__ == "__main__":
    unittest.main()
