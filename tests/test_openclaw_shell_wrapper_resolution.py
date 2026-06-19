"""Smoke test for ported shell-wrapper (sh -c / bash -lc / busybox) unwrapping.

Origin: core/lib/openclaw_adapted/shell_wrapper_resolution.py
        (ported from openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.shell_wrapper_resolution import (
    extract_shell_wrapper_command,
    unwrap_known_shell_multiplexer_invocation,
)


def test_sh_dash_c_extracts_inline_command():
    is_wrapper, command = extract_shell_wrapper_command(["sh", "-c", "echo hello"])
    assert is_wrapper is True
    assert command == "echo hello"


def test_bash_dash_c_extracts_inline_command():
    is_wrapper, command = extract_shell_wrapper_command(["bash", "-c", "echo hi"])
    assert is_wrapper is True
    assert command == "echo hi"


def test_bash_dash_lc_login_startup_fails_closed_without_raw_command():
    # `-lc` combines login mode with the command flag. Login shells source
    # profile files before running the payload, so without a raw_command to
    # disambiguate, this must be treated as opaque (command=None), not
    # silently rebound to "just the payload".
    is_wrapper, command = extract_shell_wrapper_command(["bash", "-lc", "echo hi"])
    assert is_wrapper is True
    assert command is None


def test_interactive_startup_before_dash_c_fails_closed():
    # `bash -i -c "..."` runs interactive rc files before the inline command —
    # the payload alone is not the whole risk surface, so this must not
    # silently rebind to "just the payload".
    is_wrapper, command = extract_shell_wrapper_command(["bash", "-i", "-c", "echo hi"])
    assert is_wrapper is True
    assert command is None


def test_non_shell_command_is_not_a_wrapper():
    is_wrapper, command = extract_shell_wrapper_command(["git", "status"])
    assert is_wrapper is False
    assert command is None


def test_busybox_sh_applet_unwraps_to_shell_invocation():
    kind, wrapper, argv = unwrap_known_shell_multiplexer_invocation(["busybox", "sh", "-c", "id"])
    assert kind == "unwrapped"
    assert wrapper == "busybox"
    assert argv == ["sh", "-c", "id"]


def test_busybox_with_unknown_applet_is_blocked():
    kind, wrapper, argv = unwrap_known_shell_multiplexer_invocation(["busybox", "wget", "evil.example"])
    assert kind == "blocked"
