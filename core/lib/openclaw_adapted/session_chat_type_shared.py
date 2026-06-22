"""Shared session chat type helpers: cross-module chat type classification.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/session-chat-type-shared.ts (MIT)
Ported:  2026-06-22. Full direct translation -- all three functions here are
         self-contained (no plugin/registry coupling), unlike
         session-chat-type.ts's `deriveSessionChatType` (excluded from this
         port: depends on the channel plugin registry `bootstrap-registry.js`)
         which calls into this module instead.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import re
from typing import Callable, Literal, Sequence

from core.lib.openclaw_adapted.session_key_utils import parse_agent_session_key
from core.lib.openclaw_adapted.string_coerce import normalize_lowercase_string_or_empty

SessionKeyChatType = Literal["direct", "group", "channel", "unknown"]

_LEGACY_GROUP_RE = re.compile(r"^group:[^:]+$")
_LEGACY_WHATSAPP_GROUP_RE = re.compile(r"^(?:whatsapp:)?[^:]+@g\.us$")
_LEGACY_DISCORD_CHANNEL_RE = re.compile(r"^discord:(?:[^:]+:)?guild-[^:]+:channel-[^:]+$")

_LegacyDeriver = Callable[[str], "SessionKeyChatType | None"]


def _derive_built_in_legacy_session_chat_type(
    scoped_session_key: str,
) -> SessionKeyChatType | None:
    if _LEGACY_GROUP_RE.match(scoped_session_key):
        return "group"
    if _LEGACY_WHATSAPP_GROUP_RE.match(scoped_session_key):
        return "group"
    if _LEGACY_DISCORD_CHANNEL_RE.match(scoped_session_key):
        return "channel"
    return None


def derive_session_chat_type_from_scoped_key(
    scoped_session_key: str,
    derive_legacy_session_chat_types: Sequence[_LegacyDeriver] = (),
) -> SessionKeyChatType:
    tokens = {p for p in scoped_session_key.split(":") if p}
    if "group" in tokens:
        return "group"
    if "channel" in tokens:
        return "channel"
    if "direct" in tokens or "dm" in tokens:
        return "direct"
    built_in_legacy = _derive_built_in_legacy_session_chat_type(scoped_session_key)
    if built_in_legacy:
        return built_in_legacy
    for derive_legacy_session_chat_type in derive_legacy_session_chat_types:
        derived = derive_legacy_session_chat_type(scoped_session_key)
        if derived:
            return derived
    return "unknown"


def derive_session_chat_type_from_key(
    session_key: str | None,
    derive_legacy_session_chat_types: Sequence[_LegacyDeriver] = (),
) -> SessionKeyChatType:
    """Best-effort chat-type extraction from session keys across canonical and legacy formats."""
    raw = normalize_lowercase_string_or_empty(session_key)
    if not raw:
        return "unknown"
    parsed = parse_agent_session_key(raw)
    scoped = parsed.rest if parsed else raw
    return derive_session_chat_type_from_scoped_key(scoped, derive_legacy_session_chat_types)
