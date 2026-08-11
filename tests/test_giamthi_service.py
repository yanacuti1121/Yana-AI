"""Regression tests for the cross-platform Giám thị service manager."""

from __future__ import annotations

import importlib.util
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path, PureWindowsPath
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "core/scripts/giamthi_service.py"
SPEC = importlib.util.spec_from_file_location("giamthi_service", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
giamthi_service = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = giamthi_service
SPEC.loader.exec_module(giamthi_service)


class GiamthiServiceTests(unittest.TestCase):
    def test_service_id_is_stable_and_project_specific(self) -> None:
        first = giamthi_service.service_id(Path("/tmp/yana one"))
        self.assertEqual(first, giamthi_service.service_id(Path("/tmp/yana one")))
        self.assertNotEqual(first, giamthi_service.service_id(Path("/tmp/yana two")))
        self.assertRegex(first, r"^com\.yanaai\.giamthi-watch\.[0-9a-f]{8}$")

    def test_macos_protected_path_detection(self) -> None:
        home = Path("/Users/yana")
        self.assertTrue(giamthi_service.macos_protected_path(home / "Desktop/project", home))
        self.assertFalse(giamthi_service.macos_protected_path(home / "Projects/project", home))

    def test_launchd_payload_uses_exact_target_and_shared_state(self) -> None:
        target = Path("/tmp/Yana AI")
        payload = giamthi_service.launchd_payload(target, "/bin/bash")
        self.assertEqual(payload["WorkingDirectory"], str(target))
        self.assertEqual(payload["ProgramArguments"], ["/bin/bash", str(target / ".claude/scripts/giamthi-watch.sh")])
        self.assertEqual(payload["StandardErrorPath"], str(target / ".claude/state/giamthi-runner.log"))
        self.assertTrue(payload["RunAtLoad"])
        self.assertEqual(payload["StartInterval"], 21_600)

    def test_systemd_units_are_user_scoped_and_periodic(self) -> None:
        target = Path("/tmp/Yana AI")
        service = giamthi_service.systemd_service(target, "/bin/bash")
        timer = giamthi_service.systemd_timer("yana-giamthi-deadbeef")
        self.assertIn('WorkingDirectory="/tmp/Yana AI"', service)
        self.assertIn('ExecStart="/bin/bash" "/tmp/Yana AI/.claude/scripts/giamthi-watch.sh"', service)
        self.assertIn('ReadWritePaths="/tmp/Yana AI/.claude/state"', service)
        self.assertIn("OnUnitActiveSec=6h", timer)
        self.assertIn("Persistent=true", timer)

    def test_windows_action_preserves_paths_with_spaces(self) -> None:
        action = giamthi_service.windows_action(
            PureWindowsPath(r"C:\Users\Tam\Yana AI"),
            r"C:\Program Files\Git\bin\bash.exe",
        )
        self.assertIn('"C:\\Program Files\\Git\\bin\\bash.exe"', action)
        self.assertIn('"C:\\Users\\Tam\\Yana AI\\.claude\\scripts\\giamthi-watch.sh"', action)

    def test_status_reports_legacy_launchagent_as_stale(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            home = root / "home"
            target = root / "current"
            old_target = root / "old"
            (target / ".claude/scripts").mkdir(parents=True)
            (target / ".claude/scripts/giamthi-watch.sh").write_text("#!/bin/bash\n", encoding="utf-8")
            launch_agents = home / "Library/LaunchAgents"
            launch_agents.mkdir(parents=True)
            legacy = launch_agents / "com.yanaai.giamthi-watch.plist"
            legacy.write_bytes(
                plistlib.dumps(
                    {
                        "Label": "com.yanaai.giamthi-watch",
                        "ProgramArguments": ["/bin/bash", str(old_target / ".claude/scripts/giamthi-watch.sh")],
                    }
                )
            )
            with mock.patch.object(giamthi_service.subprocess, "run") as run:
                run.return_value.returncode = 1
                report = giamthi_service.status(target, home, "darwin")
        self.assertFalse(report["installed"])
        self.assertTrue(report["watcher_exists"])
        self.assertEqual(report["stale_services"][0]["target"], str(old_target))
        self.assertEqual(report["runtime_state"], "not-loaded")

    def test_dry_run_does_not_write_service_or_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "target"
            home = root / "home"
            (target / ".claude/scripts").mkdir(parents=True)
            (target / ".claude/scripts/giamthi-watch.sh").write_text("#!/bin/bash\n", encoding="utf-8")
            with mock.patch.object(giamthi_service, "bash_executable", return_value="/bin/bash"):
                paths = giamthi_service.install(target, home, "darwin", dry_run=True)
        self.assertFalse(paths.primary.exists())
        self.assertFalse((target / ".claude/state").exists())

    def test_protected_macos_target_fails_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            target = home / "Desktop/Yana-AI"
            (target / ".claude/scripts").mkdir(parents=True)
            (target / ".claude/scripts/giamthi-watch.sh").write_text("#!/bin/bash\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "Full Disk Access"):
                giamthi_service.install(target, home, "darwin", dry_run=False)
        self.assertFalse((home / "Library/LaunchAgents").exists())

    def test_missing_watcher_is_actionable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RuntimeError, "yana-ai install"):
                giamthi_service.validate_target(Path(temporary))

    def test_missing_service_manager_command_is_reported(self) -> None:
        with mock.patch.object(giamthi_service.subprocess, "run", side_effect=FileNotFoundError("missing")):
            self.assertEqual(
                giamthi_service.command_state(["systemctl"], "enabled", "not-enabled"),
                "service-manager-unavailable",
            )

    def test_launchd_status_surfaces_nonzero_last_exit(self) -> None:
        stopped, exit_code = giamthi_service.launchd_result(
            "state = not running\nlast exit code = 126\n"
        )
        self.assertTrue(stopped)
        self.assertEqual(exit_code, 126)

    def _installed_target(self, root: Path, *, include_verifier: bool) -> Path:
        target = root / "installed-target"
        scripts = target / ".claude/scripts"
        scripts.mkdir(parents=True)
        shutil.copy2(ROOT / "core/scripts/giamthi-watch.sh", scripts / "giamthi-watch.sh")
        if include_verifier:
            verifier = scripts / "verify-audit-chain.sh"
            verifier.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            verifier.chmod(0o755)
        subprocess.run(["git", "init", "-q", str(target)], check=True)
        subprocess.run(["git", "-C", str(target), "config", "user.email", "test@yana.local"], check=True)
        subprocess.run(["git", "-C", str(target), "config", "user.name", "Yana Test"], check=True)
        (target / "README.md").write_text("fixture\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(target), "add", "README.md"], check=True)
        subprocess.run(["git", "-C", str(target), "commit", "-qm", "fixture"], check=True)
        return target

    def test_installed_target_does_not_require_source_core_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = self._installed_target(Path(temporary), include_verifier=True)
            completed = subprocess.run(
                ["bash", str(target / ".claude/scripts/giamthi-watch.sh")],
                cwd=target,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertFalse((target / ".claude/state/GIAMTHI_HALT.lock").exists())
            self.assertTrue((target / ".claude/state/giamthi-heartbeat.log").is_file())

    def test_installed_target_missing_audit_verifier_halts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = self._installed_target(Path(temporary), include_verifier=False)
            completed = subprocess.run(
                ["bash", str(target / ".claude/scripts/giamthi-watch.sh")],
                cwd=target,
                capture_output=True,
                text=True,
                check=False,
            )
            lock = target / ".claude/state/GIAMTHI_HALT.lock"
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue(lock.is_file())
            self.assertIn("verify-audit-chain.sh is missing", lock.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
