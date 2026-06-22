"""Resolve fuzzy CLI/user session-id input against store keys.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/session-id-resolution.ts (MIT)
Ported:  2026-06-22. Full direct translation. `SessionEntry` (from
         ../config/sessions.js) is not a ported type -- entries are accepted
         as any `Mapping` exposing an optional "updatedAt" key, matching how
         this module only ever reads that one field.
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import functools
from dataclasses import dataclass
from typing import Literal, Mapping

from core.lib.openclaw_adapted.session_routing_key import to_agent_request_session_key
from core.lib.openclaw_adapted.string_coerce import normalize_lowercase_string_or_empty

SessionIdMatch = tuple[str, Mapping[str, object]]


@dataclass(frozen=True)
class _NormalizedSessionIdMatch:
    session_key: str
    entry: Mapping[str, object]
    normalized_session_key: str
    normalized_request_key: str
    is_canonical_session_key: bool
    is_structural: bool


@dataclass(frozen=True)
class SelectionNone:
    kind: Literal["none"] = "none"


@dataclass(frozen=True)
class SelectionAmbiguous:
    session_keys: list[str]
    kind: Literal["ambiguous"] = "ambiguous"


@dataclass(frozen=True)
class SelectionSelected:
    session_key: str
    kind: Literal["selected"] = "selected"


SessionIdMatchSelection = SelectionNone | SelectionAmbiguous | SelectionSelected


def _get_updated_at(entry: Mapping[str, object] | None) -> float:
    value = entry.get("updatedAt") if entry is not None else None
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def _compare_normalized_updated_at_descending(
    a: _NormalizedSessionIdMatch, b: _NormalizedSessionIdMatch
) -> float:
    return _get_updated_at(b.entry) - _get_updated_at(a.entry)


def _compare_store_keys(a: str, b: str) -> int:
    if a < b:
        return -1
    if a > b:
        return 1
    return 0


def _normalize_session_id_matches(
    matches: list[SessionIdMatch], normalized_session_id: str
) -> list[_NormalizedSessionIdMatch]:
    result: list[_NormalizedSessionIdMatch] = []
    for session_key, entry in matches:
        normalized_session_key = normalize_lowercase_string_or_empty(session_key)
        request_key = to_agent_request_session_key(session_key)
        normalized_request_key = normalize_lowercase_string_or_empty(
            request_key if request_key is not None else session_key
        )
        result.append(
            _NormalizedSessionIdMatch(
                session_key=session_key,
                entry=entry,
                normalized_session_key=normalized_session_key,
                normalized_request_key=normalized_request_key,
                is_canonical_session_key=session_key == normalized_session_key,
                is_structural=(
                    normalized_session_key.endswith(f":{normalized_session_id}")
                    or normalized_request_key == normalized_session_id
                    or normalized_request_key.endswith(f":{normalized_session_id}")
                ),
            )
        )
    return result


def _collapse_alias_matches(
    matches: list[_NormalizedSessionIdMatch],
) -> list[_NormalizedSessionIdMatch]:
    grouped: dict[str, list[_NormalizedSessionIdMatch]] = {}
    for match in matches:
        grouped.setdefault(match.normalized_request_key, []).append(match)

    def tie_break(a: _NormalizedSessionIdMatch, b: _NormalizedSessionIdMatch) -> float:
        # Aliases that normalize to the same request key represent one
        # session. Prefer freshest canonical key so ambiguity only reports
        # distinct sessions.
        time_diff = _compare_normalized_updated_at_descending(a, b)
        if time_diff != 0:
            return time_diff
        if a.is_canonical_session_key != b.is_canonical_session_key:
            return -1 if a.is_canonical_session_key else 1
        return _compare_store_keys(a.normalized_session_key, b.normalized_session_key)

    result: list[_NormalizedSessionIdMatch] = []
    for group in grouped.values():
        if len(group) == 1:
            result.append(group[0])
            continue
        result.append(sorted(group, key=functools.cmp_to_key(tie_break))[0])
    return result


def _select_freshest_unique_match(
    matches: list[_NormalizedSessionIdMatch],
) -> _NormalizedSessionIdMatch | None:
    if len(matches) == 1:
        return matches[0]
    sorted_matches = sorted(
        matches, key=functools.cmp_to_key(_compare_normalized_updated_at_descending)
    )
    freshest = sorted_matches[0] if sorted_matches else None
    second_freshest = sorted_matches[1] if len(sorted_matches) > 1 else None
    if _get_updated_at(freshest.entry if freshest else None) > _get_updated_at(
        second_freshest.entry if second_freshest else None
    ):
        return freshest
    return None


def resolve_session_id_match_selection(
    matches: list[SessionIdMatch], session_id: str
) -> SessionIdMatchSelection:
    """Structural suffix/request-key matches beat fuzzy matches; tied
    structural or fuzzy matches stay ambiguous for caller-visible errors.
    """
    if not matches:
        return SelectionNone()

    canonical_matches = _collapse_alias_matches(
        _normalize_session_id_matches(matches, normalize_lowercase_string_or_empty(session_id))
    )
    if len(canonical_matches) == 1:
        return SelectionSelected(session_key=canonical_matches[0].session_key)

    structural_matches = [m for m in canonical_matches if m.is_structural]
    selected_structural_match = _select_freshest_unique_match(structural_matches)
    if selected_structural_match:
        return SelectionSelected(session_key=selected_structural_match.session_key)
    if len(structural_matches) > 1:
        return SelectionAmbiguous(session_keys=[m.session_key for m in structural_matches])

    selected_canonical_match = _select_freshest_unique_match(canonical_matches)
    if selected_canonical_match:
        return SelectionSelected(session_key=selected_canonical_match.session_key)

    return SelectionAmbiguous(session_keys=[m.session_key for m in canonical_matches])


def resolve_preferred_session_key_for_session_id_matches(
    matches: list[SessionIdMatch], session_id: str
) -> str | None:
    selection = resolve_session_id_match_selection(matches, session_id)
    return selection.session_key if isinstance(selection, SelectionSelected) else None
