"""Regression tests for Giám thị tier 2 (root OS lock), see ADR-016.

The rendered root script is executed for real here, as the normal user: the
schg calls then fail silently (only root may set them), but every other code
path (lock detection, marker, log, unlock cleanup, repo checks) runs for real.
The privileged behavior itself is verified manually against the Codex app,
as ADR-016's verification plan describes.
"""

from __future__ import annotations

import importlib.util
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/giamthi_oslock.py"
SPEC = importlib.util.spec_from_file_location("giamthi_oslock", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
oslock = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = oslock
SPEC.loader.exec_module(oslock)


def run_bash(script: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["/bin/bash", "-c", script, "oslock", *args],
                          capture_output=True, text=True, check=False)


class RenderTests(unittest.TestCase):
    def test_script_is_valid_bash_and_never_runs_git(self) -> None:
        script = oslock.render_script(Path("/tmp/repo"), 501, Path("/tmp/state"), ("Codex",))
        check = subprocess.run(["/bin/bash", "-n"], input=script, text=True, capture_output=True)
        self.assertEqual(check.returncode, 0, check.stderr)
        self.assertNotRegex(script, r"\bgit\b")
        self.assertIn("find -P . -xdev", script)
        self.assertIn('chflags -h "$flag"', script)

    def test_hostile_repo_path_is_a_literal(self) -> None:
        hostile = "/tmp/a b/$(touch pwned)/`id`/it's"
        script = oslock.render_script(Path(hostile), 501, Path("/tmp/s"), ("x;rm",))
        line = next(l for l in script.splitlines() if l.startswith("REPO="))
        result = run_bash(line + '\nprintf %s "$REPO"')
        self.assertEqual(result.stdout, hostile)
        freeze = next(l for l in script.splitlines() if l.startswith("FREEZE="))
        result = run_bash(freeze + '\nprintf %s "${FREEZE[0]}"')
        self.assertEqual(result.stdout, "x;rm")

    def test_plist_watches_the_shared_halt_lock(self) -> None:
        paths = oslock.oslock_paths("abcd1234")
        payload = plistlib.loads(oslock.render_plist(paths, Path("/tmp/Yana AI")))
        self.assertEqual(payload["WatchPaths"], ["/tmp/Yana AI/.claude/state/GIAMTHI_HALT.lock"])
        self.assertEqual(payload["ProgramArguments"][-1], "lock")
        self.assertEqual(payload["Label"], "com.yanaai.giamthi-oslock.abcd1234")


class ScriptRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name).resolve()
        self.repo = base / "repo"
        self.state = base / "state"
        (self.repo / ".claude/state").mkdir(parents=True)
        (self.repo / "file.txt").write_text("x")
        self.lock = self.repo / ".claude/state/GIAMTHI_HALT.lock"
        self.script = base / "oslock.sh"
        self.script.write_text(oslock.render_script(self.repo, os.getuid(), self.state, ()))

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def run_script(self, action: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["/bin/bash", str(self.script), action],
                              capture_output=True, text=True, check=False)

    def test_no_lock_is_a_no_op(self) -> None:
        self.assertEqual(self.run_script("lock").returncode, 0)
        self.assertFalse((self.state / "locked").exists())

    def test_lock_then_unlock_round_trip(self) -> None:
        self.lock.write_text("halt")
        self.assertEqual(self.run_script("lock").returncode, 0)
        self.assertTrue((self.state / "locked").exists())
        self.assertIn("LOCKED", (self.state / "oslock.log").read_text())
        self.assertEqual(self.run_script("unlock").returncode, 0)
        self.assertFalse(self.lock.exists())
        self.assertFalse((self.state / "locked").exists())

    def test_refuses_a_repo_swapped_for_a_symlink(self) -> None:
        real = self.repo.with_name("real")
        self.repo.rename(real)
        self.repo.symlink_to(real)
        self.lock = real / ".claude/state/GIAMTHI_HALT.lock"
        self.lock.write_text("halt")
        self.assertEqual(self.run_script("lock").returncode, 1)
        self.assertFalse((self.state / "locked").exists())

    def test_unknown_action_fails(self) -> None:
        self.assertEqual(self.run_script("explode").returncode, 2)


class CommandTests(unittest.TestCase):
    def test_unlock_refuses_without_a_terminal(self) -> None:
        with mock.patch.object(oslock.sys, "platform", "darwin"), \
             mock.patch.object(oslock.Path, "exists", return_value=True), \
             mock.patch.object(oslock.sys.stdin, "isatty", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "interactive terminal"):
                oslock.unlock("abcd1234", dry_run=False)

    def test_unlock_drops_cached_sudo_first(self) -> None:
        calls: list[list[str]] = []
        with mock.patch.object(oslock.sys, "platform", "darwin"), \
             mock.patch.object(oslock, "_sudo", side_effect=lambda a, d: calls.append(a) or 0):
            oslock.unlock("abcd1234", dry_run=True)
        self.assertEqual(calls[0], ["-k"])
        self.assertEqual(calls[1][-1], "unlock")

    def test_uninstall_refuses_while_engaged(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(oslock.sys, "platform", "darwin"), \
             mock.patch.object(oslock, "STATE_ROOT", Path(tmp)):
            (Path(tmp) / "abcd1234").mkdir()
            (Path(tmp) / "abcd1234/locked").touch()
            with self.assertRaisesRegex(RuntimeError, "unlock"):
                oslock.uninstall("abcd1234", dry_run=True)

    def test_offer_install_is_silent_off_macos_and_never_raises(self) -> None:
        with mock.patch.object(oslock.sys, "platform", "linux"), \
             mock.patch.object(oslock, "install", side_effect=AssertionError):
            oslock.offer_install(Path("/tmp"), "abcd1234", dry_run=True)
        with mock.patch.object(oslock.sys, "platform", "darwin"), \
             mock.patch.object(oslock, "install", side_effect=RuntimeError("no sudo")):
            oslock.offer_install(Path("/tmp"), "abcd1234", dry_run=True)

    def test_root_file_swapped_during_install_is_removed(self) -> None:
        calls: list[list[str]] = []
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "helper.sh"
            dest.write_bytes(b"attacker payload")
            with mock.patch.object(oslock, "_sudo", side_effect=lambda a, d, data=None: calls.append(a) or 0):
                with self.assertRaisesRegex(RuntimeError, "content changed"):
                    oslock._write_root_file(b"expected", dest, "0755", False)
        self.assertEqual(calls[0], ["tee", str(dest)])
        self.assertEqual(calls[-1], ["rm", "-f", str(dest)])

    def test_install_writes_through_a_pipe_not_a_temp_file(self) -> None:
        seen: list[tuple[list[str], bytes | None]] = []
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(oslock.sys, "platform", "darwin"), \
             mock.patch.object(oslock, "_require_root_only_dir"), \
             mock.patch.object(oslock, "_sudo", side_effect=lambda a, d, data=None: seen.append((a, data)) or 0):
            oslock.install(Path(tmp), "abcd1234", dry_run=True)
        tees = [(args, data) for args, data in seen if args[0] == "tee"]
        self.assertEqual(len(tees), 2)
        self.assertTrue(all(data for _args, data in tees))
        self.assertFalse(any(args[0] == "install" for args, _ in seen))

    def test_install_refuses_user_writable_helper_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(oslock.sys, "platform", "darwin"), \
             mock.patch.object(oslock, "HELPER_DIR", Path(tmp)):
            with self.assertRaisesRegex(RuntimeError, "owned by root"):
                oslock.install(Path(tmp), "abcd1234", dry_run=True)

    def test_install_rejects_missing_target(self) -> None:
        with mock.patch.object(oslock.sys, "platform", "darwin"):
            with self.assertRaisesRegex(RuntimeError, "does not exist"):
                oslock.install(Path("/no/such/yana/target"), "abcd1234", dry_run=True)

    def test_offer_install_respects_a_no_answer(self) -> None:
        with mock.patch.object(oslock.sys, "platform", "darwin"), \
             mock.patch.object(oslock.sys.stdin, "isatty", return_value=True), \
             mock.patch("builtins.input", return_value="n"), \
             mock.patch.object(oslock, "install", side_effect=AssertionError):
            oslock.offer_install(Path("/tmp"), "abcd1234", dry_run=False)

    def test_empty_and_long_target_ids_render(self) -> None:
        for target_id in ("", "a" * 65536):
            paths = oslock.oslock_paths(target_id)
            self.assertTrue(paths.label.startswith("com.yanaai.giamthi-oslock."))


@unittest.skipUnless(sys.platform == "darwin", "tier 2 is macOS-only")
class ServiceCliTests(unittest.TestCase):
    """The real `giamthi_service.py` entry point, run as a subprocess."""

    SERVICE = ROOT / "core/scripts/giamthi_service.py"

    def cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, str(self.SERVICE), *args],
                              capture_output=True, text=True, check=False)

    def test_install_oslock_on_missing_target_is_a_clean_error(self) -> None:
        result = self.cli("install-oslock", "/no/such/yana/target", "--dry-run")
        self.assertEqual(result.returncode, 2)
        self.assertIn("does not exist", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_unlock_dry_run_drops_sudo_cache_first(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self.cli("unlock", tmp, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = [l for l in result.stdout.splitlines() if l.startswith("DRY-RUN:")]
        self.assertEqual(lines[0], "DRY-RUN: sudo -k")
        self.assertTrue(lines[1].endswith(" unlock"))

    def test_status_reports_tier_two(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = self.cli("status", tmp, "--json")
        self.assertIn('"oslock_installed": false', result.stdout)


if __name__ == "__main__":
    unittest.main()
