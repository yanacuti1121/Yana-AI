"""Session kind helpers classify cron, interactive, and channel-backed sessions.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/classify-session-kind.ts (MIT)
Ported:  2026-06-22. Full direct translation.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

from typing import Literal, Mapping

from core.lib.openclaw_adapted.session_key_utils import is_cron_session_key

SessionKind = Literal["cron", "direct", "group", "global", "spawn-child", "unknown"]


def classify_session_kind(key: str, entry: Mapping[str, object] | None = None) -> SessionKind:
    """Classify a session key + entry into a display kind.

    Evaluation order matters -- more-specific signals take priority:
      1. sentinel keys ("global", "unknown")
      2. cron key shape
      3. spawn-child (entry has `spawnedBy`) -- checked before key-shape so ACP
         spawn-child sessions with opaque keys are not misclassified as "direct"
      4. group/channel chatType or key-shape substring
      5. fallback: "direct"
    """
    if key == "global":
        return "global"
    if key == "unknown":
        return "unknown"
    if is_cron_session_key(key):
        return "cron"
    if entry is not None and entry.get("spawnedBy"):
        return "spawn-child"
    if entry is not None and entry.get("chatType") in ("group", "channel"):
        return "group"
    if ":group:" in key or ":channel:" in key:
        return "group"
    return "direct"
