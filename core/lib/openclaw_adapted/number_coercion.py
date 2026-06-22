"""Timer/integer bound-clamping helpers used by the gateway and sessions ports.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         packages/normalization-core/src/number-coercion.ts
         (resolveTimerTimeoutMs, resolveIntegerOption, MAX_TIMER_TIMEOUT_MS,
         asPositiveSafeInteger) (MIT)
Ported:  2026-06-20 (resolve_timer_timeout_ms, resolve_integer_option),
         2026-06-22 (as_positive_safe_integer, added for the
         transcript_events.py port). Direct translation of the functions
         actually used by the gateway/rate-limit and sessions batches. The
         rest of number-coercion.ts (date/ISO helpers, secret-expiry helpers)
         was not needed and is not ported here.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import math

# Node's setTimeout/setInterval silently overflow past this value (2^31-1 ms
# region, rounded down by the engine) -- mirrors the upstream constant.
MAX_TIMER_TIMEOUT_MS = 2_147_000_000

# Mirrors JS Number.MAX_SAFE_INTEGER (2^53 - 1).
_MAX_SAFE_INTEGER = 2**53 - 1


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


def as_positive_safe_integer(value: object) -> int | None:
    """Return `value` as a positive int if it is a JS-safe integer, else None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and (not math.isfinite(value) or not value.is_integer()):
        return None
    if not (-_MAX_SAFE_INTEGER <= value <= _MAX_SAFE_INTEGER):
        return None
    return int(value) if value > 0 else None
