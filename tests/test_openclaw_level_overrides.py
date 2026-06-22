"""Tests for the openclaw_adapted level-overrides port.

Origin: core/lib/openclaw_adapted/level_overrides.py (ported from
openclaw/openclaw, MIT). No upstream .test.ts exists for this module
(verified: not present in src/sessions/ at the pinned commit) -- cases below
are derived directly from reading level-overrides.ts + thinking.shared.ts.
"""
from core.lib.openclaw_adapted.level_overrides import (
    UNSET,
    ParsedOverrideError,
    ParsedOverrideOk,
    apply_trace_override,
    apply_verbose_override,
    normalize_trace_level,
    normalize_verbose_level,
    parse_trace_override,
    parse_verbose_override,
)


def test_normalize_verbose_level_aliases():
    assert normalize_verbose_level("off") == "off"
    assert normalize_verbose_level("FALSE") == "off"
    assert normalize_verbose_level("no") == "off"
    assert normalize_verbose_level("0") == "off"
    assert normalize_verbose_level("full") == "full"
    assert normalize_verbose_level("ALL") == "full"
    assert normalize_verbose_level("everything") == "full"
    assert normalize_verbose_level("on") == "on"
    assert normalize_verbose_level("minimal") == "on"
    assert normalize_verbose_level("true") == "on"
    assert normalize_verbose_level("1") == "on"


def test_normalize_verbose_level_rejects_unknown_or_empty():
    assert normalize_verbose_level("bogus") is None
    assert normalize_verbose_level("") is None
    assert normalize_verbose_level(None) is None


def test_normalize_trace_level_aliases():
    assert normalize_trace_level("off") == "off"
    assert normalize_trace_level("no") == "off"
    assert normalize_trace_level("on") == "on"
    assert normalize_trace_level("yes") == "on"
    assert normalize_trace_level("raw") == "raw"
    assert normalize_trace_level("UNFILTERED") == "raw"


def test_normalize_trace_level_rejects_unknown():
    assert normalize_trace_level("full") is None  # full is a verbose-only alias
    assert normalize_trace_level("bogus") is None


def test_parse_verbose_override_tri_state():
    unset_result = parse_verbose_override()
    assert isinstance(unset_result, ParsedOverrideOk)
    assert unset_result.value is UNSET

    clear_result = parse_verbose_override(None)
    assert isinstance(clear_result, ParsedOverrideOk)
    assert clear_result.value is None

    set_result = parse_verbose_override("full")
    assert isinstance(set_result, ParsedOverrideOk)
    assert set_result.value == "full"


def test_parse_verbose_override_rejects_invalid():
    result = parse_verbose_override("bogus")
    assert isinstance(result, ParsedOverrideError)
    assert result.error == 'invalid verboseLevel (use "on"|"off"|"full")'

    non_string_result = parse_verbose_override(42)
    assert isinstance(non_string_result, ParsedOverrideError)


def test_parse_trace_override_tri_state_and_invalid():
    assert parse_trace_override().value is UNSET
    assert parse_trace_override(None).value is None
    assert parse_trace_override("raw").value == "raw"

    result = parse_trace_override("bogus")
    assert isinstance(result, ParsedOverrideError)
    assert result.error == 'invalid traceLevel (use "on"|"off"|"raw")'


def test_apply_verbose_override_unset_is_noop():
    entry = {"verboseLevel": "on"}
    apply_verbose_override(entry)
    assert entry == {"verboseLevel": "on"}


def test_apply_verbose_override_none_clears():
    entry = {"verboseLevel": "on"}
    apply_verbose_override(entry, None)
    assert "verboseLevel" not in entry


def test_apply_verbose_override_clearing_absent_key_does_not_crash():
    entry: dict = {}
    apply_verbose_override(entry, None)
    assert entry == {}


def test_apply_verbose_override_sets_value():
    entry: dict = {}
    apply_verbose_override(entry, "full")
    assert entry["verboseLevel"] == "full"


def test_apply_trace_override_tri_state_behavior():
    entry = {"traceLevel": "on"}
    apply_trace_override(entry)
    assert entry["traceLevel"] == "on"

    apply_trace_override(entry, None)
    assert "traceLevel" not in entry

    apply_trace_override(entry, "raw")
    assert entry["traceLevel"] == "raw"
