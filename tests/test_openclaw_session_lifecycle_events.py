"""Tests for the openclaw_adapted session-lifecycle-events port.

Origin: core/lib/openclaw_adapted/session_lifecycle_events.py (ported from
openclaw/openclaw, MIT). Translated directly from upstream
src/sessions/session-lifecycle-events.test.ts (pinned commit
e2c567538d8964ab594f63ea3121ee72149f273d).
"""
from core.lib.openclaw_adapted.session_lifecycle_events import (
    SessionLifecycleEvent,
    emit_session_lifecycle_event,
    on_session_lifecycle_event,
)


def test_delivers_events_to_active_listeners_and_stops_after_unsubscribe():
    calls = []
    unsubscribe = on_session_lifecycle_event(calls.append)

    emit_session_lifecycle_event(
        SessionLifecycleEvent(session_key="agent:main:main", reason="created", label="Main")
    )
    assert calls == [
        SessionLifecycleEvent(session_key="agent:main:main", reason="created", label="Main")
    ]

    unsubscribe()
    emit_session_lifecycle_event(SessionLifecycleEvent(session_key="agent:main:main", reason="updated"))
    assert len(calls) == 1


def test_keeps_notifying_other_listeners_when_one_throws():
    noisy_calls = []
    healthy_calls = []

    def noisy(event):
        noisy_calls.append(event)
        raise RuntimeError("boom")

    unsubscribe_noisy = on_session_lifecycle_event(noisy)
    unsubscribe_healthy = on_session_lifecycle_event(healthy_calls.append)

    assert (
        emit_session_lifecycle_event(SessionLifecycleEvent(session_key="agent:main:main", reason="resumed"))
        is None
    )

    assert len(noisy_calls) == 1
    assert len(healthy_calls) == 1

    unsubscribe_noisy()
    unsubscribe_healthy()
