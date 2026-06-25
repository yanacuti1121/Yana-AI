"""Classify by structured error code or by message pattern (no status code).

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.

The upstream ``_classify_by_message`` is one ~117-line function; split here
into named per-signal checks (each under the 50-line function limit) called
in the same priority order as upstream.
"""
from __future__ import annotations

from typing import Optional

from core.lib.hermes_adapted.error_classifier.patterns_payload import (
    IMAGE_TOO_LARGE_PATTERNS,
    MULTIMODAL_TOOL_CONTENT_PATTERNS,
    PAYLOAD_TOO_LARGE_PATTERNS,
)
from core.lib.hermes_adapted.error_classifier.patterns_quota import (
    BILLING_PATTERNS,
    RATE_LIMIT_PATTERNS,
    USAGE_LIMIT_PATTERNS,
    USAGE_LIMIT_TRANSIENT_SIGNALS,
)
from core.lib.hermes_adapted.error_classifier.patterns_request import (
    AUTH_PATTERNS,
    CONTEXT_OVERFLOW_PATTERNS,
    MODEL_NOT_FOUND_PATTERNS,
    PROVIDER_POLICY_BLOCKED_PATTERNS,
)
from core.lib.hermes_adapted.error_classifier.patterns_transport import TIMEOUT_MESSAGE_PATTERNS
from core.lib.hermes_adapted.error_classifier.taxonomy import FailoverReason


def classify_by_error_code(error_code: str, error_msg: str, result_fn) -> Optional[object]:
    """Classify by structured error codes from the response body."""
    code_lower = error_code.lower()

    if code_lower in {"resource_exhausted", "throttled", "rate_limit_exceeded"}:
        return result_fn(FailoverReason.rate_limit, retryable=True, should_rotate_credential=True)

    if code_lower in {
        "insufficient_quota", "billing_not_active", "payment_required",
        "insufficient_credits", "no_usable_credits", "balance_depleted",
        "model_not_supported_on_free_tier",
    }:
        return result_fn(
            FailoverReason.billing, retryable=False,
            should_rotate_credential=True, should_fallback=True,
        )

    if code_lower in {"model_not_found", "model_not_available", "invalid_model"}:
        return result_fn(FailoverReason.model_not_found, retryable=False, should_fallback=True)

    if code_lower in {"context_length_exceeded", "max_tokens_exceeded"}:
        return result_fn(FailoverReason.context_overflow, retryable=True, should_compress=True)

    if code_lower == "invalid_encrypted_content":
        return result_fn(FailoverReason.invalid_encrypted_content, retryable=True, should_fallback=False)

    del error_msg  # accepted for call-site symmetry; unused, as in upstream
    return None


def _check_size_patterns(error_msg: str, result_fn) -> Optional[object]:
    if any(p in error_msg for p in PAYLOAD_TOO_LARGE_PATTERNS):
        return result_fn(FailoverReason.payload_too_large, retryable=True, should_compress=True)
    if any(p in error_msg for p in MULTIMODAL_TOOL_CONTENT_PATTERNS):
        return result_fn(FailoverReason.multimodal_tool_content_unsupported, retryable=True)
    if any(p in error_msg for p in IMAGE_TOO_LARGE_PATTERNS):
        return result_fn(FailoverReason.image_too_large, retryable=True)
    return None


def _check_usage_limit(error_msg: str, result_fn) -> Optional[object]:
    # Usage-limit patterns need the same disambiguation as 402: some
    # providers surface "usage limit" errors without an HTTP status code.
    if not any(p in error_msg for p in USAGE_LIMIT_PATTERNS):
        return None
    if any(p in error_msg for p in USAGE_LIMIT_TRANSIENT_SIGNALS):
        return result_fn(
            FailoverReason.rate_limit, retryable=True,
            should_rotate_credential=True, should_fallback=True,
        )
    return result_fn(
        FailoverReason.billing, retryable=False,
        should_rotate_credential=True, should_fallback=True,
    )


def _check_quota_patterns(error_msg: str, result_fn) -> Optional[object]:
    if any(p in error_msg for p in BILLING_PATTERNS):
        return result_fn(
            FailoverReason.billing, retryable=False,
            should_rotate_credential=True, should_fallback=True,
        )
    if any(p in error_msg for p in RATE_LIMIT_PATTERNS):
        return result_fn(
            FailoverReason.rate_limit, retryable=True,
            should_rotate_credential=True, should_fallback=True,
        )
    return None


def _check_auth_and_model(error_msg: str, result_fn) -> Optional[object]:
    # Auth errors should NOT be retried directly — the credential is invalid
    # and retrying with the same key will always fail.
    if any(p in error_msg for p in AUTH_PATTERNS):
        return result_fn(
            FailoverReason.auth, retryable=False,
            should_rotate_credential=True, should_fallback=True,
        )
    # Provider policy-block (aggregator-side guardrail) — check before
    # model_not_found so we don't mis-label as a missing model.
    if any(p in error_msg for p in PROVIDER_POLICY_BLOCKED_PATTERNS):
        return result_fn(FailoverReason.provider_policy_blocked, retryable=False, should_fallback=False)
    if any(p in error_msg for p in MODEL_NOT_FOUND_PATTERNS):
        return result_fn(FailoverReason.model_not_found, retryable=False, should_fallback=True)
    return None


def classify_by_message(
    error_msg: str,
    error_type: str,
    *,
    approx_tokens: int,
    context_length: int,
    result_fn,
) -> Optional[object]:
    """Classify based on error message patterns when no status code is available."""
    del error_type, approx_tokens, context_length  # accepted for call-site symmetry; unused, as in upstream

    for check in (
        lambda: _check_size_patterns(error_msg, result_fn),
        lambda: _check_usage_limit(error_msg, result_fn),
        lambda: _check_quota_patterns(error_msg, result_fn),
        lambda: result_fn(FailoverReason.context_overflow, retryable=True, should_compress=True)
        if any(p in error_msg for p in CONTEXT_OVERFLOW_PATTERNS) else None,
        lambda: _check_auth_and_model(error_msg, result_fn),
        lambda: result_fn(FailoverReason.timeout, retryable=True)
        if any(p in error_msg for p in TIMEOUT_MESSAGE_PATTERNS) else None,
    ):
        outcome = check()
        if outcome is not None:
            return outcome
    return None
