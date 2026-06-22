"""Tests for the as_positive_safe_integer addition to the number-coercion port.

Origin: core/lib/openclaw_adapted/number_coercion.py (ported from openclaw/openclaw, MIT)

resolve_timer_timeout_ms and resolve_integer_option are covered indirectly via
tests/test_openclaw_gateway_batch2.py (auth_rate_limit, unauthorized_flood_guard);
this file covers only the new as_positive_safe_integer function, added for the
transcript_events.py port.
"""
from core.lib.openclaw_adapted.number_coercion import as_positive_safe_integer


def test_accepts_positive_int():
    assert as_positive_safe_integer(42) == 42
    assert as_positive_safe_integer(1) == 1


def test_accepts_positive_integer_valued_float():
    assert as_positive_safe_integer(3.0) == 3


def test_rejects_zero_and_negative():
    assert as_positive_safe_integer(0) is None
    assert as_positive_safe_integer(-1) is None
    assert as_positive_safe_integer(-3.0) is None


def test_rejects_non_integer_float():
    assert as_positive_safe_integer(1.5) is None


def test_rejects_non_numeric_and_bool():
    for value in (None, "42", [], {}, True, False, object()):
        assert as_positive_safe_integer(value) is None


def test_rejects_nan_and_infinity():
    assert as_positive_safe_integer(float("nan")) is None
    assert as_positive_safe_integer(float("inf")) is None
    assert as_positive_safe_integer(float("-inf")) is None


def test_max_safe_integer_boundary():
    max_safe = 2**53 - 1
    assert as_positive_safe_integer(max_safe) == max_safe
    assert as_positive_safe_integer(max_safe + 1) is None


def test_max_length_input_does_not_crash():
    assert as_positive_safe_integer(10**308) is None
