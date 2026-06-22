"""Tests for the openclaw_adapted session-id port.

Origin: core/lib/openclaw_adapted/session_id.py (ported from openclaw/openclaw,
MIT). The first two cases are translated directly from upstream
src/sessions/session-id.test.ts (pinned commit
e2c567538d8964ab594f63ea3121ee72149f273d).
"""
from core.lib.openclaw_adapted.session_id import SESSION_ID_RE, looks_like_session_id


def test_matches_canonical_uuid_session_ids():
    assert SESSION_ID_RE.match("123e4567-e89b-12d3-a456-426614174000") is not None
    assert looks_like_session_id(" 123e4567-e89b-12d3-a456-426614174000 ") is True


def test_rejects_non_session_id_values():
    assert SESSION_ID_RE.match("agent:main:main") is None
    assert looks_like_session_id("session-label") is False


def test_is_case_insensitive():
    assert looks_like_session_id("123E4567-E89B-12D3-A456-426614174000") is True


def test_rejects_empty_and_malformed_uuid_shapes():
    assert looks_like_session_id("") is False
    assert looks_like_session_id("123e4567-e89b-12d3-a456-42661417400") is False  # 1 char short
    assert looks_like_session_id("123e4567e89b12d3a456426614174000") is False  # no dashes
