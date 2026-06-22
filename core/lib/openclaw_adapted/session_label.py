"""Parse user-editable session display labels with structured errors.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/session-label.ts (MIT)
Ported:  2026-06-22. Full direct translation. User-editable session labels
         are short display strings saved in session metadata; the parser
         returns structured errors for CLI/API callers.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

from dataclasses import dataclass

SESSION_LABEL_MAX_LENGTH = 512


@dataclass(frozen=True)
class ParsedSessionLabelOk:
    label: str
    ok: bool = True


@dataclass(frozen=True)
class ParsedSessionLabelError:
    error: str
    ok: bool = False


ParsedSessionLabel = ParsedSessionLabelOk | ParsedSessionLabelError


def parse_session_label(raw: object) -> ParsedSessionLabel:
    if not isinstance(raw, str):
        return ParsedSessionLabelError(error="invalid label: must be a string")
    trimmed = raw.strip()
    if not trimmed:
        return ParsedSessionLabelError(error="invalid label: empty")
    if len(trimmed) > SESSION_LABEL_MAX_LENGTH:
        return ParsedSessionLabelError(
            error=f"invalid label: too long (max {SESSION_LABEL_MAX_LENGTH})"
        )
    return ParsedSessionLabelOk(label=trimmed)
