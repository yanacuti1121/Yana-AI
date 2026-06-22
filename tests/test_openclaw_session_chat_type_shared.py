"""Tests for the openclaw_adapted session-chat-type-shared port.

Origin: core/lib/openclaw_adapted/session_chat_type_shared.py (ported from
openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.session_chat_type_shared import (
    derive_session_chat_type_from_key,
    derive_session_chat_type_from_scoped_key,
)


def test_explicit_tokens_take_priority():
    assert derive_session_chat_type_from_scoped_key("group:abc") == "group"
    assert derive_session_chat_type_from_scoped_key("channel:abc") == "channel"
    assert derive_session_chat_type_from_scoped_key("direct:abc") == "direct"
    assert derive_session_chat_type_from_scoped_key("dm:abc") == "direct"
    assert derive_session_chat_type_from_scoped_key("telegram:group:abc") == "group"


def test_legacy_whatsapp_group_shape():
    assert derive_session_chat_type_from_scoped_key("1234567890@g.us") == "group"
    assert derive_session_chat_type_from_scoped_key("whatsapp:1234567890@g.us") == "group"


def test_legacy_discord_channel_shape():
    assert derive_session_chat_type_from_scoped_key("discord:guild-123:channel-456") == "channel"
    assert (
        derive_session_chat_type_from_scoped_key("discord:acct1:guild-123:channel-456")
        == "channel"
    )


def test_custom_legacy_deriver_callback():
    def custom_deriver(key: str) -> str | None:
        return "channel" if key == "custom-shape" else None

    assert derive_session_chat_type_from_scoped_key("custom-shape", [custom_deriver]) == "channel"


def test_unknown_fallback():
    assert derive_session_chat_type_from_scoped_key("foo:bar:baz") == "unknown"
    assert derive_session_chat_type_from_scoped_key("") == "unknown"


def test_from_key_none_or_empty_returns_unknown():
    assert derive_session_chat_type_from_key(None) == "unknown"
    assert derive_session_chat_type_from_key("") == "unknown"
    assert derive_session_chat_type_from_key("   ") == "unknown"


def test_from_key_unwraps_agent_scope_and_lowercases():
    assert derive_session_chat_type_from_key("Agent:Main:Group:ABC") == "group"


def test_from_key_unscoped_key_still_classified():
    assert derive_session_chat_type_from_key("group:abc") == "group"
