"""Control-plane write-side RPC rate limiter, keyed by device/IP identity.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/control-plane-rate-limit.ts (MIT)
Ported:  2026-06-20. Direct translation. `GatewayClient` was a TS type used
         only to read three optional fields (connect.device.id, clientIp,
         connId); ported as a plain Mapping lookup instead of importing the
         OpenClaw gateway client type graph. The original holds its bucket
         Map as module-level state with standalone functions; ported here as
         a class instance instead so state does not leak across test runs.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: sliding-window counter bounding write-side control-plane attempts
per device/IP, with a hard cap on tracked keys to prevent memory-DoS from
rapid unique-key injection (CWE-400) -- the gateway-side analogue of Yana
AI's resource-quota-law.md per-agent caps.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Mapping

CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS = 3
CONTROL_PLANE_RATE_LIMIT_WINDOW_MS = 60_000
CONTROL_PLANE_BUCKET_MAX_STALE_MS = 5 * 60_000
# Hard cap to prevent memory DoS from rapid unique-key injection (CWE-400).
CONTROL_PLANE_BUCKET_MAX_ENTRIES = 10_000


@dataclass
class _Bucket:
    count: int
    window_start_ms: float


class ControlPlaneRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}

    def _normalize_part(self, value: object, fallback: str) -> str:
        if not isinstance(value, str):
            return fallback
        normalized = value.strip()
        return normalized if normalized else fallback

    def resolve_control_plane_rate_limit_key(self, client: Mapping[str, Any] | None) -> str:
        """Builds a stable throttle key while avoiding shared fallback buckets for anonymous clients."""
        connect = (client or {}).get("connect") or {}
        device = connect.get("device") or {}
        device_id = self._normalize_part(device.get("id"), "unknown-device")
        client_ip = self._normalize_part((client or {}).get("clientIp"), "unknown-ip")
        if device_id == "unknown-device" and client_ip == "unknown-ip":
            # Last-resort fallback: avoid cross-client contention when upstream identity is missing.
            conn_id = self._normalize_part((client or {}).get("connId"), "")
            if conn_id:
                return f"{device_id}|{client_ip}|conn={conn_id}"
        return f"{device_id}|{client_ip}"

    def consume_control_plane_write_budget(
        self, client: Mapping[str, Any] | None, now_ms: float | None = None
    ) -> dict[str, Any]:
        """Consumes one write budget unit and reports retry state for gateway error responses."""
        now = now_ms if now_ms is not None else time.time() * 1000
        key = self.resolve_control_plane_rate_limit_key(client)
        bucket = self._buckets.get(key)

        if bucket is None or now - bucket.window_start_ms >= CONTROL_PLANE_RATE_LIMIT_WINDOW_MS:
            # Enforce hard cap before inserting a new key to bound memory usage
            # even between periodic prune sweeps.
            if key not in self._buckets and len(self._buckets) >= CONTROL_PLANE_BUCKET_MAX_ENTRIES:
                oldest = next(iter(self._buckets), None)
                if oldest is not None:
                    del self._buckets[oldest]
            self._buckets[key] = _Bucket(count=1, window_start_ms=now)
            return {
                "allowed": True,
                "retryAfterMs": 0,
                "remaining": CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS - 1,
                "key": key,
            }

        if bucket.count >= CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS:
            retry_after_ms = max(0, bucket.window_start_ms + CONTROL_PLANE_RATE_LIMIT_WINDOW_MS - now)
            return {"allowed": False, "retryAfterMs": retry_after_ms, "remaining": 0, "key": key}

        bucket.count += 1
        return {
            "allowed": True,
            "retryAfterMs": 0,
            "remaining": max(0, CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS - bucket.count),
            "key": key,
        }

    def prune_stale_control_plane_buckets(self, now_ms: float | None = None) -> int:
        """Remove buckets whose rate-limit window expired more than the stale threshold ago."""
        now = now_ms if now_ms is not None else time.time() * 1000
        stale_keys = [
            key
            for key, bucket in self._buckets.items()
            if now - bucket.window_start_ms > CONTROL_PLANE_BUCKET_MAX_STALE_MS
        ]
        for key in stale_keys:
            del self._buckets[key]
        return len(stale_keys)

    def bucket_count_for_tests(self) -> int:
        return len(self._buckets)

    def reset_for_tests(self) -> None:
        self._buckets.clear()
