"""Recognize whether raw text looks like a UUID-shaped OpenClaw session id.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/session-id.ts (MIT)
Ported:  2026-06-22. Full direct translation. Canonical OpenClaw session ids
         are UUID-shaped. Store/session-key aliases may be different; this
         helper only answers whether raw text looks like a UUID id.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import re

SESSION_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)


def looks_like_session_id(value: str) -> bool:
    return SESSION_ID_RE.match(value.strip()) is not None
