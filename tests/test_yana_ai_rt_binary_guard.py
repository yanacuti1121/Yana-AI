"""Regression test for the yana-rt fork-bomb bug (2026-09-17).

Live incident: a real machine's pip/pipx install of yana-ai had
`~/.local/bin/yana-rt` (a setuptools console_scripts shim) on $PATH.
src/yana_ai/rt.py's `_usable()` guard was supposed to reject exactly this
case ("never re-invoke this wrapper itself") but only compared the
candidate's realpath against this module's own file path -- and a
console_scripts shim is a *different* file (bin/yana-rt) from the module
it imports (site-packages/yana_ai/rt.py), so the check silently never
fired. `_run()` then subprocess.run()'d the shim, which re-imported this
module and repeated the lookup -- hundreds of self-replicating processes,
system load average over 490, before the shim was manually disabled.

The fix (`_looks_like_native_binary`) checks magic bytes instead of a
path comparison: a real yana-rt is always a compiled binary, and a
console_scripts shim -- or any other script wrongly named yana-rt -- is
always text starting with `#!`. This test reproduces the exact shim
content from the incident as a fixture and proves both the old failure
mode (realpath comparison alone would have passed it) and the fix
(_usable now rejects it).
"""
from __future__ import annotations

import importlib.util
import os
import stat
import sys
from pathlib import Path

import pytest

_RT_PATH = Path(__file__).resolve().parent.parent / "src" / "yana_ai" / "rt.py"

# The exact shim content pip/pipx generated on the real machine during the
# incident (console_scripts entry point for `yana-rt = yana_ai.rt:main`).
_REAL_INCIDENT_SHIM = (
    "#!/bin/sh\n"
    "'''exec' \"/Users/vutam/Library/Application Support/pipx/venvs/yana-ai/bin/python\" \"$0\" \"$@\"\n"
    "' '''\n"
    "import sys\n"
    "from yana_ai.rt import main\n"
    "if __name__ == '__main__':\n"
    "    sys.argv[0] = sys.argv[0].removesuffix('.exe')\n"
    "    sys.exit(main())\n"
)


@pytest.fixture()
def rt_module():
    spec = importlib.util.spec_from_file_location("_yana_ai_rt_under_test", _RT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_executable(path: Path, content_bytes: bytes) -> Path:
    path.write_bytes(content_bytes)
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return path


# ── _looks_like_native_binary ───────────────────────────────────────────

def test_rejects_the_real_incident_shim_content(rt_module, tmp_path):
    shim = _make_executable(tmp_path / "yana-rt", _REAL_INCIDENT_SHIM.encode())
    assert rt_module._looks_like_native_binary(shim) is False


def test_rejects_generic_shebang_script(rt_module, tmp_path):
    script = _make_executable(tmp_path / "yana-rt", b"#!/bin/bash\necho hi\n")
    assert rt_module._looks_like_native_binary(script) is False


def test_rejects_empty_file(rt_module, tmp_path):
    empty = _make_executable(tmp_path / "yana-rt", b"")
    assert rt_module._looks_like_native_binary(empty) is False


def test_accepts_elf_magic(rt_module, tmp_path):
    fake_elf = _make_executable(tmp_path / "yana-rt", b"\x7fELF" + b"\x00" * 60)
    assert rt_module._looks_like_native_binary(fake_elf) is True


def test_accepts_macho64_magic(rt_module, tmp_path):
    fake_macho = _make_executable(tmp_path / "yana-rt", b"\xcf\xfa\xed\xfe" + b"\x00" * 60)
    assert rt_module._looks_like_native_binary(fake_macho) is True


def test_accepts_pe_magic(rt_module, tmp_path):
    fake_pe = _make_executable(tmp_path / "yana-rt.exe", b"MZ" + b"\x00" * 60)
    assert rt_module._looks_like_native_binary(fake_pe) is True


def test_accepts_a_real_system_binary_as_ground_truth(rt_module):
    # /bin/ls is a real compiled binary on every macOS/Linux CI runner --
    # this is the sanity check that the magic-byte set actually matches
    # what real executables look like, not just synthetic fixtures.
    real_binary = Path("/bin/ls")
    if not real_binary.exists():
        pytest.skip("/bin/ls not present on this platform")
    assert rt_module._looks_like_native_binary(real_binary) is True


# ── _usable — the actual guard used by _find_binary ─────────────────────

def test_usable_rejects_the_incident_shim_even_though_realpath_differs(rt_module, tmp_path):
    """This is the exact bug: the shim's realpath is NOT this module's own
    file, so a realpath-only check would incorrectly call it usable. The
    fixed _usable must reject it anyway, via the binary-magic check."""
    shim = _make_executable(tmp_path / "yana-rt", _REAL_INCIDENT_SHIM.encode())
    # Prove the premise: realpath comparison alone would NOT have caught this.
    assert str(shim.resolve()) != rt_module._SELF_REALPATH
    assert rt_module._usable(str(shim)) is False


def test_usable_rejects_a_symlink_to_the_incident_shim(rt_module, tmp_path):
    # Matches the real deployment shape: ~/.local/bin/yana-rt was a
    # symlink into the pipx venv's own bin/ directory.
    real_shim_dir = tmp_path / "venv_bin"
    real_shim_dir.mkdir()
    real_shim = _make_executable(real_shim_dir / "yana-rt", _REAL_INCIDENT_SHIM.encode())
    symlink = tmp_path / "local_bin_yana-rt"
    symlink.symlink_to(real_shim)
    assert rt_module._usable(str(symlink)) is False


def test_usable_accepts_a_real_binary_not_self(rt_module, tmp_path):
    fake_elf = _make_executable(tmp_path / "yana-rt", b"\x7fELF" + b"\x00" * 60)
    assert rt_module._usable(str(fake_elf)) is True


def test_usable_rejects_nonexistent_path(rt_module, tmp_path):
    assert rt_module._usable(str(tmp_path / "does-not-exist")) is False


def test_usable_rejects_none(rt_module):
    assert rt_module._usable(None) is False


def test_usable_rejects_non_executable_binary(rt_module, tmp_path):
    fake_elf = tmp_path / "yana-rt"
    fake_elf.write_bytes(b"\x7fELF" + b"\x00" * 60)
    # deliberately not chmod +x
    assert rt_module._usable(str(fake_elf)) is False


def test_usable_rejects_this_module_file_itself(rt_module):
    # rt.py itself is neither executable nor binary, so this already
    # fails before reaching the realpath branch -- covered separately
    # below with a fixture that isolates that specific check.
    assert rt_module._usable(str(_RT_PATH)) is False


def test_usable_realpath_check_alone_rejects_an_executable_copy_of_self(rt_module, tmp_path):
    """Isolates the defense-in-depth realpath branch specifically: a file
    that IS executable and DOES look like a binary, but whose realpath is
    forced to equal _SELF_REALPATH, must still be rejected -- proving the
    realpath check fires on its own, not only as an accidental side effect
    of the binary-magic check."""
    candidate = _make_executable(tmp_path / "yana-rt", b"\x7fELF" + b"\x00" * 60)
    original_resolve = Path.resolve

    def fake_resolve(self, *args, **kwargs):
        if str(self) == str(candidate):
            return Path(rt_module._SELF_REALPATH)
        return original_resolve(self, *args, **kwargs)

    rt_module.Path.resolve = fake_resolve
    try:
        assert rt_module._usable(str(candidate)) is False
    finally:
        rt_module.Path.resolve = original_resolve
