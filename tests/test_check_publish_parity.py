"""Regression tests for the pure (non-network) parts of check_publish_parity.py."""

from __future__ import annotations

import importlib.util
import subprocess
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "core/scripts/check_publish_parity.py"
SPEC = importlib.util.spec_from_file_location("check_publish_parity", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
check_publish_parity = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check_publish_parity)


class LatestTagTests(unittest.TestCase):
    def _run_with_tags(self, tags: list[str]) -> str | None:
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout="\n".join(tags) + "\n")
        with mock.patch("subprocess.run", return_value=completed):
            return check_publish_parity._latest_tag("py-v")

    def test_picks_highest_semver_not_lexicographic_max(self) -> None:
        # Lexicographic max would wrongly pick "py-v0.9.9" over "py-v0.10.0".
        self.assertEqual(
            self._run_with_tags(["py-v0.9.9", "py-v0.10.0", "py-v0.2.0"]),
            "py-v0.10.0",
        )

    def test_ignores_malformed_tags(self) -> None:
        self.assertEqual(
            self._run_with_tags(["py-v0.1.0", "py-v-not-semver", "py-vrelease"]),
            "py-v0.1.0",
        )

    def test_returns_none_when_no_matching_tag_exists(self) -> None:
        self.assertIsNone(self._run_with_tags([]))

    def test_does_not_match_a_different_prefix(self) -> None:
        # rt-v* tags must never be picked up when asking for py-v*.
        self.assertEqual(self._run_with_tags(["rt-v1.4.0"]), None)


class CheckTests(unittest.TestCase):
    def test_clean_when_no_tags_of_either_axis_exist_yet(self) -> None:
        with mock.patch.object(check_publish_parity, "_latest_tag", return_value=None):
            self.assertEqual(check_publish_parity.check(), [])

    def test_reports_mismatch_between_tag_and_published_version(self) -> None:
        def fake_latest_tag(prefix: str) -> str | None:
            return "py-v1.2.3" if prefix == "py-v" else None

        with (
            mock.patch.object(check_publish_parity, "_latest_tag", side_effect=fake_latest_tag),
            mock.patch.object(check_publish_parity, "pypi_latest_version", return_value="1.2.2"),
        ):
            problems = check_publish_parity.check()
        self.assertEqual(len(problems), 1)
        self.assertIn("1.2.2", problems[0])
        self.assertIn("py-v1.2.3", problems[0])

    def test_registry_fetch_failure_is_reported_not_raised(self) -> None:
        def fake_latest_tag(prefix: str) -> str | None:
            return "py-v1.2.3" if prefix == "py-v" else None

        def raise_error() -> str:
            raise check_publish_parity.PublishParityError("network unreachable")

        with (
            mock.patch.object(check_publish_parity, "_latest_tag", side_effect=fake_latest_tag),
            mock.patch.object(check_publish_parity, "pypi_latest_version", side_effect=raise_error),
        ):
            problems = check_publish_parity.check()
        self.assertEqual(len(problems), 1)
        self.assertIn("network unreachable", problems[0])


if __name__ == "__main__":
    unittest.main()
