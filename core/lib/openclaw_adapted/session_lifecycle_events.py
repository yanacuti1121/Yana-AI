"""Session lifecycle event broadcast to observers when a session is created or linked.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/session-lifecycle-events.ts (MIT)
Ported:  2026-06-22. Full direct translation. The listener set is snapshotted
         (`list(...)`) before iterating in `emit_session_lifecycle_event` --
         JS `Set` iteration tolerates live add/remove during iteration but
         Python's does not (RuntimeError on size change mid-iteration), so a
         snapshot is the safe equivalent for the unsubscribe-during-emit case.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class SessionLifecycleEvent:
    session_key: str
    reason: str
    parent_session_key: str | None = None
    label: str | None = None
    display_name: str | None = None


SessionLifecycleListener = Callable[[SessionLifecycleEvent], None]

_SESSION_LIFECYCLE_LISTENERS: set[SessionLifecycleListener] = set()


def on_session_lifecycle_event(listener: SessionLifecycleListener) -> Callable[[], None]:
    """Registers a session lifecycle listener."""
    _SESSION_LIFECYCLE_LISTENERS.add(listener)

    def unsubscribe() -> None:
        _SESSION_LIFECYCLE_LISTENERS.discard(listener)

    return unsubscribe


def emit_session_lifecycle_event(event: SessionLifecycleEvent) -> None:
    """Emits a best-effort session lifecycle event to all listeners."""
    for listener in list(_SESSION_LIFECYCLE_LISTENERS):
        try:
            listener(event)
        except Exception:
            pass  # Best-effort, do not propagate listener errors.
