"""Importing this module silences desktop notifications for every Giám thị test.

The tests run the real watcher in throwaway repositories, and most of them
provoke a HALT on purpose. Without this, each HALT would raise a real macOS
notification (osascript / terminal-notifier) on the developer's desktop.
"""

from __future__ import annotations

import atexit
import os
import shutil
import tempfile
from pathlib import Path

# Taken before PATH is patched: tests that install their own fake notifier
# need to know whether a real one would shadow it.
REAL_NOTIFIER_PRESENT = shutil.which("terminal-notifier") is not None

# Tests that install their own fake notifier build PATH from this one, so the
# silent stubs below cannot shadow (or be mistaken for) the fake.
ORIGINAL_PATH = os.environ.get("PATH", "")

_QUIET_DIR = tempfile.mkdtemp(prefix="giamthi-quiet-")
atexit.register(shutil.rmtree, _QUIET_DIR, True)
for _name in ("osascript", "terminal-notifier"):
    _stub = Path(_QUIET_DIR) / _name
    _stub.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    _stub.chmod(0o755)
os.environ["PATH"] = _QUIET_DIR + os.pathsep + os.environ.get("PATH", "")
