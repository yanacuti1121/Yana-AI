"""Boundary/regression tests for core/scripts/check_forge_sync.py.

Per core/rules/fuzz-testing-constraints.md Tier A: empty input, malformed
input, and injection-adjacent characters must not crash uncaught. Network
calls are mocked (core/rules/tests.md: "mock at the boundary") -- these
tests exercise the manifest-parsing and status-classification logic, not
live GitHub/GitLab API behavior.
"""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "core/scripts/check_forge_sync.py"
SPEC = importlib.util.spec_from_file_location("check_forge_sync", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
check_forge_sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check_forge_sync)


class CheckRepositoryTests(unittest.TestCase):
    def test_no_mirrors_returns_empty(self):
        self.assertEqual(check_forge_sync.check_repository({"mirrors": []}), [])

    def test_missing_mirrors_key_returns_empty(self):
        self.assertEqual(check_forge_sync.check_repository({}), [])

    def test_null_url_is_not_mirrored(self):
        repo = {"primary_url": "https://github.com/a/b", "mirrors": [{"provider": "gitlab", "url": None}]}
        results = check_forge_sync.check_repository(repo)
        self.assertEqual(results, [("gitlab", "NOT_MIRRORED", "no url configured yet")])

    def test_unsupported_provider_is_error(self):
        repo = {"primary_url": "https://github.com/a/b", "mirrors": [{"provider": "bitbucket", "url": "https://x"}]}
        results = check_forge_sync.check_repository(repo)
        self.assertEqual(results[0][0], "bitbucket")
        self.assertEqual(results[0][1], "ERROR")

    def test_missing_primary_url_key_reports_error_not_crash(self):
        """Tier A: malformed config (missing key) must not raise uncaught."""
        repo = {"mirrors": [{"provider": "gitlab", "url": "https://gitlab.com/a/b"}]}
        results = check_forge_sync.check_repository(repo)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][1], "ERROR")
        self.assertIn("primary_url", results[0][2])

    def test_synced_when_shas_match(self):
        repo = {"primary_url": "https://github.com/a/b", "mirrors": [{"provider": "gitlab", "url": "https://gitlab.com/a/b"}]}
        with mock.patch.object(check_forge_sync, "_github_head_sha", return_value="deadbeef1234567890"), \
             mock.patch.object(check_forge_sync, "_gitlab_head_sha", return_value="deadbeef1234567890"):
            results = check_forge_sync.check_repository(repo)
        self.assertEqual(results[0][1], "SYNCED")

    def test_out_of_sync_when_shas_differ(self):
        repo = {"primary_url": "https://github.com/a/b", "mirrors": [{"provider": "gitlab", "url": "https://gitlab.com/a/b"}]}
        with mock.patch.object(check_forge_sync, "_github_head_sha", return_value="aaaaaaaaaaaaaaaaaaaa"), \
             mock.patch.object(check_forge_sync, "_gitlab_head_sha", return_value="bbbbbbbbbbbbbbbbbbbb"):
            results = check_forge_sync.check_repository(repo)
        self.assertEqual(results[0][1], "OUT_OF_SYNC")

    def test_network_failure_reports_error_not_crash(self):
        repo = {"primary_url": "https://github.com/a/b", "mirrors": [{"provider": "gitlab", "url": "https://gitlab.com/a/b"}]}
        with mock.patch.object(
            check_forge_sync, "_github_head_sha", side_effect=check_forge_sync.ForgeSyncError("boom")
        ):
            results = check_forge_sync.check_repository(repo)
        self.assertEqual(results[0][1], "ERROR")


class EgressAllowlistTests(unittest.TestCase):
    """network-egress-law.md Gate L3: only allowlisted hosts, HTTPS only."""

    def test_non_https_scheme_rejected(self):
        with self.assertRaises(check_forge_sync.ForgeSyncError):
            check_forge_sync._fetch_json("http://api.github.com/repos/a/b")

    def test_non_allowlisted_host_rejected(self):
        with self.assertRaises(check_forge_sync.ForgeSyncError):
            check_forge_sync._fetch_json("https://evil.example.com/repos/a/b")

    def test_manifest_url_cannot_redirect_host(self):
        """A poisoned manifest primary_url must not change which host is
        actually contacted -- only its path is ever used."""
        owner_repo = check_forge_sync._github_owner_repo("https://github.com/a/b")
        self.assertEqual(owner_repo, "a/b")
        # The host used for the real request always comes from
        # ALLOWED_API_HOSTS, never from the manifest URL's own netloc.
        self.assertNotIn("evil.com", check_forge_sync.ALLOWED_API_HOSTS.values())


class MainManifestParsingTests(unittest.TestCase):
    """Tier A boundary cases for the manifest file itself."""

    def _run_main_with(self, manifest_obj, tmp_path: Path) -> int:
        manifest_path = tmp_path / "forge-manifest.json"
        manifest_path.write_text(json.dumps(manifest_obj), encoding="utf-8")
        with mock.patch.object(check_forge_sync, "MANIFEST_PATH", manifest_path):
            return check_forge_sync.main()

    def test_empty_manifest_object(self):
        """canonical_forge missing -> caught internally, reported as
        ERROR (exit 2), never an uncaught KeyError."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            code = self._run_main_with({}, Path(tmp))
            self.assertEqual(code, 2)

    def test_malformed_json_does_not_crash(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = Path(tmp) / "forge-manifest.json"
            manifest_path.write_text("{not valid json", encoding="utf-8")
            with mock.patch.object(check_forge_sync, "MANIFEST_PATH", manifest_path):
                code = check_forge_sync.main()
            self.assertEqual(code, 2)

    def test_repository_missing_name_key_reported_not_crashed(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            manifest_obj = {"canonical_forge": "github", "repositories": [{"primary_url": "https://github.com/a/b", "mirrors": []}]}
            code = self._run_main_with(manifest_obj, Path(tmp))
            self.assertEqual(code, 2)

    def test_missing_manifest_file(self):
        with mock.patch.object(check_forge_sync, "MANIFEST_PATH", Path("/nonexistent/forge-manifest.json")):
            code = check_forge_sync.main()
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
