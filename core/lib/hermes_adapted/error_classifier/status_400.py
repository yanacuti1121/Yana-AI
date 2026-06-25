"""Classify HTTP 400 Bad Request — context overflow, format error, or generic.

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.

The upstream ``_classify_400`` is one ~155-line function; split here into
named per-signal checks (each under the 50-line function limit) called in
the same priority order as upstream, with identical patterns and identical
recovery hints.
"""
from __future__ import annotations

from typing import Optional

from core.lib.hermes_adapted.error_classifier.patterns_payload import (
    IMAGE_TOO_LARGE_PATTERNS,
    MULTIMODAL_TOOL_CONTENT_PATTERNS,
)
from core.lib.hermes_adapted.error_classifier.patterns_quota import (
    BILLING_PATTERNS,
    RATE_LIMIT_PATTERNS,
)
from core.lib.hermes_adapted.error_classifier.patterns_request import (
    CONTEXT_OVERFLOW_PATTERNS,
    MODEL_NOT_FOUND_PATTERNS,
    PROVIDER_POLICY_BLOCKED_PATTERNS,
    REQUEST_VALIDATION_PATTERNS,
)
from core.lib.hermes_adapted.error_classifier.taxonomy import FailoverReason


def _check_multimodal_or_image(error_msg: str, result_fn) -> Optional[object]:
    # Multimodal tool content rejected from 400.  Must be checked BEFORE
    # image_too_large because the recovery is different (strip image parts
    # from tool messages, mark the model as no-list-tool-content for the
    # rest of the session) and BEFORE context_overflow because some of the
    # patterns ("text is not set") are ambiguous in isolation but become
    # specific when combined with a 400 on a request known to contain
    # multimodal tool content.
    if any(p in error_msg for p in MULTIMODAL_TOOL_CONTENT_PATTERNS):
        return result_fn(FailoverReason.multimodal_tool_content_unsupported, retryable=True)
    # Image-too-large from 400 (Anthropic's 5 MB per-image check fires this way).
    # Must be checked BEFORE context_overflow because messages can trip both
    # patterns ("exceeds" + "image") and image-shrink is a cheaper recovery.
    if any(p in error_msg for p in IMAGE_TOO_LARGE_PATTERNS):
        return result_fn(FailoverReason.image_too_large, retryable=True)
    return None


def _check_invalid_encrypted_content(error_msg: str, error_code_lower: str, result_fn) -> Optional[object]:
    # Invalid encrypted reasoning replay blob (OpenAI Responses API).  Must be
    # checked BEFORE context_overflow because some surfaces emit messages that
    # contain context-like phrasing ("encrypted content … could not be
    # verified") which could otherwise trip the context_overflow heuristics.
    if (
        error_code_lower == "invalid_encrypted_content"
        or "invalid_encrypted_content" in error_msg
        or ("encrypted content for item" in error_msg and "could not be verified" in error_msg)
    ):
        return result_fn(FailoverReason.invalid_encrypted_content, retryable=True, should_fallback=False)
    return None


def _check_request_validation(error_msg: str, error_code_lower: str, result_fn) -> Optional[object]:
    # Request-validation errors (unsupported / unknown parameter) MUST be
    # checked BEFORE context_overflow.  A GPT-5 model rejecting max_tokens
    # returns a message containing the literal substring "max_tokens", which
    # is also a context-overflow pattern — without this guard the 400 would
    # be misclassified as context_overflow and re-sent unchanged forever.
    #
    # NOTE: we deliberately do NOT key off the generic ``invalid_request_error``
    # code here — OpenAI stamps that same code on genuine context-overflow 400s,
    # so matching it would mis-route real overflows away from compression.
    if (
        any(p in error_msg for p in REQUEST_VALIDATION_PATTERNS if p != "invalid_request_error")
        or error_code_lower in {"unknown_parameter", "unsupported_parameter"}
    ):
        return result_fn(FailoverReason.format_error, retryable=False, should_fallback=True)
    return None


def _check_context_overflow(error_msg: str, result_fn) -> Optional[object]:
    if any(p in error_msg for p in CONTEXT_OVERFLOW_PATTERNS):
        return result_fn(FailoverReason.context_overflow, retryable=True, should_compress=True)
    return None


def _check_policy_or_model(error_msg: str, result_fn) -> Optional[object]:
    # Some providers return model-not-found as 400 instead of 404 (e.g. OpenRouter).
    if any(p in error_msg for p in PROVIDER_POLICY_BLOCKED_PATTERNS):
        return result_fn(FailoverReason.provider_policy_blocked, retryable=False, should_fallback=False)
    if any(p in error_msg for p in MODEL_NOT_FOUND_PATTERNS):
        return result_fn(FailoverReason.model_not_found, retryable=False, should_fallback=True)
    return None


def _check_rate_limit_or_billing(error_msg: str, result_fn) -> Optional[object]:
    # Some providers return rate limit / billing errors as 400 instead of 429/402.
    # Check these patterns before falling through to format_error.
    if any(p in error_msg for p in RATE_LIMIT_PATTERNS):
        return result_fn(
            FailoverReason.rate_limit, retryable=True,
            should_rotate_credential=True, should_fallback=True,
        )
    if any(p in error_msg for p in BILLING_PATTERNS):
        return result_fn(
            FailoverReason.billing, retryable=False,
            should_rotate_credential=True, should_fallback=True,
        )
    return None


def _generic_400_body_message(body: dict) -> str:
    err_body_msg = ""
    if isinstance(body, dict):
        err_obj = body.get("error", {})
        if isinstance(err_obj, dict):
            err_body_msg = str(err_obj.get("message") or "").strip().lower()
        # Responses API (and some providers) use flat body: {"message": "..."}
        if not err_body_msg:
            err_body_msg = str(body.get("message") or "").strip().lower()
    return err_body_msg


def _check_generic_large_session(
    body: dict, *, approx_tokens: int, context_length: int, num_messages: int, result_fn,
) -> Optional[object]:
    # Generic 400 + large session → probable context overflow.
    # Anthropic sometimes returns a bare "Error" message when context is too large.
    err_body_msg = _generic_400_body_message(body)
    is_generic = len(err_body_msg) < 30 or err_body_msg in {"error", ""}
    # Absolute token/message-count thresholds are only a proxy for smaller
    # context windows.  Large-context sessions can have many messages while
    # still being far below their actual token budget.
    is_large = approx_tokens > context_length * 0.4 or (
        context_length <= 256000 and (approx_tokens > 80000 or num_messages > 80)
    )
    if is_generic and is_large:
        return result_fn(FailoverReason.context_overflow, retryable=True, should_compress=True)
    return None


def classify_400(
    error_msg: str,
    error_code: str,
    body: dict,
    *,
    provider: str,
    model: str,
    approx_tokens: int,
    context_length: int,
    num_messages: int = 0,
    result_fn,
):
    """Classify 400 Bad Request — context overflow, format error, or generic."""
    error_code_lower = (error_code or "").lower()
    del provider, model  # accepted for call-site symmetry with _classify_by_status; unused here, as in upstream

    for check in (
        lambda: _check_multimodal_or_image(error_msg, result_fn),
        lambda: _check_invalid_encrypted_content(error_msg, error_code_lower, result_fn),
        lambda: _check_request_validation(error_msg, error_code_lower, result_fn),
        lambda: _check_context_overflow(error_msg, result_fn),
        lambda: _check_policy_or_model(error_msg, result_fn),
        lambda: _check_rate_limit_or_billing(error_msg, result_fn),
        lambda: _check_generic_large_session(
            body, approx_tokens=approx_tokens, context_length=context_length,
            num_messages=num_messages, result_fn=result_fn,
        ),
    ):
        outcome = check()
        if outcome is not None:
            return outcome

    # Non-retryable format error
    return result_fn(FailoverReason.format_error, retryable=False, should_fallback=True)
