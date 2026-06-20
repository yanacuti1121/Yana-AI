"""Channel lifecycle health evaluation -- pure state machine over a runtime snapshot.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/channel-health-policy.ts (MIT)
Ported:  2026-06-20. Direct translation -- pure function over a snapshot
         dict, no external deps (the `ChannelId` TS type was just a string
         alias at the call site).
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: decide whether a long-lived connection/worker (channel account,
WS connection, subprocess -- anything with start/connect/activity
timestamps) is healthy or needs a restart, using grace periods so restart
churn isn't triggered by ordinary startup/idle windows. Generically useful
wherever Yana AI tracks a long-lived external connection's liveness
(55-observability-telemetry-law.md span-gap heartbeat checks, 56-circuit-
breaker-law.md health probes).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping

ChannelHealthEvaluationReason = Literal[
    "healthy",
    "unmanaged",
    "not-running",
    "busy",
    "stuck",
    "startup-connect-grace",
    "disconnected",
    "stale-socket",
]

ChannelRestartReason = Literal["gave-up", "stopped", "stale-socket", "stuck", "disconnected"]

BUSY_ACTIVITY_STALE_THRESHOLD_MS = 25 * 60_000
# Keep these shared between the background health monitor and on-demand readiness
# probes so both surfaces evaluate channel lifecycle windows consistently.
DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS = 30 * 60_000
DEFAULT_CHANNEL_CONNECT_GRACE_MS = 120_000


@dataclass(frozen=True)
class ChannelHealthEvaluation:
    healthy: bool
    reason: ChannelHealthEvaluationReason


@dataclass(frozen=True)
class ChannelHealthPolicy:
    channel_id: str
    now: float
    stale_event_threshold_ms: float
    channel_connect_grace_ms: float


def _is_managed_account(snapshot: Mapping[str, Any]) -> bool:
    return snapshot.get("enabled") is not False and snapshot.get("configured") is not False


def _as_finite_number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def evaluate_channel_health(
    snapshot: Mapping[str, Any], policy: ChannelHealthPolicy
) -> ChannelHealthEvaluation:
    if not _is_managed_account(snapshot):
        return ChannelHealthEvaluation(healthy=True, reason="unmanaged")
    if not snapshot.get("running"):
        return ChannelHealthEvaluation(healthy=False, reason="not-running")

    active_runs_raw = _as_finite_number(snapshot.get("activeRuns"))
    active_runs = max(0, int(active_runs_raw)) if active_runs_raw is not None else 0
    is_busy = snapshot.get("busy") is True or active_runs > 0
    last_start_at = _as_finite_number(snapshot.get("lastStartAt"))
    last_run_activity_at = _as_finite_number(snapshot.get("lastRunActivityAt"))
    last_transport_activity_at = _as_finite_number(snapshot.get("lastTransportActivityAt"))
    busy_state_initialized_for_lifecycle = last_start_at is None or (
        last_run_activity_at is not None and last_run_activity_at >= last_start_at
    )

    # Runtime snapshots are patch-merged, so a restarted lifecycle can temporarily
    # inherit stale busy fields from the previous instance. Ignore busy short-circuit
    # until run activity is known to belong to the current lifecycle.
    if is_busy and busy_state_initialized_for_lifecycle:
        run_activity_age = (
            float("inf")
            if last_run_activity_at is None
            else max(0.0, policy.now - last_run_activity_at)
        )
        if run_activity_age < BUSY_ACTIVITY_STALE_THRESHOLD_MS:
            return ChannelHealthEvaluation(healthy=True, reason="busy")
        return ChannelHealthEvaluation(healthy=False, reason="stuck")
    # else: fall through to normal startup/disconnect checks below.

    if last_start_at is not None:
        up_duration = policy.now - last_start_at
        if up_duration < policy.channel_connect_grace_ms:
            return ChannelHealthEvaluation(healthy=True, reason="startup-connect-grace")

    if snapshot.get("connected") is False:
        return ChannelHealthEvaluation(healthy=False, reason="disconnected")

    # App-level events are not socket liveness: quiet Slack/Discord workspaces can
    # go idle while their upstream clients maintain heartbeats internally.
    should_check_stale_socket = (
        snapshot.get("connected") is True and last_transport_activity_at is not None
    )
    if should_check_stale_socket:
        if last_start_at is not None and last_transport_activity_at < last_start_at:
            lifecycle_event_gap = max(0.0, policy.now - last_start_at)
            if lifecycle_event_gap <= policy.stale_event_threshold_ms:
                return ChannelHealthEvaluation(healthy=True, reason="healthy")
            return ChannelHealthEvaluation(healthy=False, reason="stale-socket")
        event_age = policy.now - last_transport_activity_at
        if event_age > policy.stale_event_threshold_ms:
            return ChannelHealthEvaluation(healthy=False, reason="stale-socket")

    return ChannelHealthEvaluation(healthy=True, reason="healthy")


def resolve_channel_restart_reason(
    snapshot: Mapping[str, Any], evaluation: ChannelHealthEvaluation
) -> ChannelRestartReason:
    """Restart reasons are intentionally coarse: downstream logs/UI need stable categories."""
    if evaluation.reason == "stale-socket":
        return "stale-socket"
    if evaluation.reason == "not-running":
        reconnect_attempts = snapshot.get("reconnectAttempts")
        return "gave-up" if isinstance(reconnect_attempts, (int, float)) and reconnect_attempts >= 10 else "stopped"
    if evaluation.reason == "disconnected":
        return "disconnected"
    return "stuck"
