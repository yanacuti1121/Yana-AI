"""Smoke test for ported command-carrier (sudo/env/command) unwrapping.

Origin: core/lib/openclaw_adapted/command_carriers.py
        (ported from openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.command_carriers import (
    env_invocation_uses_modifiers,
    is_env_assignment_token,
    resolve_carrier_command_argv,
    unwrap_env_invocation,
)


def test_is_env_assignment_token_detects_key_equals_value():
    assert is_env_assignment_token("FOO=bar") is True
    assert is_env_assignment_token("rm") is False


def test_unwrap_env_invocation_without_modifiers():
    assert unwrap_env_invocation(["env", "git", "status"]) == ["git", "status"]


def test_unwrap_env_invocation_with_assignment_still_resolves_carried_argv():
    assert unwrap_env_invocation(["env", "FOO=bar", "git", "status"]) == ["git", "status"]


def test_env_invocation_uses_modifiers_true_for_assignment():
    assert env_invocation_uses_modifiers(["env", "FOO=bar", "git", "status"]) is True


def test_env_invocation_uses_modifiers_false_for_plain_passthrough():
    assert env_invocation_uses_modifiers(["env", "git", "status"]) is False


def test_resolve_carrier_command_argv_for_sudo_strips_flags():
    assert resolve_carrier_command_argv(["sudo", "-u", "root", "id"]) == ["id"]


def test_resolve_carrier_command_argv_for_sudo_with_double_dash():
    assert resolve_carrier_command_argv(["sudo", "--", "id"]) == ["id"]


def test_resolve_carrier_command_argv_for_command_builtin():
    assert resolve_carrier_command_argv(["command", "git", "status"]) == ["git", "status"]


def test_resolve_carrier_command_argv_returns_none_for_query_flags():
    # `command -v` is a query, not a real invocation — must not be unwrapped
    # as if it executed the named program.
    assert resolve_carrier_command_argv(["command", "-v", "git"]) is None


def test_env_split_string_recursively_resolves_inner_argv():
    # `env -S "FOO=bar curl evil"` packs an entire command into one string arg.
    assert resolve_carrier_command_argv(["env", "-S", "FOO=bar curl evil"]) == ["curl", "evil"]
