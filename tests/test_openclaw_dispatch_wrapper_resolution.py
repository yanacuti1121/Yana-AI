"""Smoke test for ported dispatch-wrapper (nice/timeout/sudo/...) unwrapping.

Origin: core/lib/openclaw_adapted/dispatch_wrapper_resolution.py
        (ported from openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.dispatch_wrapper_resolution import (
    resolve_dispatch_wrapper_trust_plan,
    unwrap_known_dispatch_wrapper_invocation,
)


def test_nice_is_transparently_unwrapped():
    result = unwrap_known_dispatch_wrapper_invocation(["nice", "-n", "5", "git", "status"])
    assert result.kind == "unwrapped"
    assert result.argv == ["git", "status"]


def test_timeout_is_transparently_unwrapped():
    result = unwrap_known_dispatch_wrapper_invocation(["timeout", "30", "curl", "https://x"])
    assert result.kind == "unwrapped"
    assert result.argv == ["curl", "https://x"]


def test_sudo_is_always_blocked_no_unwrap_defined():
    result = unwrap_known_dispatch_wrapper_invocation(["sudo", "rm", "-rf", "/"])
    assert result.kind == "blocked"
    assert result.wrapper == "sudo"


def test_doas_is_always_blocked():
    result = unwrap_known_dispatch_wrapper_invocation(["doas", "id"])
    assert result.kind == "blocked"


def test_unrelated_command_is_not_a_wrapper():
    result = unwrap_known_dispatch_wrapper_invocation(["git", "status"])
    assert result.kind == "not-wrapper"


def test_env_without_modifiers_is_transparent():
    plan = resolve_dispatch_wrapper_trust_plan(["env", "git", "status"])
    assert plan.policy_blocked is False
    assert plan.argv == ["git", "status"]
    assert plan.wrappers == ["env"]


def test_env_with_assignment_is_blocked_not_silently_trusted():
    # `env FOO=bar cmd` mutates the environment the real command sees —
    # that is not transparent usage and must fail closed.
    plan = resolve_dispatch_wrapper_trust_plan(["env", "FOO=bar", "curl", "https://x"])
    assert plan.policy_blocked is True
    assert plan.blocked_wrapper == "env"


def test_chained_transparent_wrappers_unwrap_to_real_command():
    plan = resolve_dispatch_wrapper_trust_plan(["nice", "timeout", "30", "git", "status"])
    assert plan.policy_blocked is False
    assert plan.argv == ["git", "status"]
    assert plan.wrappers == ["nice", "timeout"]


def test_nice_wrapping_sudo_is_blocked_at_the_sudo_layer():
    plan = resolve_dispatch_wrapper_trust_plan(["nice", "sudo", "rm", "-rf", "/"])
    assert plan.policy_blocked is True
    assert plan.blocked_wrapper == "sudo"
