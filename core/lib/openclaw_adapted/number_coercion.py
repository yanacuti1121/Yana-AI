"""Timer/integer bound-clamping helpers used by the gateway rate-limit ports.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         packages/normalization-core/src/number-coercion.ts
         (resolveTimerTimeoutMs, resolveIntegerOption, MAX_TIMER_TIMEOUT_MS) (MIT)
Ported:  2026-06-20. Direct translation of the two functions actually used by
         this batch's rate-limit/guard ports. The rest of number-coercion.ts
         (date/ISO helpers, secret-expiry helpers) was not needed and is not
         ported here.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import math

# Node's setTimeout/setInterval silently overflow past this value (2^31-1 ms
# region, rounded down by the engine) -- mirrors the upstream constant.
MAX_TIMER_TIMEOUT_MS = 2_147_000_000


def _as_finite_number(value: object) -> float | int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        return value
    return None


def resolve_timer_timeout_ms(value_ms: object, fallback_ms: float, min_ms: float = 1) -> int:
    """Resolve arbitrary timeout input with fallback and minimum timer bounds."""
    value = _as_finite_number(value_ms)
    if value is None:
        value = _as_finite_number(fallback_ms)
    min_bound = max(0, math.floor(min_ms))
    if value is None:
        return min_bound
    return min(max(math.floor(value), min_bound), MAX_TIMER_TIMEOUT_MS)


def resolve_integer_option(
    value: object,
    fallback: int,
    *,
    min: int | None = None,  # noqa: A002 -- mirrors upstream `range.min`
    max: int | None = None,  # noqa: A002 -- mirrors upstream `range.max`
) -> int:
    """Resolve an integer option from finite numeric input or fallback, then clamp bounds."""
    candidate = value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else fallback
    floored = math.floor(candidate)
    min_bounded = floored if min is None else _max(min, floored)
    return min_bounded if max is None else _min(max, min_bounded)


def _max(a: int, b: int) -> int:
    return a if a > b else b


def _min(a: int, b: int) -> int:
    return a if a < b else b
