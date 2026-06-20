"""Tests for the second openclaw_adapted batch (gateway rate-limit/health/sanitize ports).

Origin: core/lib/openclaw_adapted/{auth_rate_limit,control_plane_rate_limit,
        boot_echo_guard,unauthorized_flood_guard,rate_limit_attempt_serialization,
        channel_health_policy,active_sessions_shutdown_tracker,chat_input_sanitize,
        node_command_policy}.py (ported from openclaw/openclaw, MIT)
"""
import asyncio

import pytest

from core.lib.openclaw_adapted.active_sessions_shutdown_tracker import (
    ActiveSessionForShutdown,
    ActiveSessionsShutdownTracker,
)
from core.lib.openclaw_adapted.auth_rate_limit import (
    AuthRateLimiter,
    is_loopback_address,
    normalize_rate_limit_client_ip,
)
from core.lib.openclaw_adapted.boot_echo_guard import BootEchoGuard
from core.lib.openclaw_adapted.chat_input_sanitize import sanitize_chat_send_message_input
from core.lib.openclaw_adapted.channel_health_policy import (
    ChannelHealthPolicy,
    DEFAULT_CHANNEL_CONNECT_GRACE_MS,
    DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS,
    evaluate_channel_health,
    resolve_channel_restart_reason,
)
from core.lib.openclaw_adapted.control_plane_rate_limit import ControlPlaneRateLimiter
from core.lib.openclaw_adapted.node_command_policy import (
    is_node_command_allowed,
    normalize_platform_id,
    resolve_node_command_allowlist,
)
from core.lib.openclaw_adapted.rate_limit_attempt_serialization import RateLimitAttemptSerializer
from core.lib.openclaw_adapted.unauthorized_flood_guard import (
    UnauthorizedFloodGuard,
    is_unauthorized_role_error,
)


# -- chat_input_sanitize --


def test_chat_sanitize_rejects_null_byte():
    result = sanitize_chat_send_message_input("hello" + chr(0) + "world")
    assert result.ok is False


def test_chat_sanitize_strips_control_chars_keeps_tab_newline():
    result = sanitize_chat_send_message_input("a\tb\nc" + chr(7) + "d")
    assert result.ok is True
    assert result.message == "a\tb\ncd"


# -- boot_echo_guard --


def test_boot_echo_guard_detects_substantial_echo():
    guard = BootEchoGuard()
    boot_prompt = "x" * 100
    assert guard.contains_substantial_boot_echo("prefix " + boot_prompt + " suffix", boot_prompt) is True


def test_boot_echo_guard_short_prompt_never_triggers():
    guard = BootEchoGuard()
    assert guard.contains_substantial_boot_echo("good morning", "good morning") is False


def test_boot_echo_guard_strips_echo_to_empty():
    guard = BootEchoGuard()
    boot_prompt = "y" * 100
    assert guard.strip_boot_echo_from_outbound_text(boot_prompt, boot_prompt) == ""
    assert guard.strip_boot_echo_from_outbound_text("unrelated text", boot_prompt) == "unrelated text"


# -- auth_rate_limit --


def test_loopback_addresses_exempt_and_detected():
    assert is_loopback_address("127.0.0.1") is True
    assert is_loopback_address("::1") is True
    assert is_loopback_address("8.8.8.8") is False
    assert is_loopback_address(None) is False


def test_auth_rate_limiter_locks_out_after_max_attempts():
    rl = AuthRateLimiter(max_attempts=3, window_ms=60_000, lockout_ms=120_000, exempt_loopback=True)
    for _ in range(3):
        rl.record_failure("1.2.3.4")
    result = rl.check("1.2.3.4")
    assert result.allowed is False
    assert result.retry_after_ms > 0


def test_auth_rate_limiter_exempts_loopback():
    rl = AuthRateLimiter(max_attempts=1, exempt_loopback=True)
    rl.record_failure("127.0.0.1")
    rl.record_failure("127.0.0.1")
    assert rl.check("127.0.0.1").allowed is True


def test_auth_rate_limiter_reset_clears_lockout():
    rl = AuthRateLimiter(max_attempts=1, lockout_ms=60_000, exempt_loopback=False)
    rl.record_failure("9.9.9.9")
    assert rl.check("9.9.9.9").allowed is False
    rl.reset("9.9.9.9")
    assert rl.check("9.9.9.9").allowed is True


def test_normalize_rate_limit_client_ip_preserves_identity_prefix():
    assert normalize_rate_limit_client_ip("identity:foo:bar") == "identity:foo:bar"


# -- control_plane_rate_limit --


def test_control_plane_rate_limit_allows_then_blocks():
    rl = ControlPlaneRateLimiter()
    client = {"connect": {"device": {"id": "dev1"}}, "clientIp": "1.2.3.4"}
    outcomes = [rl.consume_control_plane_write_budget(client, now_ms=1000)["allowed"] for _ in range(4)]
    assert outcomes == [True, True, True, False]


def test_control_plane_rate_limit_prunes_stale_buckets():
    rl = ControlPlaneRateLimiter()
    rl.consume_control_plane_write_budget({"clientIp": "1.1.1.1"}, now_ms=0)
    assert rl.prune_stale_control_plane_buckets(now_ms=0) == 0
    assert rl.prune_stale_control_plane_buckets(now_ms=6 * 60_000) == 1
    assert rl.bucket_count_for_tests() == 0


# -- unauthorized_flood_guard --


def test_unauthorized_flood_guard_closes_after_threshold():
    guard = UnauthorizedFloodGuard(close_after=2, log_every=10)
    decisions = [guard.register_unauthorized() for _ in range(3)]
    assert decisions[-1].should_close is True


def test_unauthorized_flood_guard_suppresses_log_spam():
    guard = UnauthorizedFloodGuard(close_after=100, log_every=5)
    decisions = [guard.register_unauthorized() for _ in range(5)]
    assert decisions[0].should_log is True  # first always logs
    assert decisions[1].should_log is False
    assert decisions[4].should_log is True  # 5th hits log_every
    assert decisions[4].suppressed_since_last_log == 3


def test_is_unauthorized_role_error_classifier():
    assert is_unauthorized_role_error("INVALID_REQUEST", "unauthorized role: node") is True
    assert is_unauthorized_role_error("OTHER", "unauthorized role: node") is False
    assert is_unauthorized_role_error("INVALID_REQUEST", "some other message") is False


# -- rate_limit_attempt_serialization --


def test_serialization_runs_same_key_one_at_a_time():
    async def scenario():
        serializer = RateLimitAttemptSerializer()
        active = 0
        max_active = 0

        async def make_run():
            async def run():
                nonlocal active, max_active
                active += 1
                max_active = max(max_active, active)
                await asyncio.sleep(0.02)
                active -= 1
                return True

            return await serializer.with_serialized_rate_limit_attempt("1.2.3.4", None, run)

        await asyncio.gather(*(make_run() for _ in range(4)))
        return max_active

    assert asyncio.run(scenario()) == 1


def test_serialization_different_keys_run_concurrently():
    async def scenario():
        serializer = RateLimitAttemptSerializer()

        async def run():
            await asyncio.sleep(0.05)
            return True

        import time

        start = time.monotonic()
        await asyncio.gather(
            serializer.with_serialized_rate_limit_attempt("1.1.1.1", None, run),
            serializer.with_serialized_rate_limit_attempt("2.2.2.2", None, run),
        )
        return time.monotonic() - start

    elapsed = asyncio.run(scenario())
    assert elapsed < 0.09  # would be ~0.1s if serialized globally


# -- channel_health_policy --


def _policy(now: float) -> ChannelHealthPolicy:
    return ChannelHealthPolicy(
        channel_id="slack",
        now=now,
        stale_event_threshold_ms=DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS,
        channel_connect_grace_ms=DEFAULT_CHANNEL_CONNECT_GRACE_MS,
    )


def test_channel_health_unmanaged_is_always_healthy():
    evaluation = evaluate_channel_health({"enabled": False}, _policy(0))
    assert evaluation.healthy is True
    assert evaluation.reason == "unmanaged"


def test_channel_health_not_running():
    evaluation = evaluate_channel_health({"running": False}, _policy(0))
    assert evaluation.healthy is False
    assert evaluation.reason == "not-running"


def test_channel_health_stale_socket_after_threshold():
    now = 10_000_000
    evaluation = evaluate_channel_health(
        {"running": True, "connected": True, "lastTransportActivityAt": 0, "lastStartAt": 0}, _policy(now)
    )
    assert evaluation.healthy is False
    assert evaluation.reason == "stale-socket"
    assert resolve_channel_restart_reason({}, evaluation) == "stale-socket"


def test_channel_health_busy_within_threshold():
    now = 1_000_000
    evaluation = evaluate_channel_health(
        {"running": True, "busy": True, "lastRunActivityAt": now - 1000, "lastStartAt": 0}, _policy(now)
    )
    assert evaluation.healthy is True
    assert evaluation.reason == "busy"


# -- active_sessions_shutdown_tracker --


def test_shutdown_tracker_note_and_forget():
    tracker = ActiveSessionsShutdownTracker()
    tracker.note_active_session_for_shutdown(
        ActiveSessionForShutdown(cfg=None, session_key="k1", session_id="s1", store_path="/tmp")
    )
    assert len(tracker.list_active_sessions_for_shutdown()) == 1
    tracker.forget_active_session_for_shutdown("s1")
    assert len(tracker.list_active_sessions_for_shutdown()) == 0


def test_shutdown_tracker_ignores_empty_session_id():
    tracker = ActiveSessionsShutdownTracker()
    tracker.note_active_session_for_shutdown(
        ActiveSessionForShutdown(cfg=None, session_key="k1", session_id="", store_path="/tmp")
    )
    assert len(tracker.list_active_sessions_for_shutdown()) == 0


# -- node_command_policy --


def test_normalize_platform_id_exact_match_requires_matching_family():
    assert normalize_platform_id("android", "android") == "android"
    assert normalize_platform_id("android", "iphone") == "unknown"


def test_normalize_platform_id_ios_allows_empty_family():
    assert normalize_platform_id("ios", "") == "ios"


def test_resolve_node_command_allowlist_filters_desktop_host_commands_by_default():
    allow = resolve_node_command_allowlist(platform="linux", device_family="linux")
    assert "system.run" not in allow
    assert "system.notify" in allow


def test_resolve_node_command_allowlist_includes_desktop_host_commands_when_opted_in():
    allow = resolve_node_command_allowlist(
        platform="linux", device_family="linux", include_desktop_host_commands=True
    )
    assert "system.run" in allow


def test_resolve_node_command_allowlist_deny_overrides_allow():
    allow = resolve_node_command_allowlist(platform="ios", deny_commands=["camera.list"])
    assert "camera.list" not in allow


def test_is_node_command_allowed_requires_declared_commands():
    allow = resolve_node_command_allowlist(platform="ios")
    ok, reason = is_node_command_allowed("camera.list", allow, declared_commands=None)
    assert ok is False
    assert reason == "node did not declare commands"

    ok2, reason2 = is_node_command_allowed("camera.list", allow, declared_commands=["camera.list"])
    assert ok2 is True
    assert reason2 is None
