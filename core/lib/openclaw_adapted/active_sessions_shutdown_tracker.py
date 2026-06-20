"""Tracks sessions needing a paired shutdown/finalize hook before process exit.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/active-sessions-shutdown-tracker.ts (MIT)
Ported:  2026-06-20. Direct translation -- module-level Map + standalone
         functions in the original; ported as a class instance here so
         state does not leak across test runs. `OpenClawConfig` was an
         unused-by-logic type field on the stored entry; kept as a generic
         `Any` field rather than importing OpenClaw's config type graph.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: remembers sessions that started but have not yet cleanly ended, so
a shutdown/restart path can drain and finalize them instead of leaving
ghost "active" rows behind. Generic pattern for any session/connection
lifecycle that pairs a start hook with an end hook.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ActiveSessionForShutdown:
    cfg: Any
    session_key: str
    session_id: str
    store_path: str
    session_file: str | None = None
    agent_id: str | None = None


class ActiveSessionsShutdownTracker:
    def __init__(self) -> None:
        self._tracked_sessions: dict[str, ActiveSessionForShutdown] = {}

    def note_active_session_for_shutdown(self, entry: ActiveSessionForShutdown) -> None:
        if not entry.session_id:
            return
        self._tracked_sessions[entry.session_id] = entry

    def forget_active_session_for_shutdown(self, session_id: str | None) -> None:
        if not session_id:
            return
        self._tracked_sessions.pop(session_id, None)

    def list_active_sessions_for_shutdown(self) -> list[ActiveSessionForShutdown]:
        """Returns a snapshot, not the backing map, so shutdown drains can iterate while
        lifecycle hooks concurrently forget finalized sessions."""
        return list(self._tracked_sessions.values())

    def clear_for_tests(self) -> None:
        self._tracked_sessions.clear()
