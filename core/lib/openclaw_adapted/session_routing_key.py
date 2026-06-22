"""Minimal routing/session-key.ts helper needed by session_id_resolution.py.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/routing/session-key.ts (MIT) -- toAgentRequestSessionKey only.
Ported:  2026-06-22. Only this one function was needed by
         session_id_resolution.py; the rest of routing/session-key.ts
         (account-id helpers, SessionKeyShape classification, chat-type
         interop) was not needed and is not ported here.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

from core.lib.openclaw_adapted.session_key_utils import parse_agent_session_key


def to_agent_request_session_key(store_key: str | None) -> str | None:
    raw = (store_key or "").strip()
    if not raw:
        return None
    parsed = parse_agent_session_key(raw)
    return parsed.rest if parsed else raw
