"""Tests for the openclaw_adapted classify-session-kind port.

Origin: core/lib/openclaw_adapted/classify_session_kind.py (ported from
openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.classify_session_kind import classify_session_kind


def test_sentinel_keys():
    assert classify_session_kind("global") == "global"
    assert classify_session_kind("unknown") == "unknown"


def test_cron_key_shape():
    assert classify_session_kind("agent:main:cron:job1") == "cron"


def test_spawn_child_takes_priority_over_key_shape():
    assert classify_session_kind("agent:main:acp:abc", {"spawnedBy": "parent-1"}) == "spawn-child"


def test_group_via_chat_type():
    assert classify_session_kind("agent:main:opaque", {"chatType": "group"}) == "group"
    assert classify_session_kind("agent:main:opaque", {"chatType": "channel"}) == "group"


def test_group_via_key_shape_substring():
    assert classify_session_kind("agent:main:slack:group:abc") == "group"
    assert classify_session_kind("agent:main:slack:channel:abc") == "group"


def test_fallback_direct():
    assert classify_session_kind("agent:main:telegram:direct:abc") == "direct"
    assert classify_session_kind("agent:main:main") == "direct"


def test_entry_none_does_not_crash():
    assert classify_session_kind("agent:main:main", None) == "direct"


def test_cron_takes_priority_over_spawn_child():
    assert classify_session_kind("agent:main:cron:job1", {"spawnedBy": "parent-1"}) == "cron"
