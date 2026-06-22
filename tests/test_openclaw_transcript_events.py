"""Tests for the openclaw_adapted transcript-events port.

Origin: core/lib/openclaw_adapted/transcript_events.py (ported from
openclaw/openclaw, MIT). Translated directly from upstream
src/sessions/transcript-events.test.ts (pinned commit
e2c567538d8964ab594f63ea3121ee72149f273d).
"""
from core.lib.openclaw_adapted.transcript_events import (
    SessionTranscriptUpdate,
    emit_session_transcript_update,
    on_session_transcript_update,
)


def test_emits_trimmed_session_file_updates():
    calls = []
    unsubscribe = on_session_transcript_update(calls.append)
    try:
        emit_session_transcript_update("  /tmp/session.jsonl  ")
        assert calls == [SessionTranscriptUpdate(session_file="/tmp/session.jsonl")]
    finally:
        unsubscribe()


def test_includes_optional_session_metadata_when_provided():
    calls = []
    unsubscribe = on_session_transcript_update(calls.append)
    try:
        emit_session_transcript_update(
            {
                "sessionFile": "  /tmp/session.jsonl  ",
                "sessionKey": "  agent:main:main  ",
                "agentId": "  main  ",
                "message": {"role": "assistant", "content": "hi"},
                "messageId": "  msg-1  ",
                "messageSeq": 2,
            }
        )
        assert calls == [
            SessionTranscriptUpdate(
                session_file="/tmp/session.jsonl",
                session_key="agent:main:main",
                agent_id="main",
                message={"role": "assistant", "content": "hi"},
                message_id="msg-1",
                message_seq=2,
            )
        ]
    finally:
        unsubscribe()


def test_drops_invalid_message_sequence_values():
    calls = []
    unsubscribe = on_session_transcript_update(calls.append)
    try:
        emit_session_transcript_update({"sessionFile": "/tmp/session.jsonl", "messageSeq": 0})
        emit_session_transcript_update({"sessionFile": "/tmp/session.jsonl", "messageSeq": 1.5})
        emit_session_transcript_update(
            {"sessionFile": "/tmp/session.jsonl", "messageSeq": float("inf")}
        )
        assert len(calls) == 3
        for call in calls:
            assert call == SessionTranscriptUpdate(session_file="/tmp/session.jsonl")
    finally:
        unsubscribe()


def test_continues_notifying_other_listeners_when_one_throws():
    first_calls = []
    second_calls = []

    def first(update):
        first_calls.append(update)
        raise RuntimeError("boom")

    unsubscribe_first = on_session_transcript_update(first)
    unsubscribe_second = on_session_transcript_update(second_calls.append)
    try:
        assert emit_session_transcript_update("/tmp/session.jsonl") is None
        assert len(first_calls) == 1
        assert len(second_calls) == 1
    finally:
        unsubscribe_first()
        unsubscribe_second()


def test_empty_session_file_drops_update():
    calls = []
    unsubscribe = on_session_transcript_update(calls.append)
    try:
        emit_session_transcript_update("   ")
        emit_session_transcript_update({"sessionFile": ""})
        assert calls == []
    finally:
        unsubscribe()
