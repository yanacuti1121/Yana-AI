"""Phần dùng chung của các test bộ cài hệ thống Yana: script giả, chạy CLI, lớp nền Base."""

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

from yana_install import cli, seed, stages, toolchain  # noqa: E402

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
