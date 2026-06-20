"""Per-connection guard that suppresses noisy unauthorized-role retries.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/server/ws-connection/unauthorized-flood-guard.ts (MIT)
Ported:  2026-06-20. Direct translation. `isUnauthorizedRoleError` took an
         `ErrorShape` typed against OpenClaw's gateway-protocol error-code
         enum; ported here to take a plain (code, message) pair instead of
         importing that package, since the only thing read from it was
         `error.code === ErrorCodes.INVALID_REQUEST` and `error.message`.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: counts unauthorized-role failures on one connection and decides
when to log (with suppression to avoid log-spam) versus close the socket --
relevant to Yana AI's circuit-breaker-law.md / resource-quota-law.md spirit
for any per-connection abuse counter.
"""
from __future__ import annotations

from dataclasses import dataclass

from .number_coercion import resolve_integer_option

DEFAULT_CLOSE_AFTER = 10
DEFAULT_LOG_EVERY = 100

# The one error code this guard cares about, ported as a plain string so the
# caller does not need OpenClaw's gateway-protocol ErrorCodes enum.
INVALID_REQUEST_ERROR_CODE = "INVALID_REQUEST"


@dataclass(frozen=True)
class UnauthorizedFloodDecision:
    should_close: bool
    should_log: bool
    count: int
    suppressed_since_last_log: int


class UnauthorizedFloodGuard:
    def __init__(self, close_after: int | None = None, log_every: int | None = None) -> None:
        self._close_after = resolve_integer_option(close_after, DEFAULT_CLOSE_AFTER, min=1)
        self._log_every = resolve_integer_option(log_every, DEFAULT_LOG_EVERY, min=1)
        self._count = 0
        self._suppressed_since_last_log = 0

    def register_unauthorized(self) -> UnauthorizedFloodDecision:
        self._count += 1
        should_close = self._count > self._close_after
        should_log = self._count == 1 or self._count % self._log_every == 0 or should_close

        if not should_log:
            self._suppressed_since_last_log += 1
            return UnauthorizedFloodDecision(
                should_close=should_close, should_log=False, count=self._count, suppressed_since_last_log=0
            )

        suppressed_since_last_log = self._suppressed_since_last_log
        self._suppressed_since_last_log = 0
        return UnauthorizedFloodDecision(
            should_close=should_close,
            should_log=True,
            count=self._count,
            suppressed_since_last_log=suppressed_since_last_log,
        )

    def reset(self) -> None:
        self._count = 0
        self._suppressed_since_last_log = 0


def is_unauthorized_role_error(error_code: str | None, error_message: str | None) -> bool:
    """Identifies role-auth failures that should feed the flood guard."""
    if error_code is None or error_message is None:
        return False
    return error_code == INVALID_REQUEST_ERROR_CODE and error_message.startswith("unauthorized role:")
