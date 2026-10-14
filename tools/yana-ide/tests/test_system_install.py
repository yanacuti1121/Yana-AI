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

SETUP = Path(__file__).resolve().parent.parent / "setup"
sys.path.insert(0, str(SETUP))

from yana_install import cli, seed, stages  # noqa: E402

BASE_PATH = "/usr/bin:/bin"  # có bash và coreutils, không có docker, cargo


def arch_tag():
    arch = platform.machine().lower()
    return "x86_64" if arch in ("amd64", "x86_64") else arch


def script(path, body):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("#!/bin/sh\n" + body)
    path.chmod(0o755)
    return path


def pyscript(path, body):
    """Script giả chạy bằng Python (bộ cài chạy giamthi_service.py bằng trình thông dịch Python, không chạy trực tiếp)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    return path


def run_cli(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            code = cli.main(list(argv))
        except SystemExit as exit_:
            code = exit_.code
    return code, out.getvalue(), err.getvalue()


def lines(text):
    return [json.loads(line) for line in text.splitlines() if line.startswith("{")]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="yana-install-test-")).resolve()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.fakebin = self.tmp / "fakebin"
        self.fakebin.mkdir()
        self.old_path = os.environ.get("PATH")
        os.environ["PATH"] = f"{self.fakebin}:{BASE_PATH}"
        self.addCleanup(lambda: os.environ.__setitem__("PATH", self.old_path))
        self.home = self.tmp / "home" / ".yana"
        self.source = self.make_source()

    def make_source(self, version="9.9.9"):
        src = self.tmp / "src"
        script(src / "core/hooks/guard.sh", "echo guard\n")
        (src / "core/skills/demo").mkdir(parents=True, exist_ok=True)
        (src / "core/skills/demo/SKILL.md").write_text("skill v1\n")
        for state_file in ("L2_session/auto-compress-1.md", "agent-journals/bot.md", "audit/agent-actions.log"):
            (src / "core/memory" / state_file).parent.mkdir(parents=True, exist_ok=True)
            (src / "core/memory" / state_file).write_text("per-user state\n")
        (src / "core/memory/trust-ledger.json").write_text("{}\n")
        (src / "core/memory/secure-logger.js").write_text("// code\n")
        script(src / "bin/yana", "echo yana\n")
        script(src / "bin" / f"yana-rt-{sys.platform}-{arch_tag()}", f'echo "yana-rt {version}"\n')
        pyscript(src / "core/scripts/giamthi_service.py",
                 f'import sys\nopen(r"{self.tmp}/giamthi-args.txt", "a").write(" ".join(sys.argv[1:]) + "\\n")\nprint(\'{{"installed": true}}\')\n')
        return src

    def install(self, *extra):
        return run_cli("--home", str(self.home), "--source", str(self.source), "--json", *extra)

    def stage(self, name, *extra):
        code, out, _ = run_cli("--home", str(self.home), "--source", str(self.source), "--json", "--stage", name, *extra)
        return code, lines(out)[0] if lines(out) else None


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



FAKE_RUSTUP = r"""#!/bin/sh
echo ran >> "$MARK_FILE"
mkdir -p "$CARGO_HOME/bin"
cat > "$CARGO_HOME/bin/cargo" <<'CARGO'
#!/bin/sh
case "$1" in
  --version) echo "cargo 9.9.9" ;;
  install) root=""; while [ $# -gt 0 ]; do [ "$1" = "--root" ] && root="$2"; shift; done
           mkdir -p "$root/bin"; printf '#!/bin/sh\necho "yana-rt 1.2.3"\n' > "$root/bin/yana-rt"; chmod 755 "$root/bin/yana-rt" ;;
esac
CARGO
chmod 755 "$CARGO_HOME/bin/cargo"
"""


class Toolchain(Base):
    def setUp(self):
        super().setUp()
        (self.source / "bin" / f"yana-rt-{sys.platform}-{arch_tag()}").unlink()  # không có bản dựng sẵn: phải biên dịch
        script(self.fakebin / "cc", "exit 0\n")
        self.mark = self.tmp / "rustup-ran.txt"
        os.environ["MARK_FILE"] = str(self.mark)
        self.addCleanup(lambda: os.environ.pop("MARK_FILE", None))
        self.triple = stages.rust_triple()
        self.server = self.tmp / "server"
        self.publish(FAKE_RUSTUP)

    def publish(self, body, checksum=None):
        directory = self.server / self.triple
        directory.mkdir(parents=True, exist_ok=True)
        binary = directory / "rustup-init"
        binary.write_text(body)
        digest = checksum or hashlib.sha256(body.encode()).hexdigest()
        (directory / "rustup-init.sha256").write_text(f"{digest}  rustup-init\n")

    def toolchain(self, *extra, base=None):
        return self.stage("toolchain", "--rustup-base", base or f"file://{self.server}", *extra)

    def test_installs_rust_inside_the_yana_folder_and_the_runtime_stage_uses_it(self):
        code, result = self.toolchain()
        self.assertEqual(code, 0, result)
        self.assertIn("cargo 9.9.9", result["details"]["cargo"])
        self.assertTrue((self.home / "rust/cargo/bin/cargo").exists())
        self.assertEqual(self.mark.read_text().strip(), "ran")
        code, runtime = self.stage("runtime")
        self.assertEqual(code, 0, runtime)
        self.assertEqual(runtime["details"]["origin"], "crates.io")
        self.assertEqual(runtime["details"]["version"], "yana-rt 1.2.3")

    def test_a_checksum_that_does_not_match_runs_nothing(self):
        self.publish(FAKE_RUSTUP, checksum="0" * 64)
        code, result = self.toolchain()
        self.assertEqual(code, 1)
        self.assertIn("does not match", result["reason"])
        self.assertFalse(self.mark.exists(), "an unverified rustup-init must never run")
        self.assertFalse((self.home / "cache/rustup-init").exists(), "the unverified binary is deleted")

    def test_plain_http_is_refused(self):
        code, result = self.toolchain(base="http://static.rust-lang.org/rustup/dist")
        self.assertEqual(code, 1)
        self.assertIn("only https", result["reason"])
        self.assertFalse(self.mark.exists())

    def test_an_oversized_download_is_stopped(self):
        with mock.patch.object(stages, "MAX_DOWNLOAD_BYTES", 5):
            code, result = self.toolchain()
        self.assertEqual(code, 1)
        self.assertIn("stopped", result["reason"])
        self.assertFalse(self.mark.exists())

    def test_it_does_nothing_when_rust_is_not_needed(self):
        script(self.fakebin / "cargo", "echo cargo\n")
        self.assertIn("already available", self.toolchain()[1]["reason"])
        os.environ["PATH"] = f"{self.fakebin}:{BASE_PATH}"
        (self.fakebin / "cargo").unlink()
        script(self.source / "bin" / f"yana-rt-{sys.platform}-{arch_tag()}", 'echo "yana-rt 9.9.9"\n')
        self.assertIn("prebuilt", self.toolchain()[1]["reason"])
        binary = self.tmp / "my-rt"
        script(binary, 'echo "yana-rt 1.0.0"\n')
        self.assertIn("explicit runtime", self.toolchain("--runtime-binary", str(binary))[1]["reason"])
        self.assertFalse(self.mark.exists())

    def test_a_missing_c_compiler_is_a_clear_failure_with_the_macos_fix(self):
        script(self.fakebin / "cc", "exit 1\n")
        code, result = self.toolchain()
        self.assertEqual(code, 1)
        self.assertIn("xcode-select --install", result["reason"])
        self.assertFalse(self.mark.exists())

    def test_an_unsupported_platform_is_reported(self):
        with mock.patch.object(stages, "rust_triple", return_value=None):
            code, result = self.toolchain()
        self.assertEqual(code, 1)
        self.assertIn("install Rust yourself", result["reason"])

    def test_dry_run_says_what_it_would_do_and_writes_nothing(self):
        code, result = self.toolchain("--dry-run")
        self.assertEqual(code, 0, result)
        self.assertIn("would_download", result["details"])
        self.assertFalse(self.home.exists())
        self.assertFalse(self.mark.exists())

    def build_runtime(self, *extra):
        self.toolchain()
        # Tạo thêm bộ nhớ đệm crate như cargo thật vẫn làm.
        registry = self.home / "rust/cargo/registry/cache"
        registry.mkdir(parents=True, exist_ok=True)
        (registry / "crate.crate").write_bytes(b"x" * 2048)
        return self.stage("runtime", *extra)

    def test_the_crate_cache_is_pruned_after_a_successful_build_but_the_toolchain_stays(self):
        code, result = self.build_runtime()
        self.assertEqual(code, 0, result)
        self.assertFalse((self.home / "rust/cargo/registry").exists())
        self.assertTrue((self.home / "rust/cargo/bin/cargo").exists(), "the toolchain is kept for updates")
        self.assertTrue((self.home / "bin/yana-rt").exists())

    def test_prune_rust_removes_the_whole_yana_toolchain(self):
        code, result = self.build_runtime("--prune-rust")
        self.assertEqual(code, 0, result)
        self.assertFalse((self.home / "rust").exists())
        self.assertTrue((self.home / "bin/yana-rt").exists(), "the runtime itself is never removed")

    def test_nothing_is_pruned_when_the_user_has_their_own_cargo(self):
        self.toolchain()
        registry = self.home / "rust/cargo/registry"
        registry.mkdir(parents=True, exist_ok=True)
        (registry / "keep.txt").write_text("x")
        script(self.fakebin / "cargo", f'root=""\nwhile [ $# -gt 0 ]; do [ "$1" = "--root" ] && root="$2"; shift; done\n'
                                       f'mkdir -p "$root/bin"; printf \'#!/bin/sh\\necho "yana-rt 1.2.3"\\n\' > "$root/bin/yana-rt"; chmod 755 "$root/bin/yana-rt"\n')
        code, result = self.stage("runtime", "--prune-rust")
        self.assertEqual(code, 0, result)
        self.assertTrue((registry / "keep.txt").exists(), "the user's own Rust must never be touched")

    def test_the_users_own_rust_environment_is_left_alone(self):
        self.toolchain()
        for name in ("CARGO_HOME", "RUSTUP_HOME"):
            self.assertNotIn(name, os.environ)


if __name__ == "__main__":
    unittest.main()
