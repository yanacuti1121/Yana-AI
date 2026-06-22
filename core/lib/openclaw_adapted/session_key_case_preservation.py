"""Case-preservation policy for opaque session-key peer IDs (Matrix/Signal).

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/session-key-utils.ts (MIT) -- case-preservation half.
         `parse_raw_session_conversation_ref` lives here (not in
         session_key_utils.py) because `requires_folded_session_key_alias_proof`
         depends on it and splitting the other way would create a circular
         import between the two ported files; `session_key_utils.py` imports
         `normalize_session_key_preserving_opaque_peer_ids` from here instead.
Ported:  2026-06-22. Split out of the single-file port to respect the
         300-line file limit (agent-code-constraints.md). `escapeRegExp` is
         not ported as a separate helper since Python's `re.escape` is the
         direct standard-library equivalent and is used inline instead.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from core.lib.openclaw_adapted.string_coerce import (
    normalize_lowercase_string_or_empty,
    normalize_optional_lowercase_string,
    normalize_optional_string,
)


@dataclass(frozen=True)
class RawSessionConversationRef:
    channel: str
    kind: Literal["group", "channel"]
    raw_id: str
    prefix: str


@dataclass(frozen=True)
class _CasePreservingPeerDescriptor:
    """Generic, opt-in case-preservation policy for session-key peer IDs.

    Session keys are canonicalized to lowercase for stable comparison/routing,
    but some channels own opaque, case-SENSITIVE peer IDs that must survive
    verbatim. Channels enroll here individually; un-enrolled channels keep the
    default lowercase behavior. See openclaw/openclaw#75670 (Matrix) and
    #82853 (Signal).

      span "segment" -- preserve a single colon-free id segment, matched
                        anywhere (incl. unscoped keys without an
                        `agent:<id>:` head).
      span "tail"    -- preserve the entire opaque tail after the
                        agent-scoped `agent:<id>:<channel>:<peerKind>:` head
                        (opaque id with embedded colons plus any
                        `:thread:<event>` suffix).
    """

    channel: str
    peer_kinds: frozenset[str]
    span: Literal["segment", "tail"]
    unscoped: bool


CASE_PRESERVING_PEERS: tuple[_CasePreservingPeerDescriptor, ...] = (
    # #82853 -- Signal group IDs (opaque). Encoded to match prior behavior exactly.
    _CasePreservingPeerDescriptor(
        channel="signal", peer_kinds=frozenset({"group"}), span="segment", unscoped=True
    ),
    # #75670 -- Matrix room IDs (opaque, embedded `:server`) plus thread event suffix.
    _CasePreservingPeerDescriptor(
        channel="matrix", peer_kinds=frozenset({"channel", "group"}), span="tail", unscoped=True
    ),
)


def is_case_preserving_peer(channel: str | None, peer_kind: str | None) -> bool:
    """True when (channel, peerKind) owns a case-sensitive opaque peer ID."""
    c = normalize_lowercase_string_or_empty(channel)
    k = normalize_lowercase_string_or_empty(peer_kind)
    return _find_case_preserving_peer_descriptor(c, k) is not None


def _find_case_preserving_peer_descriptor(
    channel: str | None, peer_kind: str | None
) -> _CasePreservingPeerDescriptor | None:
    c = normalize_lowercase_string_or_empty(channel)
    k = normalize_lowercase_string_or_empty(peer_kind)
    for descriptor in CASE_PRESERVING_PEERS:
        if descriptor.channel == c and k in descriptor.peer_kinds:
            return descriptor
    return None


def parse_raw_session_conversation_ref(
    session_key: str | None,
) -> RawSessionConversationRef | None:
    raw = normalize_optional_string(session_key)
    if not raw:
        return None

    raw_parts = [p for p in raw.split(":") if p]
    body_start_index = (
        2
        if len(raw_parts) >= 3 and normalize_optional_lowercase_string(raw_parts[0]) == "agent"
        else 0
    )
    parts = raw_parts[body_start_index:]
    if len(parts) < 3:
        return None

    channel = normalize_optional_lowercase_string(parts[0])
    kind = normalize_optional_lowercase_string(parts[1])
    if not channel or kind not in ("group", "channel"):
        return None

    raw_id = normalize_optional_string(":".join(parts[2:]))
    prefix = normalize_optional_string(":".join(raw_parts[: body_start_index + 2]))
    if not raw_id or not prefix:
        return None

    return RawSessionConversationRef(channel=channel, kind=kind, raw_id=raw_id, prefix=prefix)


def requires_folded_session_key_alias_proof(session_key: str | None) -> bool:
    ref = parse_raw_session_conversation_ref(session_key)
    descriptor = _find_case_preserving_peer_descriptor(
        ref.channel if ref else None, ref.kind if ref else None
    )
    return descriptor is not None and descriptor.span == "tail"


def normalize_session_peer_id(
    *, channel: str | None, peer_kind: str | None = None, peer_id: str | None = None
) -> str:
    trimmed = (peer_id or "").strip()
    if not trimmed:
        return ""
    if is_case_preserving_peer(channel, peer_kind):
        return trimmed
    return normalize_lowercase_string_or_empty(trimmed)


@dataclass(frozen=True)
class _PreservedSpan:
    start: int
    end: int
    trim: bool


_NORMALIZED_SESSION_KEY_CACHE_MAX_ENTRIES = 2048
_NORMALIZED_SESSION_KEY_CACHE_MAX_LENGTH = 4096
_normalized_session_key_cache: dict[str, str] = {}


def _read_normalized_session_key_cache(raw: str) -> str | None:
    if len(raw) <= _NORMALIZED_SESSION_KEY_CACHE_MAX_LENGTH:
        return _normalized_session_key_cache.get(raw)
    return None


def _write_normalized_session_key_cache(raw: str, normalized: str) -> None:
    if len(raw) > _NORMALIZED_SESSION_KEY_CACHE_MAX_LENGTH:
        return
    # FIFO eviction on insertion order, matching the upstream Map's eviction
    # (Map.set on an existing key does not change its iteration position).
    _normalized_session_key_cache[raw] = normalized
    while len(_normalized_session_key_cache) > _NORMALIZED_SESSION_KEY_CACHE_MAX_ENTRIES:
        oldest_key = next(iter(_normalized_session_key_cache))
        del _normalized_session_key_cache[oldest_key]


def _may_contain_case_preserving_peer(raw: str) -> bool:
    folded = raw.lower()
    return any(f"{descriptor.channel}:" in folded for descriptor in CASE_PRESERVING_PEERS)


def _collect_case_preserved_spans(raw: str) -> list[_PreservedSpan]:
    """Collect [start,end) ranges in `raw` whose case must be preserved.

    Spans may come from multiple descriptors; the caller lowercases everything
    OUTSIDE their union -- collect-then-emit, never sequential transforms that
    could re-lowercase an already-preserved span.
    """
    spans: list[_PreservedSpan] = []
    for descriptor in CASE_PRESERVING_PEERS:
        channel = re.escape(descriptor.channel)
        for peer_kind in descriptor.peer_kinds:
            kind = re.escape(peer_kind)
            if descriptor.span == "segment":
                # Unscoped: `<channel>:<peerKind>:<segment>` at start or after any colon.
                pattern = re.compile(rf"(^|:){channel}:{kind}:([^:]+)", re.IGNORECASE)
                for match in pattern.finditer(raw):
                    segment = match.group(2) or ""
                    seg_start = match.start(2)
                    # Segment spans match the legacy `peerId.trim()` behavior exactly.
                    spans.append(_PreservedSpan(seg_start, seg_start + len(segment), True))
            else:

                def collect_tail_span(tail_start: int) -> None:
                    if tail_start >= len(raw):
                        return
                    # Preserve Matrix room/event IDs, but keep structural thread
                    # marker casing canonical so `:Thread:` cannot fork a session key.
                    tail = raw[tail_start:]
                    thread_marker = ":thread:"
                    marker_index = normalize_lowercase_string_or_empty(tail).rfind(thread_marker)
                    if marker_index == -1:
                        spans.append(_PreservedSpan(tail_start, len(raw), False))
                        return
                    spans.append(_PreservedSpan(tail_start, tail_start + marker_index, False))
                    thread_id_start = tail_start + marker_index + len(thread_marker)
                    if thread_id_start < len(raw):
                        spans.append(_PreservedSpan(thread_id_start, len(raw), False))

                # Tail: anchored to the real agent-scoped head; preserve through key end.
                scoped_match = re.match(rf"^agent:[^:]+:{channel}:{kind}:", raw, re.IGNORECASE)
                if scoped_match:
                    collect_tail_span(scoped_match.end())
                    continue
                if descriptor.unscoped:
                    unscoped_match = re.match(rf"^{channel}:{kind}:", raw, re.IGNORECASE)
                    if unscoped_match:
                        collect_tail_span(unscoped_match.end())
    return spans


def normalize_session_key_preserving_opaque_peer_ids(session_key: str | None) -> str:
    raw = normalize_optional_string(session_key)
    if not raw:
        return ""
    cached = _read_normalized_session_key_cache(raw)
    if cached is not None:
        return cached
    if not _may_contain_case_preserving_peer(raw):
        normalized = raw.lower()
        _write_normalized_session_key_cache(raw, normalized)
        return normalized

    spans = sorted(
        (span for span in _collect_case_preserved_spans(raw) if span.end > span.start),
        key=lambda span: span.start,
    )

    normalized = ""
    cursor = 0
    for span in spans:
        if span.start < cursor:
            # Overlapping/contained in an already-emitted preserved range; skip.
            continue
        normalized += normalize_lowercase_string_or_empty(raw[cursor : span.start])
        preserved = raw[span.start : span.end]
        normalized += preserved.strip() if span.trim else preserved
        cursor = span.end
    normalized += normalize_lowercase_string_or_empty(raw[cursor:])
    _write_normalized_session_key_cache(raw, normalized)
    return normalized
