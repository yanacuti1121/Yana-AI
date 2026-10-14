"""Kiểm tra bộ cài hệ thống Yana (tools/yana-ide/setup/yana_install). Không chạm mạng, Docker hay LaunchAgent thật:
mọi lệnh ngoài (pip, cargo, docker, giamthi) là script giả trong thư mục tạm, PATH được thay cho từng test.
Chạy: python3 -m unittest discover -s tools/yana-ide/tests -p 'test_system_install.py'
"""

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


class ManifestAndHome(Base):
    def test_manifest_lists_the_stages_in_order(self):
        code, out, _ = run_cli("--manifest")
        data = json.loads(out)
        self.assertEqual(code, 0)
        self.assertEqual(data["protocol_version"], 1)
        names = [s["name"] for s in data["stages"]]
        self.assertEqual(names, ["prerequisites", "package", "toolchain", "runtime", "pack", "config", "integrity", "sandbox", "supervisor", "complete"])
        self.assertFalse(any(s["needs_user_input"] for s in data["stages"]), "the supervisor installs automatically")

    def test_dangerous_homes_are_refused(self):
        for bad in ["/", str(Path.home()), str(Path.home().parent), str(self.tmp / "a-file")]:
            if bad.endswith("a-file"):
                Path(bad).write_text("x")
            code, _, err = run_cli("--home", bad, "--stage", "config")
            self.assertEqual(code, 2, bad)
            self.assertIn("error:", err)

    def test_home_and_source_may_not_contain_each_other(self):
        code, _, _ = run_cli("--home", str(self.source / "inside"), "--source", str(self.source), "--stage", "config")
        self.assertEqual(code, 2)
        code, _, _ = run_cli("--home", str(self.tmp), "--source", str(self.source), "--stage", "config")
        self.assertEqual(code, 2)


class SeedRules(Base):
    def sync(self, dry=False):
        return seed.sync(self.source, self.home / "pack", ("core", "bin"), dry_run=dry)

    def test_first_sync_adds_and_second_changes_nothing(self):
        first = self.sync()["counts"]
        self.assertEqual(first["add"], 6)  # guard.sh, SKILL.md, secure-logger.js, giamthi_service.py, bin/yana, bin/yana-rt-<nền tảng>
        second = self.sync()["counts"]
        self.assertEqual((second["add"], second["update"]), (0, 0))
        self.assertEqual(second["unchanged"], first["add"])

    def test_per_user_state_is_not_shipped_but_the_code_beside_it_is(self):
        self.sync()
        for state_file in ("L2_session/auto-compress-1.md", "agent-journals/bot.md", "audit/agent-actions.log", "trust-ledger.json"):
            self.assertFalse((self.home / "pack/core/memory" / state_file).exists(), state_file)
        self.assertTrue((self.home / "pack/core/memory/secure-logger.js").exists(), "the logger is code, not state")

    def test_unmodified_copy_follows_the_source(self):
        self.sync()
        (self.source / "core/skills/demo/SKILL.md").write_text("skill v2\n")
        report = self.sync()["counts"]
        self.assertEqual(report["update"], 1)
        self.assertEqual((self.home / "pack/core/skills/demo/SKILL.md").read_text(), "skill v2\n")

    def test_user_edit_is_kept_when_the_source_changes(self):
        self.sync()
        target = self.home / "pack/core/skills/demo/SKILL.md"
        target.write_text("my own edit\n")
        (self.source / "core/skills/demo/SKILL.md").write_text("skill v2\n")
        report = self.sync()
        self.assertEqual(report["counts"]["user_modified"], 1)
        self.assertEqual(target.read_text(), "my own edit\n")
        self.assertIn("core/skills/demo/SKILL.md", report["kept"])

    def test_deleted_by_the_user_is_not_added_back(self):
        self.sync()
        (self.home / "pack/core/hooks/guard.sh").unlink()
        report = self.sync()["counts"]
        self.assertEqual(report["user_deleted"], 1)
        self.assertFalse((self.home / "pack/core/hooks/guard.sh").exists())

    def test_a_file_we_never_copied_is_left_alone(self):
        (self.home / "pack/core/hooks").mkdir(parents=True)
        (self.home / "pack/core/hooks/guard.sh").write_text("theirs\n")
        report = self.sync()["counts"]
        self.assertEqual(report["existing_untracked"], 1)
        self.assertEqual((self.home / "pack/core/hooks/guard.sh").read_text(), "theirs\n")
        self.assertNotIn("core/hooks/guard.sh", seed.read_manifest(self.home / "pack" / seed.MANIFEST_NAME))

    def test_symlinks_in_the_source_are_not_followed(self):
        outside = self.tmp / "outside.txt"
        outside.write_text("secret\n")
        (self.source / "core/leak.txt").symlink_to(outside)
        self.sync()
        self.assertFalse((self.home / "pack/core/leak.txt").exists())

    def test_a_path_that_escapes_the_install_folder_is_refused(self):
        for rel in ["../evil", "/etc/passwd", "core/../../evil"]:
            with self.assertRaises(ValueError):
                seed.safe_dest(self.home / "pack", rel)

    def test_dry_run_writes_nothing(self):
        report = self.sync(dry=True)
        self.assertGreater(report["counts"]["add"], 0)
        self.assertFalse(self.home.exists())

    def test_drift_reports_modified_and_missing(self):
        self.sync()
        (self.home / "pack/core/skills/demo/SKILL.md").write_text("changed\n")
        (self.home / "pack/core/hooks/guard.sh").unlink()
        drift = seed.drift(self.home / "pack")
        self.assertEqual((drift["modified"], drift["missing"]), (1, 1))
        self.assertEqual(drift["tracked"], drift["intact"] + 2)

    def test_installed_scripts_keep_the_executable_bit_and_nothing_is_group_writable(self):
        self.sync()
        mode = (self.home / "pack/core/hooks/guard.sh").stat().st_mode
        self.assertTrue(mode & stat.S_IXUSR)
        self.assertFalse(mode & (stat.S_IWGRP | stat.S_IWOTH | stat.S_ISUID | stat.S_ISGID))


class FullInstall(Base):
    def test_full_ladder_from_a_local_source(self):
        code, out, _ = self.install()
        results = {r["stage"]: r for r in lines(out)}
        self.assertEqual(code, 0, out)
        self.assertEqual(list(results), [n for n, *_ in stages.STAGES])
        self.assertTrue(results["package"]["skipped"])
        self.assertEqual(results["runtime"]["details"]["origin"], "pypi-wheel")
        self.assertEqual(results["runtime"]["details"]["version"], "yana-rt 9.9.9")
        self.assertTrue((self.home / "bin/yana-rt").exists())
        self.assertTrue((self.home / stages.MARKER_NAME).exists())
        self.assertEqual(stat.S_IMODE((self.home / "config.json").stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.home.stat().st_mode), 0o700)
        self.assertTrue(list((self.home / "logs").glob("install-*.log")))

    def test_running_it_again_changes_nothing(self):
        self.install()
        before = (self.home / "config.json").read_text()
        (self.home / "config.json").write_text(before.replace('"ask"', '"auto"'))
        code, out, _ = self.install()
        self.assertEqual(code, 0)
        pack = {r["stage"]: r for r in lines(out)}["pack"]["details"]["counts"]
        self.assertEqual((pack["add"], pack["update"]), (0, 0))
        self.assertIn('"auto"', (self.home / "config.json").read_text(), "an existing config is never overwritten")

    def test_a_wrong_runtime_checksum_installs_nothing(self):
        code, out, _ = self.install("--runtime-sha256", "0" * 64)
        failed = [r for r in lines(out) if not r["ok"]]
        self.assertEqual(code, 1)
        self.assertEqual(failed[0]["stage"], "runtime")
        self.assertIn("does not match", failed[0]["reason"])
        self.assertFalse((self.home / "bin/yana-rt").exists())
        self.assertFalse((self.home / stages.RUNTIME_RECORD).exists())

    def test_the_right_runtime_checksum_is_accepted(self):
        binary = self.source / "bin" / f"yana-rt-{sys.platform}-{arch_tag()}"
        code, _, _ = self.install("--runtime-sha256", seed.file_sha256(binary))
        self.assertEqual(code, 0)

    def test_a_runtime_that_does_not_run_is_refused(self):
        broken = script(self.tmp / "broken-rt", "exit 3\n")
        code, out, _ = self.install("--runtime-binary", str(broken))
        self.assertEqual(code, 1)
        self.assertIn("did not run", [r for r in lines(out) if not r["ok"]][0]["reason"])

    def test_stop_at_the_first_failed_stage(self):
        broken = script(self.tmp / "broken-rt", "exit 3\n")
        _, out, _ = self.install("--runtime-binary", str(broken))
        self.assertEqual([r["stage"] for r in lines(out)][-1], "runtime", "later stages must not run after a failure")

    def test_complete_refuses_when_nothing_is_installed(self):
        code, result = self.stage("complete")
        self.assertEqual(code, 1)
        self.assertFalse(result["ok"])
        self.assertFalse((self.home / stages.MARKER_NAME).exists())

    def test_status_before_and_after(self):
        before = json.loads(run_cli("--home", str(self.home), "--status")[1])
        self.assertFalse(before["installed"])
        self.install()
        after = json.loads(run_cli("--home", str(self.home), "--status")[1])
        self.assertTrue(after["installed"])
        self.assertEqual(after["runtime"]["version"], "yana-rt 9.9.9")
        self.assertEqual(after["pack"]["modified"], 0)

    def test_dry_run_changes_nothing_on_disk(self):
        code, out, _ = self.install("--dry-run")
        self.assertEqual(code, 0, out)
        self.assertFalse(self.home.exists())


class RuntimeSources(Base):
    def test_cargo_builds_the_runtime_when_the_package_has_none(self):
        (self.source / "bin" / f"yana-rt-{sys.platform}-{arch_tag()}").unlink()
        script(self.fakebin / "cargo",
               f'echo "$@" > "{self.tmp}/cargo-args.txt"\nroot=""\nwhile [ $# -gt 0 ]; do [ "$1" = "--root" ] && root="$2"; shift; done\n'
               f'mkdir -p "$root/bin"\nprintf \'#!/bin/sh\\necho "yana-rt 1.2.3"\\n\' > "$root/bin/yana-rt"\nchmod 755 "$root/bin/yana-rt"\n')
        code, result = self.stage("runtime", "--runtime-version", "1.2.3")
        self.assertEqual(code, 0, result)
        self.assertEqual(result["details"]["origin"], "crates.io")
        args = (self.tmp / "cargo-args.txt").read_text()
        for expected in ("install yana-rt", "--locked", "--version 1.2.3", "--root"):
            self.assertIn(expected, args)

    def test_no_prebuilt_and_no_cargo_fails_with_guidance(self):
        (self.source / "bin" / f"yana-rt-{sys.platform}-{arch_tag()}").unlink()
        code, result = self.stage("runtime")
        self.assertEqual(code, 1)
        self.assertIn("toolchain stage", result["reason"])

    def test_a_failing_cargo_is_reported(self):
        (self.source / "bin" / f"yana-rt-{sys.platform}-{arch_tag()}").unlink()
        script(self.fakebin / "cargo", 'echo "boom" >&2\nexit 101\n')
        code, result = self.stage("runtime")
        self.assertEqual(code, 1)
        self.assertIn("cargo install yana-rt failed", result["reason"])


class PackageStage(Base):
    def test_pip_uses_the_spec_or_the_hashed_lock_file(self):
        ctx = stages.Context(home=self.home, dry_run=True, package_spec="yana-ai==1.5.1")
        plain = stages.stage_package(ctx)["details"]["would_run"]
        self.assertEqual(plain[-1], "yana-ai==1.5.1")
        self.assertNotIn("--require-hashes", plain)
        lock = self.tmp / "lock.txt"
        lock.write_text("yana-ai==1.5.1 --hash=sha256:" + "a" * 64 + "\n")
        hashed = stages.stage_package(stages.Context(home=self.home, dry_run=True, requirements=lock))["details"]["would_run"]
        self.assertIn("--require-hashes", hashed)
        self.assertEqual(hashed[-1], str(lock))

    def test_a_local_source_skips_pip_entirely(self):
        self.assertTrue(stages.stage_package(stages.Context(home=self.home, source=self.source))["skipped"])


if __name__ == "__main__":
    unittest.main()
