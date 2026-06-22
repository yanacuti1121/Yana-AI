"""Tests for the openclaw_adapted session-id-resolution port.

Origin: core/lib/openclaw_adapted/session_id_resolution.py (ported from
openclaw/openclaw, MIT). The 8 cases below are translated directly from
upstream src/sessions/session-id-resolution.test.ts (pinned commit
e2c567538d8964ab594f63ea3121ee72149f273d).
"""
from core.lib.openclaw_adapted.session_id_resolution import (
    SelectionAmbiguous,
    resolve_preferred_session_key_for_session_id_matches,
    resolve_session_id_match_selection,
)


def entry(updated_at: int, session_id: str = "s1") -> dict:
    return {"sessionId": session_id, "updatedAt": updated_at}


def test_returns_none_for_empty_matches():
    assert resolve_preferred_session_key_for_session_id_matches([], "s1") is None


def test_returns_the_only_match_for_single_element_array():
    matches = [("agent:main:main", entry(10))]
    assert resolve_preferred_session_key_for_session_id_matches(matches, "s1") == "agent:main:main"


def test_collapses_alias_duplicates_before_resolving_structural_ties():
    matches = [
        ("agent:main:MAIN", entry(10, "main")),
        ("agent:main:main", entry(10, "main")),
    ]
    assert (
        resolve_preferred_session_key_for_session_id_matches(matches, "main") == "agent:main:main"
    )


def test_returns_the_freshest_match_when_timestamps_differ():
    matches = [
        ("agent:main:alpha", entry(10)),
        ("agent:main:beta", entry(20)),
    ]
    assert resolve_preferred_session_key_for_session_id_matches(matches, "s1") == "agent:main:beta"


def test_returns_none_for_fuzzy_only_matches_with_tied_timestamps():
    matches = [
        ("agent:main:beta", entry(10)),
        ("agent:main:alpha", entry(10)),
    ]
    assert resolve_preferred_session_key_for_session_id_matches(matches, "s1") is None


def test_reports_ambiguity_for_fuzzy_only_matches_with_tied_timestamps():
    matches = [
        ("agent:main:beta", entry(10)),
        ("agent:main:alpha", entry(10)),
    ]
    selection = resolve_session_id_match_selection(matches, "s1")
    assert isinstance(selection, SelectionAmbiguous)
    assert selection.session_keys == ["agent:main:beta", "agent:main:alpha"]


def test_prefers_the_freshest_structural_match_over_a_fresher_fuzzy_match():
    matches = [
        ("agent:main:other", entry(999, "run-dup")),
        ("agent:main:acp:run-dup", entry(100, "run-dup")),
        ("agent:main:acp2:run-dup", entry(50, "run-dup")),
    ]
    assert (
        resolve_preferred_session_key_for_session_id_matches(matches, "run-dup")
        == "agent:main:acp:run-dup"
    )


def test_preserves_ambiguity_for_distinct_structural_ties():
    matches = [
        ("agent:main:b:sid", entry(10, "sid")),
        ("agent:main:a:sid", entry(10, "sid")),
        ("agent:main:extra", entry(500, "sid")),
    ]
    assert resolve_preferred_session_key_for_session_id_matches(matches, "sid") is None


# -- boundary cases (fuzz-testing-constraints.md) --


def test_entry_missing_updated_at_treated_as_zero():
    matches = [("agent:main:a", {}), ("agent:main:b", {"sessionId": "x"})]
    # Both treated as updatedAt=0 -> tied -> ambiguous, no crash.
    selection = resolve_session_id_match_selection(matches, "s1")
    assert isinstance(selection, SelectionAmbiguous)


def test_empty_session_id_does_not_crash():
    matches = [("agent:main:a", entry(10))]
    result = resolve_preferred_session_key_for_session_id_matches(matches, "")
    assert result == "agent:main:a"


def test_many_matches_does_not_crash():
    matches = [(f"agent:main:key{i}", entry(i)) for i in range(2000)]
    result = resolve_preferred_session_key_for_session_id_matches(matches, "s1")
    assert result == "agent:main:key1999"
