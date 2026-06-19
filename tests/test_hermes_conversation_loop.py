"""Smoke test for the ported turn-loop building blocks.

Origin: core/lib/hermes_adapted/conversation_loop.py
        (ported from NousResearch/hermes-agent, MIT)
"""
from core.lib.hermes_adapted.conversation_loop import (
    ClassifiedError,
    FailoverReason,
    IterationBudget,
    classify_api_error,
    jittered_backoff,
)


def test_iteration_budget_consume_and_exhaust():
    budget = IterationBudget(max_total=2)
    assert budget.consume() is True
    assert budget.consume() is True
    assert budget.consume() is False  # exhausted
    assert budget.remaining == 0


def test_iteration_budget_refund_gives_back_one():
    budget = IterationBudget(max_total=1)
    budget.consume()
    assert budget.remaining == 0
    budget.refund()
    assert budget.remaining == 1


def test_jittered_backoff_grows_exponentially_and_caps():
    d1 = jittered_backoff(1, base_delay=10, max_delay=100, jitter_ratio=0)
    d2 = jittered_backoff(2, base_delay=10, max_delay=100, jitter_ratio=0)
    d10 = jittered_backoff(10, base_delay=10, max_delay=100, jitter_ratio=0)
    assert d1 == 10.0
    assert d2 == 20.0
    assert d10 == 100.0  # capped


def test_jittered_backoff_adds_nonzero_jitter_when_ratio_positive():
    delays = {jittered_backoff(3, base_delay=5, jitter_ratio=0.5) for _ in range(5)}
    assert len(delays) > 1  # jitter makes repeated calls differ


def test_classify_api_error_401_is_auth_non_retryable():
    result = classify_api_error(401, "Unauthorized")
    assert result.reason is FailoverReason.auth
    assert result.retryable is False
    assert result.should_rotate_credential is True


def test_classify_api_error_429_is_rate_limit_retryable():
    result = classify_api_error(429, "Too Many Requests")
    assert result.reason is FailoverReason.rate_limit
    assert result.retryable is True


def test_classify_api_error_402_is_billing():
    result = classify_api_error(402, "Payment Required")
    assert result.reason is FailoverReason.billing
    assert result.retryable is False


def test_classify_api_error_403_with_billing_keywords_reclassified_as_billing():
    result = classify_api_error(403, "Error: insufficient credits remaining")
    assert result.reason is FailoverReason.billing


def test_classify_api_error_context_overflow_detected_before_status_code():
    result = classify_api_error(400, "bad request", approx_tokens=300_000, context_length=200_000)
    assert result.reason is FailoverReason.context_overflow
    assert result.should_compress is True


def test_classify_api_error_503_is_overloaded():
    assert classify_api_error(503, "Service Unavailable").reason is FailoverReason.overloaded


def test_classify_api_error_no_status_code_falls_back_to_keyword_match():
    result = classify_api_error(None, "Connection timed out while waiting for response")
    assert result.reason is FailoverReason.timeout


def test_classify_api_error_unknown_when_nothing_matches():
    result = classify_api_error(None, "something weird happened")
    assert result.reason is FailoverReason.unknown
    assert result.retryable is True


def test_classify_api_error_ssl_alert_is_timeout_even_on_large_session():
    result = classify_api_error(
        None, "SSL: BAD_RECORD_MAC alert during handshake",
        approx_tokens=190_000, context_length=200_000,
    )
    assert result.reason is FailoverReason.timeout  # never context_overflow for SSL


def test_classify_api_error_disconnect_on_small_session_is_timeout():
    result = classify_api_error(
        None, "Server disconnected without sending a response",
        approx_tokens=500, context_length=200_000, num_messages=5,
    )
    assert result.reason is FailoverReason.timeout


def test_classify_api_error_disconnect_on_large_session_is_context_overflow():
    result = classify_api_error(
        None, "peer closed connection unexpectedly",
        approx_tokens=150_000, context_length=200_000, num_messages=5,
    )
    assert result.reason is FailoverReason.context_overflow
    assert result.should_compress is True


def test_classify_api_error_disconnect_on_large_message_count_is_context_overflow():
    result = classify_api_error(
        None, "connection reset by peer",
        approx_tokens=1_000, context_length=200_000, num_messages=250,
    )
    assert result.reason is FailoverReason.context_overflow


def test_classify_api_error_generic_timeout_message_pattern():
    result = classify_api_error(None, "RuntimeError: operation timed out after 30s")
    assert result.reason is FailoverReason.timeout
