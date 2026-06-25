"""Main classification pipeline — ``classify_api_error``.

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.

Priority-ordered pipeline (identical order to upstream):
  1. Special-case provider-specific patterns (thinking sigs, tier gates, ...)
  2. HTTP status code + message-aware refinement
  3. Error code classification (from body)
  4. Message pattern matching (billing vs rate_limit vs context vs auth)
  5. SSL/TLS transient alert patterns → retry as timeout
  6. Server disconnect + large session → context overflow
  7. Transport error heuristics
  8. Fallback: unknown (retryable with backoff)
"""
from __future__ import annotations

from typing import Optional

from core.lib.hermes_adapted.error_classifier import special_cases
from core.lib.hermes_adapted.error_classifier.extraction import (
    extract_error_body,
    extract_error_code,
    extract_message,
    extract_status_code,
)
from core.lib.hermes_adapted.error_classifier.message_builder import build_error_message
from core.lib.hermes_adapted.error_classifier.message_classifier import (
    classify_by_error_code,
    classify_by_message,
)
from core.lib.hermes_adapted.error_classifier.patterns_transport import (
    SERVER_DISCONNECT_PATTERNS,
    SSL_TRANSIENT_PATTERNS,
    TRANSPORT_ERROR_TYPES,
)
from core.lib.hermes_adapted.error_classifier.status_classifier import classify_by_status
from core.lib.hermes_adapted.error_classifier.taxonomy import ClassifiedError, FailoverReason


def _run_special_cases(status_code: Optional[int], error_msg: str, result_fn) -> Optional[ClassifiedError]:
    for check in (
        lambda: special_cases.check_content_policy_blocked(error_msg, result_fn),
        lambda: special_cases.check_thinking_signature(status_code, error_msg, result_fn),
        lambda: special_cases.check_long_context_tier(status_code, error_msg, result_fn),
        lambda: special_cases.check_oauth_long_context_beta(status_code, error_msg, result_fn),
        lambda: special_cases.check_llama_cpp_grammar(status_code, error_msg, result_fn),
        lambda: special_cases.check_grok_entitlement(error_msg, result_fn),
    ):
        outcome = check()
        if outcome is not None:
            return outcome
    return None


def _disconnect_or_transport(
    error: Exception, error_type: str, error_msg: str,
    *, status_code: Optional[int], approx_tokens: int, context_length: int,
    num_messages: int, result_fn,
) -> ClassifiedError:
    # Server disconnect + large session → context overflow.  Must come BEFORE
    # the generic transport error catch — a disconnect on a large session is
    # more likely context overflow than a transient transport hiccup.
    is_disconnect = any(p in error_msg for p in SERVER_DISCONNECT_PATTERNS)
    if is_disconnect and not status_code:
        # Absolute token/message-count thresholds are only a proxy for
        # smaller context windows. Large-context sessions can have hundreds
        # of messages while still being far below their actual token budget.
        is_large = approx_tokens > context_length * 0.6 or (
            context_length <= 256000 and (approx_tokens > 120000 or num_messages > 200)
        )
        if is_large:
            return result_fn(FailoverReason.context_overflow, retryable=True, should_compress=True)
        return result_fn(FailoverReason.timeout, retryable=True)

    if error_type in TRANSPORT_ERROR_TYPES or isinstance(error, (TimeoutError, ConnectionError, OSError)):
        return result_fn(FailoverReason.timeout, retryable=True)

    return result_fn(FailoverReason.unknown, retryable=True)


def _resolve_status_code(error: Exception, error_type: str) -> Optional[int]:
    status_code = extract_status_code(error)
    # Copilot/GitHub Models RateLimitError may not set .status_code; force
    # 429 so downstream rate-limit handling fires correctly.
    if status_code is None and error_type == "RateLimitError":
        return 429
    return status_code


def _make_result_fn(error: Exception, body: dict, status_code: Optional[int], provider: str, model: str):
    def _result(reason: FailoverReason, **overrides) -> ClassifiedError:
        defaults = {
            "reason": reason, "status_code": status_code, "provider": provider,
            "model": model, "message": extract_message(error, body),
        }
        defaults.update(overrides)
        return ClassifiedError(**defaults)

    return _result


def _classify_by_status_or_code(
    status_code: Optional[int], error_msg: str, error_code: str, body: dict,
    *, provider: str, model: str, approx_tokens: int, context_length: int,
    num_messages: int, result_fn,
) -> Optional[ClassifiedError]:
    if status_code is not None:
        by_status = classify_by_status(
            status_code, error_msg, error_code, body,
            provider=provider, model=model,
            approx_tokens=approx_tokens, context_length=context_length,
            num_messages=num_messages, result_fn=result_fn,
        )
        if by_status is not None:
            return by_status

    if error_code:
        return classify_by_error_code(error_code, error_msg, result_fn)
    return None


def classify_api_error(
    error: Exception,
    *,
    provider: str = "",
    model: str = "",
    approx_tokens: int = 0,
    context_length: int = 200000,
    num_messages: int = 0,
) -> ClassifiedError:
    """Classify an API error into a structured recovery recommendation."""
    error_type = type(error).__name__
    status_code = _resolve_status_code(error, error_type)
    body = extract_error_body(error)
    error_code = extract_error_code(body)
    error_msg = build_error_message(error, body)
    result_fn = _make_result_fn(error, body, status_code, provider, model)

    special = _run_special_cases(status_code, error_msg, result_fn)
    if special is not None:
        return special

    by_status_or_code = _classify_by_status_or_code(
        status_code, error_msg, error_code, body,
        provider=(provider or "").strip().lower(), model=(model or "").strip().lower(),
        approx_tokens=approx_tokens, context_length=context_length,
        num_messages=num_messages, result_fn=result_fn,
    )
    if by_status_or_code is not None:
        return by_status_or_code

    by_message = classify_by_message(
        error_msg, error_type,
        approx_tokens=approx_tokens, context_length=context_length, result_fn=result_fn,
    )
    if by_message is not None:
        return by_message

    if any(p in error_msg for p in SSL_TRANSIENT_PATTERNS):
        return result_fn(FailoverReason.timeout, retryable=True)

    return _disconnect_or_transport(
        error, error_type, error_msg,
        status_code=status_code, approx_tokens=approx_tokens,
        context_length=context_length, num_messages=num_messages, result_fn=result_fn,
    )
