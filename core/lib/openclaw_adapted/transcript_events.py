"""Transcript event helpers serialize and trim session transcript events.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/transcript-events.ts (MIT)
Ported:  2026-06-22. Full direct translation. The raw `update` Mapping
         input keeps the upstream camelCase keys (sessionFile, sessionKey,
         agentId, messageId, messageSeq) since it represents an external,
         JSON-shaped event payload, matching the convention used by other
         snapshot-shaped ports (e.g. channel_health_policy.py). The listener
         set is snapshotted before iterating, same as session_lifecycle_events.py.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping

from core.lib.openclaw_adapted.number_coercion import as_positive_safe_integer
from core.lib.openclaw_adapted.string_coerce import normalize_optional_string


@dataclass(frozen=True)
class SessionTranscriptUpdate:
    session_file: str
    session_key: str | None = None
    agent_id: str | None = None
    message: object | None = None
    message_id: str | None = None
    message_seq: int | None = None


SessionTranscriptListener = Callable[[SessionTranscriptUpdate], None]

_SESSION_TRANSCRIPT_LISTENERS: set[SessionTranscriptListener] = set()


def on_session_transcript_update(listener: SessionTranscriptListener) -> Callable[[], None]:
    """Registers a listener for normalized session transcript updates."""
    _SESSION_TRANSCRIPT_LISTENERS.add(listener)

    def unsubscribe() -> None:
        _SESSION_TRANSCRIPT_LISTENERS.discard(listener)

    return unsubscribe


def emit_session_transcript_update(update: str | Mapping[str, object]) -> None:
    """Emits a normalized transcript update to all registered listeners."""
    if isinstance(update, str):
        raw_session_file: object = update
        raw_session_key: object = None
        raw_agent_id: object = None
        message: object = None
        raw_message_id: object = None
        raw_message_seq: object = None
    else:
        raw_session_file = update.get("sessionFile")
        raw_session_key = update.get("sessionKey")
        raw_agent_id = update.get("agentId")
        message = update.get("message")
        raw_message_id = update.get("messageId")
        raw_message_seq = update.get("messageSeq")

    trimmed = normalize_optional_string(raw_session_file)
    if not trimmed:
        return

    next_update = SessionTranscriptUpdate(
        session_file=trimmed,
        session_key=normalize_optional_string(raw_session_key),
        agent_id=normalize_optional_string(raw_agent_id),
        message=message,
        message_id=normalize_optional_string(raw_message_id),
        message_seq=as_positive_safe_integer(raw_message_seq),
    )
    for listener in list(_SESSION_TRANSCRIPT_LISTENERS):
        try:
            listener(next_update)
        except Exception:
            pass  # ignore -- best-effort broadcast.
