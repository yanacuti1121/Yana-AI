"""Giai đoạn toolchain (tự cài Rust có kiểm sha256) của bộ cài hệ thống Yana (cùng cách chạy với test_system_install.py)."""

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
        with mock.patch.object(toolchain, "MAX_DOWNLOAD_BYTES", 5):
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
        with mock.patch.object(toolchain, "rust_triple", return_value=None):
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
