"""In-memory sliding-window rate limiter for gateway authentication attempts.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/auth-rate-limit.ts (MIT)
Ported:  2026-06-20. Direct translation of the limiter itself (pure in-memory
         Map, side-effect-free factory). `normalizeRateLimitClientIp` called
         `resolveClientIp` from `./net.ts`, which (with only `remoteAddr`
         passed, as this call site does) reduces to `normalizeIp` ->
         `normalizeIpAddress` from `@openclaw/net-policy/ip` -- a package
         not fetched for this port. Re-implemented IP normalization and
         loopback detection using Python's stdlib `ipaddress` module instead
         of chasing that import chain; documented here rather than claimed
         as a verbatim port of that piece.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Tracks failed auth attempts by (scope, client_ip). A scope lets callers keep
independent counters for different credential classes while sharing one
limiter instance. Loopback addresses are exempt by default so local CLI
sessions are never locked out. Periodic pruning avoids unbounded growth.
"""
from __future__ import annotations

import ipaddress
import time
from dataclasses import dataclass, field

from .number_coercion import resolve_timer_timeout_ms

AUTH_RATE_LIMIT_SCOPE_DEFAULT = "default"
AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET = "shared-secret"
AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN = "device-token"
# Per-IP gate for node-role pairing requests created during WebSocket connect.
AUTH_RATE_LIMIT_SCOPE_NODE_PAIRING = "node-pairing"
# Paired-node approval-surface changes use a dedicated limiter so reconnect
# storms cannot queue unbounded writes behind the shared pairing-state lock.
AUTH_RATE_LIMIT_SCOPE_NODE_REAPPROVAL = "node-reapproval"
# Per-IP gate for the pre-auth bootstrap-token verify path -- without a
# scope-specific limiter, attackers presenting a valid device signature can
# queue the bootstrap-pairing flow behind their requests, blocking
# legitimate node onboarding during the attack.
AUTH_RATE_LIMIT_SCOPE_BOOTSTRAP_TOKEN = "bootstrap-token"
AUTH_RATE_LIMIT_SCOPE_HOOK_AUTH = "hook-auth"
_BROWSER_ORIGIN_RATE_LIMIT_KEY_PREFIX = "browser-origin:"
_IDENTITY_RATE_LIMIT_KEY_PREFIX = "identity:"

_DEFAULT_MAX_ATTEMPTS = 10
_DEFAULT_WINDOW_MS = 60_000  # 1 minute
_DEFAULT_LOCKOUT_MS = 300_000  # 5 minutes


def is_loopback_address(ip: str | None) -> bool:
    """True for 127.0.0.0/8 and ::1 -- re-implemented via Python's ipaddress stdlib."""
    if not ip:
        return False
    try:
        return ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return False


def _normalize_ip(ip: str | None) -> str | None:
    """Strip brackets/zone-id and canonicalize IPv4-mapped IPv6 forms."""
    if not ip:
        return None
    candidate = ip.strip()
    if candidate.startswith("[") and candidate.endswith("]"):
        candidate = candidate[1:-1]
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return candidate or None


def normalize_rate_limit_client_ip(ip: str | None) -> str:
    """Canonicalize client IPs used for auth throttling so all call sites share one representation."""
    if isinstance(ip, str) and (
        ip.startswith(_BROWSER_ORIGIN_RATE_LIMIT_KEY_PREFIX) or ip.startswith(_IDENTITY_RATE_LIMIT_KEY_PREFIX)
    ):
        return ip
    return _normalize_ip(ip) or "unknown"


def build_rate_limit_identity_key(namespace: str, identity: str) -> str:
    """Build an opaque limiter identity that is not subject to loopback IP exemptions."""
    return f"{_IDENTITY_RATE_LIMIT_KEY_PREFIX}{namespace}:{identity}"


@dataclass
class RateLimitCheckResult:
    allowed: bool
    remaining: int
    retry_after_ms: float


@dataclass
class _RateLimitEntry:
    attempts: list[float] = field(default_factory=list)
    locked_until: float | None = None


class AuthRateLimiter:
    """Pure in-memory limiter. Caller creates an instance and shares it; no timers run on its own --
    call `prune()` periodically (the original used a self-managed `setInterval`; ported here as an
    explicit method so this module has no background timers/threads of its own)."""

    def __init__(
        self,
        max_attempts: int | None = None,
        window_ms: float | None = None,
        lockout_ms: float | None = None,
        exempt_loopback: bool = True,
    ) -> None:
        self._max_attempts = max_attempts if max_attempts is not None else _DEFAULT_MAX_ATTEMPTS
        self._window_ms = resolve_timer_timeout_ms(window_ms, _DEFAULT_WINDOW_MS, 0)
        self._lockout_ms = resolve_timer_timeout_ms(lockout_ms, _DEFAULT_LOCKOUT_MS, 0)
        self._exempt_loopback = exempt_loopback
        self._entries: dict[str, _RateLimitEntry] = {}

    def _normalize_scope(self, scope: str | None) -> str:
        return (scope or AUTH_RATE_LIMIT_SCOPE_DEFAULT).strip() or AUTH_RATE_LIMIT_SCOPE_DEFAULT

    def _resolve_key(self, raw_ip: str | None, raw_scope: str | None) -> tuple[str, str]:
        ip = normalize_rate_limit_client_ip(raw_ip)
        scope = self._normalize_scope(raw_scope)
        return f"{scope}:{ip}", ip

    def _is_exempt(self, ip: str) -> bool:
        return self._exempt_loopback and is_loopback_address(ip)

    def _slide_window(self, entry: _RateLimitEntry, now: float) -> None:
        cutoff = now - self._window_ms
        entry.attempts = [ts for ts in entry.attempts if ts > cutoff]

    def check(self, ip: str | None, scope: str | None = None) -> RateLimitCheckResult:
        """Check whether `ip` is currently allowed to attempt authentication."""
        key, norm_ip = self._resolve_key(ip, scope)
        if self._is_exempt(norm_ip):
            return RateLimitCheckResult(allowed=True, remaining=self._max_attempts, retry_after_ms=0)

        now = time.time() * 1000
        entry = self._entries.get(key)
        if entry is None:
            return RateLimitCheckResult(allowed=True, remaining=self._max_attempts, retry_after_ms=0)

        if entry.locked_until is not None and now < entry.locked_until:
            return RateLimitCheckResult(allowed=False, remaining=0, retry_after_ms=entry.locked_until - now)

        if entry.locked_until is not None and now >= entry.locked_until:
            entry.locked_until = None
            entry.attempts = []

        self._slide_window(entry, now)
        remaining = max(0, self._max_attempts - len(entry.attempts))
        return RateLimitCheckResult(allowed=remaining > 0, remaining=remaining, retry_after_ms=0)

    def record_failure(self, ip: str | None, scope: str | None = None) -> None:
        """Record a failed authentication attempt for `ip`."""
        key, norm_ip = self._resolve_key(ip, scope)
        if self._is_exempt(norm_ip):
            return

        now = time.time() * 1000
        entry = self._entries.setdefault(key, _RateLimitEntry())

        if entry.locked_until is not None and now < entry.locked_until:
            return  # Already locked -- do nothing.

        self._slide_window(entry, now)
        entry.attempts.append(now)

        if len(entry.attempts) >= self._max_attempts:
            entry.locked_until = now + self._lockout_ms

    def reset(self, ip: str | None, scope: str | None = None) -> None:
        """Reset the rate-limit state for `ip` (e.g. after a successful login)."""
        key, _ = self._resolve_key(ip, scope)
        self._entries.pop(key, None)

    def prune(self) -> None:
        """Remove expired entries and release memory."""
        now = time.time() * 1000
        stale_keys = []
        for key, entry in self._entries.items():
            if entry.locked_until is not None and now < entry.locked_until:
                continue  # Keep locked entries until the lockout expires.
            self._slide_window(entry, now)
            if not entry.attempts:
                stale_keys.append(key)
        for key in stale_keys:
            del self._entries[key]

    def size(self) -> int:
        return len(self._entries)
