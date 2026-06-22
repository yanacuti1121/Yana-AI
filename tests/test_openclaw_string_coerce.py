"""Tests for the openclaw_adapted string-coerce port.

Origin: core/lib/openclaw_adapted/string_coerce.py (ported from openclaw/openclaw, MIT)
"""
from core.lib.openclaw_adapted.string_coerce import (
    normalize_lowercase_string_or_empty,
    normalize_nullable_string,
    normalize_optional_lowercase_string,
    normalize_optional_string,
)


# -- normalize_nullable_string / normalize_optional_string --


def test_trims_and_returns_value():
    assert normalize_nullable_string("  hello  ") == "hello"
    assert normalize_optional_string("  hello  ") == "hello"


def test_empty_string_returns_none():
    assert normalize_nullable_string("") is None


def test_whitespace_only_string_returns_none():
    assert normalize_nullable_string("   \t\n  ") is None


def test_non_string_inputs_return_none():
    for value in (None, 42, 3.14, True, False, [], {}, object()):
        assert normalize_nullable_string(value) is None


def test_max_length_input_does_not_crash():
    huge = ("  " + ("a" * 65536) + "  ")
    result = normalize_nullable_string(huge)
    assert result == "a" * 65536


def test_null_byte_preserved_when_not_at_edges():
    value = "key" + chr(0) + "val"
    assert normalize_nullable_string(value) == value


def test_crlf_trimmed_at_edges_preserved_inside():
    assert normalize_nullable_string("\r\nhello\r\n") == "hello"
    assert normalize_nullable_string("line1\r\nline2") == "line1\r\nline2"


def test_unicode_and_path_traversal_strings_preserved():
    assert normalize_nullable_string("  🔥emoji🔥  ") == "🔥emoji🔥"
    assert normalize_nullable_string("../../etc/passwd") == "../../etc/passwd"


# -- normalize_optional_lowercase_string --


def test_lowercases_normalized_string():
    assert normalize_optional_lowercase_string("  HELLO  ") == "hello"


def test_lowercase_none_for_empty_or_non_string():
    assert normalize_optional_lowercase_string("") is None
    assert normalize_optional_lowercase_string(None) is None
    assert normalize_optional_lowercase_string(123) is None


# -- normalize_lowercase_string_or_empty --


def test_lowercase_or_empty_returns_value():
    assert normalize_lowercase_string_or_empty("  Mixed Case  ") == "mixed case"


def test_lowercase_or_empty_returns_empty_string_when_absent():
    assert normalize_lowercase_string_or_empty("") == ""
    assert normalize_lowercase_string_or_empty(None) == ""
    assert normalize_lowercase_string_or_empty([1, 2, 3]) == ""
