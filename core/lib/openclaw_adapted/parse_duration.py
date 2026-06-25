"""Duration string parsing shared by CLI flags and config-backed timing values — port.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/cli/parse-duration.ts (MIT)
Ported:  2026-06-25, for the context-pruning subsystem port.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import re

from core.lib.openclaw_adapted.string_coerce import (
    normalize_lowercase_string_or_empty,
    normalize_optional_string,
)

_DURATION_MULTIPLIERS: dict[str, int] = {
    "ms": 1,
    "s": 1000,
    "m": 60_000,
    "h": 3_600_000,
    "d": 86_400_000,
}

_SAFE_INTEGER_MAX = 2**53 - 1
_SAFE_INTEGER_MIN = -(2**53 - 1)

_SINGLE_TOKEN_RE = re.compile(r"^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$")
_COMPOSITE_TOKEN_RE = re.compile(r"(\d+(?:\.\d+)?)(ms|s|m|h|d)")


class InvalidDurationError(ValueError):
    """Raised when a duration string cannot be parsed."""


def _invalid_duration(raw: str, reason: str | None = None) -> InvalidDurationError:
    value = f'"{raw}"' if raw.strip() else "empty value"
    prefix = f"Invalid duration ({reason}): {value}." if reason else f"Invalid duration: {value}."
    return InvalidDurationError(f"{prefix} Use values like 500ms, 30s, 5m, 2h, or 1h30m.")


def _round_safe_duration_ms(raw: str, value: float) -> int:
    ms = round(value)
    if not (_SAFE_INTEGER_MIN <= ms <= _SAFE_INTEGER_MAX):
        raise _invalid_duration(raw)
    return ms


def parse_duration_ms(raw: str, default_unit: str = "ms") -> int:
    """Parse a non-negative duration into milliseconds.

    Supports a bare number with an optional/default unit (e.g. "500", "30s"),
    and composite forms where every segment carries its own unit
    (e.g. "1h30m", "2m500ms").
    """
    trimmed = normalize_lowercase_string_or_empty(normalize_optional_string(raw) or "")
    if not trimmed:
        raise _invalid_duration(raw, "empty")

    single = _SINGLE_TOKEN_RE.match(trimmed)
    if single:
        value = float(single.group(1))
        if value < 0:
            raise _invalid_duration(raw)
        unit = single.group(2) or default_unit
        return _round_safe_duration_ms(raw, value * _DURATION_MULTIPLIERS[unit])

    total_ms = 0.0
    consumed = 0
    for match in _COMPOSITE_TOKEN_RE.finditer(trimmed):
        value_raw, unit_raw = match.group(1), match.group(2)
        index = match.start()
        if index != consumed:
            raise _invalid_duration(raw, "each composite segment needs a unit")
        value = float(value_raw)
        if value < 0:
            raise _invalid_duration(raw)
        multiplier = _DURATION_MULTIPLIERS.get(unit_raw)
        if not multiplier:
            raise _invalid_duration(raw)
        total_ms += value * multiplier
        consumed += len(match.group(0))

    if consumed != len(trimmed) or consumed == 0:
        raise _invalid_duration(raw)

    return _round_safe_duration_ms(raw, total_ms)
