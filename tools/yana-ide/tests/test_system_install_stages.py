"""Giai đoạn sandbox, supervisor, integrity và prerequisites của bộ cài hệ thống Yana (cùng cách chạy với test_system_install.py)."""

import contextlib
import hashlib
import io
import json
import os
import platform
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from install_test_support import BASE_PATH, Base, arch_tag, cli, lines, pyscript, run_cli, script, seed, stages, toolchain  # noqa: E402,F401


class SandboxAndSupervisor(Base):
    def test_sandbox_reports_each_docker_situation_honestly(self):
        self.assertEqual(self.stage("sandbox")[1]["details"]["docker"], "not installed")
        script(self.fakebin / "docker", "exit 1\n")
        self.assertEqual(self.stage("sandbox")[1]["details"]["docker"], "installed, not running")
        script(self.fakebin / "docker", 'case "$1" in info) echo 29.0;; image) exit 1;; esac\n')
        result = self.stage("sandbox")[1]
        self.assertEqual(result["details"]["image"], "not built")
        self.assertIn("not built", result["reason"])
        script(self.fakebin / "docker", 'case "$1" in info) echo 29.0;; image) exit 0;; esac\n')
        self.assertEqual(self.stage("sandbox")[1]["details"]["image"], "present")

    def test_supervisor_needs_a_project_and_the_pack(self):
        self.assertTrue(self.stage("supervisor")[1]["skipped"])
        project = self.tmp / "proj"
        project.mkdir()
        code, result = self.stage("supervisor", "--project", str(project))
        self.assertFalse(result["ok"], "the pack is not installed yet")

    def install_pack(self):
        self.install()

    def test_supervisor_installs_automatically_for_a_project(self):
        self.install_pack()
        project = self.tmp / "proj"
        project.mkdir()
        code, result = self.stage("supervisor", "--project", str(project))
        self.assertEqual(code, 0, result)
        self.assertFalse(result["skipped"])
        args = (self.tmp / "giamthi-args.txt").read_text()
        self.assertIn("install", args)
        self.assertIn(str(project), args)
        self.assertNotIn("--allow-protected-path", args, "never bypass macOS privacy protection on its own")

    def test_a_protected_macos_folder_is_reported_not_forced(self):
        self.install_pack()
        pyscript(self.home / "pack/core/scripts/giamthi_service.py",
                 'import sys\nsys.stderr.write("Error: macOS background access is restricted for Desktop/Documents/Downloads. Move the checkout under ~/Projects.\\n")\nsys.exit(1)\n')
        project = self.tmp / "Desktop-proj"
        project.mkdir()
        code, result = self.stage("supervisor", "--project", str(project))
        self.assertEqual(code, 0, "a protected folder is a skip, not a failed install")
        self.assertTrue(result["skipped"])
        self.assertEqual(result["details"]["needs"], "full-disk-access-or-move")

    def test_a_project_without_the_yana_scripts_is_a_skip_with_the_reason(self):
        self.install_pack()
        pyscript(self.home / "pack/core/scripts/giamthi_service.py",
                 'import sys\nsys.stderr.write("Error: missing .claude/scripts/giamthi-watch.sh. Run `yana-ai install /p` before installing the supervisor.\\n")\nsys.exit(1)\n')
        project = self.tmp / "proj"
        project.mkdir()
        code, result = self.stage("supervisor", "--project", str(project))
        self.assertEqual(code, 0)
        self.assertTrue(result["skipped"])
        self.assertEqual(result["details"]["needs"], "project-pack")

    def test_other_supervisor_failures_are_failures(self):
        self.install_pack()
        pyscript(self.home / "pack/core/scripts/giamthi_service.py", 'import sys\nsys.stderr.write("launchctl exploded\\n")\nsys.exit(1)\n')
        project = self.tmp / "proj"
        project.mkdir()
        code, result = self.stage("supervisor", "--project", str(project))
        self.assertEqual(code, 1)
        self.assertIn("launchctl exploded", result["reason"])

    def test_the_allow_flag_is_passed_only_when_asked_and_dry_run_is_forwarded(self):
        self.install_pack()
        project = self.tmp / "proj"
        project.mkdir()
        self.stage("supervisor", "--project", str(project), "--allow-protected-path", "--dry-run")
        args = (self.tmp / "giamthi-args.txt").read_text().splitlines()[-1]
        self.assertIn("--allow-protected-path", args)
        self.assertIn("--dry-run", args)


class Integrity(Base):
    def test_a_swapped_runtime_is_detected(self):
        self.install()
        (self.home / "bin/yana-rt").write_text("#!/bin/sh\necho evil\n")
        code, result = self.stage("integrity")
        self.assertEqual(code, 1)
        self.assertIn("changed since it was installed", result["reason"])

    def test_a_user_edited_pack_file_is_reported_but_allowed(self):
        self.install()
        (self.home / "pack/core/skills/demo/SKILL.md").write_text("mine\n")
        code, result = self.stage("integrity")
        self.assertEqual(code, 0)
        self.assertEqual(result["details"]["pack"]["modified"], 1)

    def test_integrity_skips_before_anything_is_installed(self):
        self.assertTrue(self.stage("integrity")[1]["skipped"])


class Prerequisites(Base):
    def test_the_minimum_python_matches_what_the_published_package_requires(self):
        # yana-ai 1.5.1 on PyPI: requires_python ">=3.11" (đọc từ https://pypi.org/pypi/yana-ai/json, 2026-10-14)
        self.assertEqual(stages.MIN_PYTHON, (3, 11))

    def test_missing_bash_is_a_clear_failure(self):
        os.environ["PATH"] = str(self.fakebin)
        code, result = self.stage("prerequisites")
        self.assertEqual(code, 1)
        self.assertIn("bash", result["reason"])

    def test_tools_are_reported_without_failing_when_optional_ones_are_missing(self):
        code, result = self.stage("prerequisites")
        self.assertEqual(code, 0, result)
        self.assertIsNone(result["details"]["tools"]["cargo"])


if __name__ == "__main__":
    unittest.main()
