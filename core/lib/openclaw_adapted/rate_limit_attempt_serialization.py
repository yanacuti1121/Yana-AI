"""Serializes rate-limit attempts per IP/scope so concurrent failures count correctly.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/rate-limit-attempt-serialization.ts (MIT)
Ported:  2026-06-20. Direct translation of the async-queue-per-key pattern,
         using asyncio instead of JS's native Promise chaining. The original
         held its pending-attempts Map as module-level state with standalone
         functions; ported here as a class instance so state does not leak
         across test runs.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: without serialization, two concurrent requests from the same
IP/scope can both read "attempts < max" before either writes its failure,
letting both through past what should be a single-slot rate limit. This
runs one attempt at a time per key so AuthRateLimiter's check-then-
record_failure pair stays atomic under concurrency.
"""
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, TypeVar

from .auth_rate_limit import AUTH_RATE_LIMIT_SCOPE_DEFAULT, normalize_rate_limit_client_ip

T = TypeVar("T")


class RateLimitAttemptSerializer:
    def __init__(self) -> None:
        self._pending_attempts: dict[str, asyncio.Future] = {}

    def _normalize_scope(self, scope: str | None) -> str:
        return (scope or AUTH_RATE_LIMIT_SCOPE_DEFAULT).strip() or AUTH_RATE_LIMIT_SCOPE_DEFAULT

    def _build_serialization_key(self, ip: str | None, scope: str | None) -> str:
        return f"{self._normalize_scope(scope)}:{normalize_rate_limit_client_ip(ip)}"

    async def with_serialized_keyed_attempt(self, key: str, run: Callable[[], Awaitable[T]]) -> T:
        """Runs one attempt after prior work for the same stable key finishes."""
        previous = self._pending_attempts.get(key)
        loop = asyncio.get_event_loop()
        current: asyncio.Future = loop.create_future()

        async def _await_previous() -> None:
            if previous is not None:
                try:
                    await previous
                except Exception:
                    pass

        tail = asyncio.ensure_future(_chain(_await_previous(), current))
        self._pending_attempts[key] = tail

        await _await_previous()
        try:
            return await run()
        finally:
            current.set_result(None)
            if self._pending_attempts.get(key) is tail:
                del self._pending_attempts[key]

    async def with_serialized_rate_limit_attempt(
        self, ip: str | None, scope: str | None, run: Callable[[], Awaitable[T]]
    ) -> T:
        """Runs one rate-limit attempt after prior attempts for the same IP/scope finish."""
        key = self._build_serialization_key(ip, scope)
        return await self.with_serialized_keyed_attempt(key, run)


async def _chain(first: Awaitable[None], second: asyncio.Future) -> None:
    await first
    await second
