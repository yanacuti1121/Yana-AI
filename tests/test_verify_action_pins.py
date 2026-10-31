"""verify_action_pins.py: parsing, tag mapping, verdicts and exit codes, without any network."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "core" / "scripts"))
import verify_action_pins as pins  # noqa: E402

SHA_A = "3d3c42e5aac5ba805825da76410c181273ba90b1"
SHA_B = "5fda3b95a4ea91299a34e894583c3862153e4b97"


class ParsePinsTests(unittest.TestCase):
    def test_reads_repo_sha_and_claimed_version(self) -> None:
        text = f"      - uses: actions/checkout@{SHA_A} # v7.0.1 (node24)\n"
        self.assertEqual(pins.parse_pins(text), [("actions/checkout", SHA_A, "v7.0.1")])

    def test_sub_path_actions_keep_the_repository_only(self) -> None:
        text = f"uses: github/codeql-action/upload-sarif@{SHA_B} # v4.39.0\n"
        self.assertEqual(pins.parse_pins(text), [("github/codeql-action", SHA_B, "v4.39.0")])

    def test_comment_without_a_version_gives_an_empty_claim(self) -> None:
        text = f"uses: dtolnay/rust-toolchain@{SHA_A} # stable branch, resolved 2026\n"
        self.assertEqual(pins.parse_pins(text), [("dtolnay/rust-toolchain", SHA_A, "")])

    def test_ignores_tag_pins_local_actions_and_empty_input(self) -> None:
        self.assertEqual(pins.parse_pins("uses: actions/checkout@v4\nuses: ./local-action\n"), [])
        self.assertEqual(pins.parse_pins(""), [])

    def test_hostile_repository_names_are_not_parsed(self) -> None:
        for name in ("evil/repo;rm -rf /", "-x/y", "../y", "./..", "a b/c", "https://evil.com/a"):
            self.assertEqual(pins.parse_pins(f"uses: {name}@{SHA_A} # v1\n"), [], name)

    def test_commented_out_and_embedded_lines_are_skipped(self) -> None:
        text = (
            f"      # uses: actions/checkout@{SHA_A} # v7.0.1\n"
            f"      run: echo uses: actions/checkout@{SHA_A}\n"
            f"uses:\n  actions/checkout@{SHA_A}\n"
        )
        self.assertEqual(pins.parse_pins(text), [])

    def test_claim_is_the_version_right_after_the_hash(self) -> None:
        text = f"uses: a/b@{SHA_A} # bumped from v1.0.0 to v9.9.9\n"
        self.assertEqual(pins.parse_pins(text), [("a/b", SHA_A, "")])
        text = f"uses: a/b@{SHA_A} # v9.9.9 (was v1.0.0)\n"
        self.assertEqual(pins.parse_pins(text), [("a/b", SHA_A, "v9.9.9")])

    def test_prerelease_suffix_is_not_read_as_a_release(self) -> None:
        self.assertEqual(pins.parse_pins(f"uses: a/b@{SHA_A} # v1.0.0-rc1\n"), [("a/b", SHA_A, "")])

    def test_uppercase_sha_is_skipped(self) -> None:
        self.assertEqual(pins.parse_pins(f"uses: a/b@{SHA_A.upper()} # v1\n"), [])


class TagMapTests(unittest.TestCase):
    def test_annotated_tag_uses_the_peeled_commit(self) -> None:
        out = f"1111\trefs/tags/v1.0.0\n{SHA_A}\trefs/tags/v1.0.0^{{}}\n"
        self.assertEqual(pins.tags_by_sha(out), {SHA_A: {"v1.0.0"}})

    def test_two_tags_can_share_a_commit(self) -> None:
        out = f"{SHA_A}\trefs/tags/v7\n{SHA_A}\trefs/tags/v7.0.1\n"
        self.assertEqual(pins.tags_by_sha(out), {SHA_A: {"v7", "v7.0.1"}})

    def test_non_tag_refs_and_blank_input_are_ignored(self) -> None:
        self.assertEqual(pins.tags_by_sha(f"{SHA_A}\trefs/heads/main\n"), {})
        self.assertEqual(pins.tags_by_sha(""), {})


class JudgeTests(unittest.TestCase):
    def test_verdicts(self) -> None:
        self.assertEqual(pins.judge("v7.0.1", {"v7", "v7.0.1"}), "OK")
        self.assertEqual(pins.judge("v7", {"v7", "v7.0.1"}), "WEAK")
        self.assertEqual(pins.judge("v6.0.3", {"v7", "v7.0.1"}), "MISMATCH")
        self.assertEqual(pins.judge("v6.0.3", set()), "NO-TAG")
        self.assertEqual(pins.judge("", set()), "UNCHECKED")
        self.assertEqual(pins.judge("", {"v1"}), "UNCHECKED")


class CheckAllTests(unittest.TestCase):
    def test_unreachable_repository_is_tried_once_and_reported(self) -> None:
        calls = []

        def fetch(repo: str):
            calls.append(repo)
            raise pins.RepoUnreachable(f"{repo}: down")

        grouped = {("a/b", SHA_A): {"v1"}, ("a/b", SHA_B): {"v2"}}
        rows, unreachable = pins.check_all(grouped, fetch)
        self.assertEqual(rows, [])
        self.assertEqual(calls, ["a/b"])
        self.assertEqual(unreachable, ["a/b: down"])

    def test_rows_carry_the_verdict(self) -> None:
        rows, unreachable = pins.check_all({("a/b", SHA_A): {"v1.0.0"}}, lambda repo: {SHA_A: {"v1.0.0"}})
        self.assertEqual([row[0] for row in rows], ["OK"])
        self.assertEqual(unreachable, [])


class ExitCodeTests(unittest.TestCase):
    def test_problem_wins_over_unreachable(self) -> None:
        rows = [("MISMATCH", "a/b", SHA_A, "v1", set())]
        self.assertEqual(pins.exit_code(rows, ["c/d: down"], strict=False), 1)

    def test_unreachable_alone_is_two_and_clean_is_zero(self) -> None:
        ok = [("OK", "a/b", SHA_A, "v1.0.0", {"v1.0.0"})]
        self.assertEqual(pins.exit_code(ok, ["c/d: down"], strict=False), 2)
        self.assertEqual(pins.exit_code(ok, [], strict=False), 0)

    def test_unchecked_passes_by_default_and_fails_under_strict(self) -> None:
        rows = [("UNCHECKED", "a/b", SHA_A, "", set())]
        self.assertEqual(pins.exit_code(rows, [], strict=False), 0)
        self.assertEqual(pins.exit_code(rows, [], strict=True), 1)


class MainTests(unittest.TestCase):
    def test_missing_directory_is_a_usage_error(self) -> None:
        self.assertEqual(pins.main(["verify_action_pins.py", "/nonexistent-dir-for-test"]), 2)

    def test_no_pins_is_not_reported_as_success(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(pins.main(["verify_action_pins.py", tmp]), 1)

    def test_collect_pins_groups_claims_across_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.yml").write_text(f"uses: actions/checkout@{SHA_A} # v7.0.1\n", encoding="utf-8")
            (root / "b.yaml").write_text(f"uses: actions/checkout@{SHA_A} # v6.0.3\n", encoding="utf-8")
            (root / "notes.txt").write_text(f"uses: x/y@{SHA_B} # v1\n", encoding="utf-8")
            grouped = pins.collect_pins(root)
        self.assertEqual(grouped, {("actions/checkout", SHA_A): {"v7.0.1", "v6.0.3"}})


if __name__ == "__main__":
    unittest.main()
