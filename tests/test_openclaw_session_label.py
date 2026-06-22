"""Tests for the openclaw_adapted session-label port.

Origin: core/lib/openclaw_adapted/session_label.py (ported from openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.session_label import (
    SESSION_LABEL_MAX_LENGTH,
    ParsedSessionLabelError,
    ParsedSessionLabelOk,
    parse_session_label,
)


def test_accepts_and_trims_valid_label():
    result = parse_session_label("  My Session  ")
    assert isinstance(result, ParsedSessionLabelOk)
    assert result.label == "My Session"
    assert result.ok is True


def test_rejects_non_string_input():
    for value in (None, 42, [], {}, True):
        result = parse_session_label(value)
        assert isinstance(result, ParsedSessionLabelError)
        assert result.error == "invalid label: must be a string"
        assert result.ok is False


def test_rejects_empty_or_whitespace_only_label():
    for value in ("", "   ", "\t\n"):
        result = parse_session_label(value)
        assert isinstance(result, ParsedSessionLabelError)
        assert result.error == "invalid label: empty"


def test_rejects_label_exceeding_max_length():
    result = parse_session_label("a" * (SESSION_LABEL_MAX_LENGTH + 1))
    assert isinstance(result, ParsedSessionLabelError)
    assert result.error == f"invalid label: too long (max {SESSION_LABEL_MAX_LENGTH})"


def test_accepts_label_at_exact_max_length():
    label = "a" * SESSION_LABEL_MAX_LENGTH
    result = parse_session_label(label)
    assert isinstance(result, ParsedSessionLabelOk)
    assert result.label == label


def test_null_byte_and_unicode_preserved_in_label():
    value = "label" + chr(0) + "🔥"
    result = parse_session_label(value)
    assert isinstance(result, ParsedSessionLabelOk)
    assert result.label == value
