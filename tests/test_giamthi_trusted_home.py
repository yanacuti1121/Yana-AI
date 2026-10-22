"""Tests for the Giám thị trusted-home mode (YANA_WATCH_TARGET).

An installed project carries its own copy of the watcher inside a tree the
watched agent can write to. These tests cover running the copy kept in the
Yana home instead, and the extra checks on the project's .claude/scripts.
"""

from __future__ import annotations

import importlib.util
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path, PureWindowsPath
from unittest import mock


sys.path.insert(0, str(Path(__file__).resolve().parent))
import giamthi_test_support  # noqa: E402,F401  (silences desktop notifications)


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/giamthi_service.py"
WATCHER = ROOT / "core/scripts/giamthi-watch.sh"
SPEC = importlib.util.spec_from_file_location("giamthi_service_trusted", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
svc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = svc
SPEC.loader.exec_module(svc)

PASSING_VERIFIER = "#!/usr/bin/env bash\nexit 0\n"
FAILING_VERIFIER = "#!/usr/bin/env bash\necho tampered >&2\nexit 1\n"


def git(target: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(target), *args], check=True, capture_output=True)


def make_pack(home: Path, *, verifier: str | None = PASSING_VERIFIER) -> Path:
    scripts = home / ".yana/pack/core/scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(WATCHER, scripts / "giamthi-watch.sh")
    if verifier is not None:
        (scripts / "verify-audit-chain.sh").write_text(verifier, encoding="utf-8")
    return scripts / "giamthi-watch.sh"


def make_project(root: Path, *, project_verifier: str = PASSING_VERIFIER) -> Path:
    target = (root / "project").resolve()
    scripts = target / ".claude/scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(WATCHER, scripts / "giamthi-watch.sh")
    (scripts / "verify-audit-chain.sh").write_text(project_verifier, encoding="utf-8")
    git(target.parent, "init", "-q", str(target))
    git(target, "config", "user.email", "test@yana.local")
    git(target, "config", "user.name", "Yana Test")
    (target / "README.md").write_text("fixture\n", encoding="utf-8")
    git(target, "add", "README.md", ".claude/scripts")
    git(target, "commit", "-qm", "fixture")
    return target


def run_trusted(pack_script: Path, target: str, *args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "YANA_WATCH_TARGET": target}
    return subprocess.run(
        ["bash", str(pack_script), *args],
        cwd=pack_script.parent,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


class SelectWatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ)
        self._env.start()
        os.environ.pop("YANA_HOME", None)

    def tearDown(self) -> None:
        self._env.stop()

    def test_prefers_pack_in_yana_home(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary).resolve()
            pack = make_pack(home)
            spec = svc.select_watch(home / "project", home)
            self.assertTrue(spec.trusted)
            self.assertEqual(spec.script, pack.resolve())
            self.assertEqual(spec.environment(home / "project"), {"YANA_WATCH_TARGET": str(home / "project")})

    def test_falls_back_to_project_copy_without_pack_or_verifier(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary).resolve()
            target = home / "project"
            self.assertEqual(svc.select_watch(target, home), svc.WatchSpec(svc.watch_script(target), False))
            make_pack(home, verifier=None)
            self.assertFalse(svc.select_watch(target, home).trusted)

    def test_symlinked_pack_script_is_not_trusted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary).resolve()
            pack = make_pack(home)
            elsewhere = home / "elsewhere.sh"
            shutil.copy2(pack, elsewhere)
            pack.unlink()
            pack.symlink_to(elsewhere)
            self.assertFalse(svc.select_watch(home / "project", home).trusted)

    def test_symlinked_pack_directory_is_not_trusted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary).resolve()
            make_pack(home)
            (home / ".yana/pack/core").rename(home / "real-core")
            (home / ".yana/pack/core").symlink_to(home / "real-core")
            self.assertFalse(svc.select_watch(home / "project", home).trusted)

    def test_yana_home_env_overrides_default_location(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            custom = base / "custom"
            make_pack(custom.parent / "x")
            shutil.move(str(custom.parent / "x/.yana"), str(custom))
            os.environ["YANA_HOME"] = str(custom)
            self.assertTrue(svc.select_watch(base / "project", base / "nohome").trusted)


class ServiceDefinitionTests(unittest.TestCase):
    TARGET = Path("/tmp/Yana AI")
    TRUSTED = svc.WatchSpec(Path("/home/u/.yana/pack/core/scripts/giamthi-watch.sh"), True)

    def test_launchd_runs_pack_script_and_passes_target(self) -> None:
        payload = svc.launchd_payload(self.TARGET, "/bin/bash", self.TRUSTED)
        self.assertEqual(payload["ProgramArguments"], ["/bin/bash", str(self.TRUSTED.script)])
        self.assertEqual(payload["EnvironmentVariables"], {"YANA_WATCH_TARGET": str(self.TARGET)})
        self.assertEqual(payload["WorkingDirectory"], str(self.TARGET))

    def test_launchd_untrusted_has_no_environment(self) -> None:
        self.assertNotIn("EnvironmentVariables", svc.launchd_payload(self.TARGET, "/bin/bash"))

    def test_systemd_sets_environment_before_exec(self) -> None:
        unit = svc.systemd_service(self.TARGET, "/bin/bash", self.TRUSTED)
        self.assertIn('Environment="YANA_WATCH_TARGET=/tmp/Yana AI"', unit)
        self.assertIn(f'ExecStart="/bin/bash" "{self.TRUSTED.script}"', unit)
        self.assertNotIn("Environment=", svc.systemd_service(self.TARGET, "/bin/bash"))

    def test_windows_action_sets_variable_through_cmd(self) -> None:
        spec = svc.WatchSpec(Path("C:/Users/Tam/.yana/pack/core/scripts/giamthi-watch.sh"), True)
        action = svc.windows_action(PureWindowsPath(r"C:\work\proj"), r"C:\Git\bash.exe", spec)
        self.assertTrue(action.startswith('cmd.exe /d /c "set "YANA_WATCH_TARGET=C:\\work\\proj"&& '))
        self.assertIn("giamthi-watch.sh", action)
        plain = svc.windows_action(PureWindowsPath(r"C:\work\proj"), r"C:\Git\bash.exe")
        self.assertNotIn("cmd.exe", plain)

    def test_install_writes_trusted_plist_and_status_reports_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary).resolve() / "home"
            home.mkdir()
            pack = make_pack(home)
            target = make_project(Path(temporary))
            ok = subprocess.CompletedProcess([], 0, "", "")
            with mock.patch.object(svc, "run_command", return_value=ok), mock.patch.object(
                svc, "wait_for_launchd_run"
            ), mock.patch.object(svc, "launchd_state", return_value="loaded"):
                paths = svc.install(target, home, "darwin", dry_run=False, allow_protected_path=True)
                report = svc.status(target, home, "darwin")
            data = plistlib.loads(paths.primary.read_bytes())
            self.assertEqual(data["ProgramArguments"][1], str(pack.resolve()))
            self.assertEqual(data["EnvironmentVariables"]["YANA_WATCH_TARGET"], str(target))
            self.assertTrue(report["watcher_trusted"])
            self.assertEqual(report["watcher"], str(pack.resolve()))
            self.assertEqual(report["stale_services"], [], "a trusted service must not look stale")


class WatcherTrustedModeTests(unittest.TestCase):
    def test_watches_named_project_and_writes_state_there(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root)
            target = make_project(root)
            completed = run_trusted(pack, str(target))
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((target / ".claude/state/giamthi-heartbeat.log").is_file())
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())
            self.assertFalse((root / ".yana/.claude").exists(), "no state may be written into the Yana home")

    def test_uses_pack_verifier_not_project_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root)
            target = make_project(root, project_verifier=FAILING_VERIFIER)
            completed = run_trusted(pack, str(target))
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())

    def test_missing_pack_verifier_halts_instead_of_using_project_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root, verifier=None)
            target = make_project(root)
            run_trusted(pack, str(target))
            lock = target / ".claude/state/GIAMTHI_HALT.lock"
            self.assertIn("verify-audit-chain.sh is missing", lock.read_text(encoding="utf-8"))

    def test_tampered_project_watcher_copy_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root)
            target = make_project(root)
            self.assertEqual(run_trusted(pack, str(target)).returncode, 0)
            (target / ".claude/scripts/giamthi-watch.sh").write_text("#!/bin/bash\nexit 0\n", encoding="utf-8")
            run_trusted(pack, str(target))
            report = (target / ".claude/state/GIAMTHI_HALT.lock").read_text(encoding="utf-8")
            self.assertIn("CHƯA COMMIT", report)
            self.assertIn(".claude/scripts/giamthi-watch.sh", report)

    def test_approval_hint_points_to_trusted_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root)
            target = make_project(root)
            self.assertEqual(run_trusted(pack, str(target)).returncode, 0)
            (target / ".claude/scripts/extra.sh").write_text("echo hi\n", encoding="utf-8")
            git(target, "add", ".claude/scripts/extra.sh")
            git(target, "commit", "-qm", "add script")
            run_trusted(pack, str(target))
            report = (target / ".claude/state/GIAMTHI_HALT.lock").read_text(encoding="utf-8")
            self.assertIn(f"YANA_WATCH_TARGET={target}", report)
            self.assertIn(str(pack), report)

    def test_rejects_unsafe_targets_without_touching_anything(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            pack = make_pack(root)
            target = make_project(root)
            link = root / "link"
            link.symlink_to(target)
            via_parent = root / "parent-link"
            via_parent.symlink_to(root)
            cases = {
                "relative": "project",
                "missing": str(root / "nope"),
                "symlink": str(link),
                "symlinked component": str(via_parent / "project"),
                "regular file": str(target / "README.md"),
            }
            for name, value in cases.items():
                with self.subTest(name):
                    completed = run_trusted(pack, value)
                    self.assertEqual(completed.returncode, 2, completed.stderr)
                    self.assertIn("YANA_WATCH_TARGET", completed.stderr)
            self.assertFalse((target / ".claude/state").exists())

    def test_without_variable_behaviour_is_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            env = {key: value for key, value in os.environ.items() if key != "YANA_WATCH_TARGET"}
            completed = subprocess.run(
                ["bash", str(target / ".claude/scripts/giamthi-watch.sh")],
                cwd=target, env=env, capture_output=True, text=True, check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((target / ".claude/state/giamthi-heartbeat.log").is_file())


class ClaudeScriptsSensitivityTests(unittest.TestCase):
    def _watch(self, target: Path, *args: str) -> subprocess.CompletedProcess[str]:
        env = {key: value for key, value in os.environ.items() if key != "YANA_WATCH_TARGET"}
        return subprocess.run(
            ["bash", str(target / ".claude/scripts/giamthi-watch.sh"), *args],
            cwd=target, env=env, capture_output=True, text=True, check=False,
        )

    def test_uncommitted_change_in_claude_scripts_halts(self) -> None:
        for name, setup in (("giamthi-watch.sh", "modify"), ("verify-audit-chain.sh", "delete"), ("extra.sh", "add")):
            with self.subTest(name), tempfile.TemporaryDirectory() as temporary:
                target = make_project(Path(temporary))
                self.assertEqual(self._watch(target).returncode, 0)
                path = target / ".claude/scripts" / name
                if setup == "delete":
                    path.unlink()
                elif setup == "modify":
                    path.write_text(path.read_text(encoding="utf-8") + "\n# edited\n", encoding="utf-8")
                else:
                    path.write_text("echo hi\n", encoding="utf-8")
                self._watch(target)
                lock = target / ".claude/state/GIAMTHI_HALT.lock"
                self.assertIn("CHƯA COMMIT", lock.read_text(encoding="utf-8"))

    def test_committed_change_in_claude_scripts_needs_human_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = make_project(Path(temporary))
            self.assertEqual(self._watch(target).returncode, 0)
            (target / ".claude/scripts/extra.sh").write_text("echo hi\n", encoding="utf-8")
            git(target, "add", ".claude/scripts/extra.sh")
            git(target, "commit", "-qm", "add script")
            self._watch(target)
            report = (target / ".claude/state/GIAMTHI_HALT.lock").read_text(encoding="utf-8")
            self.assertIn("chưa được con người duyệt", report)
            self.assertIn(".claude/scripts/extra.sh", report)


if __name__ == "__main__":
    unittest.main()
