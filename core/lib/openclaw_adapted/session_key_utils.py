"""Session key parsing and classification (cron/subagent/acp/thread).

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/session-key-utils.ts (MIT) -- parse/classify half.
         See session_key_case_preservation.py for the case-preservation half
         (split out to respect the 300-line file limit;
         agent-code-constraints.md). `RawSessionConversationRef` and
         `parse_raw_session_conversation_ref` live in that file, not here,
         because `requires_folded_session_key_alias_proof` depends on them.
Ported:  2026-06-22. Full direct translation of every remaining exported
         function and type in the upstream module.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from core.lib.openclaw_adapted.session_key_case_preservation import (
    normalize_session_key_preserving_opaque_peer_ids,
)
from core.lib.openclaw_adapted.string_coerce import (
    normalize_lowercase_string_or_empty,
    normalize_optional_lowercase_string,
    normalize_optional_string,
)


@dataclass(frozen=True)
class ParsedAgentSessionKey:
    agent_id: str
    rest: str


@dataclass(frozen=True)
class ParsedThreadSessionSuffix:
    base_session_key: str | None
    thread_id: str | None


def parse_agent_session_key(session_key: str | None) -> ParsedAgentSessionKey | None:
    """Parse agent-scoped session keys in a canonical, case-insensitive way.

    Returned values are canonicalized for stable comparisons/routing while
    preserving provider-owned opaque peer IDs.
    """
    raw = normalize_session_key_preserving_opaque_peer_ids(session_key)
    if not raw:
        return None
    parts = [p for p in raw.split(":") if p]
    if len(parts) < 3:
        return None
    if parts[0] != "agent":
        return None
    agent_id = normalize_optional_string(parts[1])
    rest = ":".join(parts[2:])
    if not agent_id or not rest:
        return None
    return ParsedAgentSessionKey(agent_id=agent_id, rest=rest)


_CRON_RUN_RE = re.compile(r"^cron:[^:]+:run:[^:]+(?::|$)")


def is_cron_run_session_key(session_key: str | None) -> bool:
    parsed = parse_agent_session_key(session_key)
    if not parsed:
        return False
    return _CRON_RUN_RE.match(parsed.rest) is not None


def is_cron_session_key(session_key: str | None) -> bool:
    parsed = parse_agent_session_key(session_key)
    if not parsed:
        return False
    normalized = normalize_optional_lowercase_string(parsed.rest)
    return normalized is not None and normalized.startswith("cron:")


def is_subagent_session_key(session_key: str | None) -> bool:
    raw = normalize_optional_string(session_key)
    if not raw:
        return False
    lowered = normalize_optional_lowercase_string(raw)
    if lowered is not None and lowered.startswith("subagent:"):
        return True
    parsed = parse_agent_session_key(raw)
    rest_lower = normalize_optional_lowercase_string(parsed.rest if parsed else None)
    return rest_lower is not None and rest_lower.startswith("subagent:")


def get_subagent_depth(session_key: str | None) -> int:
    raw = normalize_optional_lowercase_string(session_key)
    if not raw:
        return 0
    return len(raw.split(":subagent:")) - 1


def is_acp_session_key(session_key: str | None) -> bool:
    raw = normalize_optional_string(session_key)
    if not raw:
        return False
    normalized = normalize_lowercase_string_or_empty(raw)
    if normalized.startswith("acp:"):
        return True
    parsed = parse_agent_session_key(raw)
    rest_lower = normalize_optional_lowercase_string(parsed.rest if parsed else None)
    return rest_lower is not None and rest_lower.startswith("acp:")


def parse_thread_session_suffix(session_key: str | None) -> ParsedThreadSessionSuffix:
    raw = normalize_optional_string(session_key)
    if not raw:
        return ParsedThreadSessionSuffix(base_session_key=None, thread_id=None)

    lower_raw = normalize_lowercase_string_or_empty(raw)
    thread_marker = ":thread:"
    marker_index = lower_raw.rfind(thread_marker)

    base_session_key = raw if marker_index == -1 else raw[:marker_index]
    thread_id_raw = None if marker_index == -1 else raw[marker_index + len(thread_marker) :]
    thread_id = normalize_optional_string(thread_id_raw)

    return ParsedThreadSessionSuffix(base_session_key=base_session_key, thread_id=thread_id)
