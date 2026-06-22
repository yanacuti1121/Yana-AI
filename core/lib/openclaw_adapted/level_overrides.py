"""Session level override helpers normalize per-session logging/behavior levels.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/level-overrides.ts (MIT) -- parse/apply functions.
         normalizeVerboseLevel/normalizeTraceLevel come from
         src/auto-reply/thinking.shared.ts (re-exported via thinking.ts);
         ported here directly since the rest of thinking.ts/thinking.shared.ts
         (model-catalog/provider-thinking-profile resolution) is unrelated
         and out of scope for this sessions-only batch.
Ported:  2026-06-22. Full direct translation. `apply_verbose_override` and
         `apply_trace_override` mutate `entry` in place -- same intentional
         exception to this repo's immutability default as model_overrides.py
         (see that module's docstring): the upstream API's actual contract is
         mutation, callers keep parse/apply separate so invalid input can be
         reported before the store is touched.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, MutableMapping

from core.lib.openclaw_adapted.string_coerce import normalize_optional_lowercase_string

VerboseLevel = Literal["off", "on", "full"]
TraceLevel = Literal["off", "on", "raw"]

_INVALID_VERBOSE_LEVEL_ERROR = 'invalid verboseLevel (use "on"|"off"|"full")'
_INVALID_TRACE_LEVEL_ERROR = 'invalid traceLevel (use "on"|"off"|"raw")'


def normalize_verbose_level(raw: str | None) -> VerboseLevel | None:
    key = normalize_optional_lowercase_string(raw)
    if not key:
        return None
    if key in ("off", "false", "no", "0"):
        return "off"
    if key in ("full", "all", "everything"):
        return "full"
    if key in ("on", "minimal", "true", "yes", "1"):
        return "on"
    return None


def normalize_trace_level(raw: str | None) -> TraceLevel | None:
    key = normalize_optional_lowercase_string(raw)
    if not key:
        return None
    if key in ("off", "false", "no", "0"):
        return "off"
    if key in ("on", "true", "yes", "1"):
        return "on"
    if key in ("raw", "unfiltered"):
        return "raw"
    return None


@dataclass(frozen=True)
class ParsedOverrideOk:
    value: object | None
    ok: bool = True


@dataclass(frozen=True)
class ParsedOverrideError:
    error: str
    ok: bool = False


ParsedOverride = ParsedOverrideOk | ParsedOverrideError

# Session-level override parsers use tri-state results: `value=None` clears
# the saved override (mirrors upstream `null`); `value=UNSET` means no change
# (mirrors upstream `undefined`). UNSET is also the default for `raw` and
# `level` below, so the common case -- caller has no override to apply --
# needs no explicit argument, matching how the upstream functions are called
# with an omitted/undefined field on a partial options object.
UNSET = object()


def parse_verbose_override(raw: object = UNSET) -> ParsedOverride:
    if raw is UNSET:
        return ParsedOverrideOk(value=UNSET)
    if raw is None:
        return ParsedOverrideOk(value=None)
    if not isinstance(raw, str):
        return ParsedOverrideError(error=_INVALID_VERBOSE_LEVEL_ERROR)
    normalized = normalize_verbose_level(raw)
    if not normalized:
        return ParsedOverrideError(error=_INVALID_VERBOSE_LEVEL_ERROR)
    return ParsedOverrideOk(value=normalized)


def apply_verbose_override(entry: MutableMapping[str, object], level: object = UNSET) -> None:
    if level is UNSET:
        return
    if level is None:
        entry.pop("verboseLevel", None)
        return
    entry["verboseLevel"] = level


def parse_trace_override(raw: object = UNSET) -> ParsedOverride:
    if raw is UNSET:
        return ParsedOverrideOk(value=UNSET)
    if raw is None:
        return ParsedOverrideOk(value=None)
    if not isinstance(raw, str):
        return ParsedOverrideError(error=_INVALID_TRACE_LEVEL_ERROR)
    normalized = normalize_trace_level(raw)
    if not normalized:
        return ParsedOverrideError(error=_INVALID_TRACE_LEVEL_ERROR)
    return ParsedOverrideOk(value=normalized)


def apply_trace_override(entry: MutableMapping[str, object], level: object = UNSET) -> None:
    if level is UNSET:
        return
    if level is None:
        entry.pop("traceLevel", None)
        return
    entry["traceLevel"] = level
