"""Classify by HTTP status code, with message-aware refinement.

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.

The upstream ``_classify_by_status`` is one ~155-line function; the branches
with extra internal logic (403, 404, 500/502) are split into named helpers
here, the rest stay inline in the dispatcher — same priority order and
patterns as upstream.
"""
from __future__ import annotations

from typing import Optional

from core.lib.hermes_adapted.error_classifier.patterns_quota import (
    BILLING_PATTERNS,
    USAGE_LIMIT_PATTERNS,
    USAGE_LIMIT_TRANSIENT_SIGNALS,
)
from core.lib.hermes_adapted.error_classifier.patterns_request import (
    MODEL_NOT_FOUND_PATTERNS,
    PROVIDER_POLICY_BLOCKED_PATTERNS,
    REQUEST_VALIDATION_PATTERNS,
)
from core.lib.hermes_adapted.error_classifier.status_400 import classify_400
from core.lib.hermes_adapted.error_classifier.taxonomy import FailoverReason


def classify_402(error_msg: str, result_fn):
    """Disambiguate 402: billing exhaustion vs transient usage limit.

    The key insight from OpenClaw: some 402s are transient rate limits
    disguised as payment errors.  "Usage limit, try again in 5 minutes"
    is NOT a billing problem — it's a periodic quota that resets.
    """
    has_usage_limit = any(p in error_msg for p in USAGE_LIMIT_PATTERNS)
    has_transient_signal = any(p in error_msg for p in USAGE_LIMIT_TRANSIENT_SIGNALS)

    if has_usage_limit and has_transient_signal:
        return result_fn(
            FailoverReason.rate_limit, retryable=True,
            should_rotate_credential=True, should_fallback=True,
        )
    return result_fn(
        FailoverReason.billing, retryable=False,
        should_rotate_credential=True, should_fallback=True,
    )


def _classify_403(error_msg: str, result_fn):
    # OpenRouter 403 "key limit exceeded" is actually billing. Other
    # providers also use 403 for account-plan or credit exhaustion.
    if (
        "key limit exceeded" in error_msg
        or "spending limit" in error_msg
        or any(p in error_msg for p in BILLING_PATTERNS)
    ):
        return result_fn(
            FailoverReason.billing, retryable=False,
            should_rotate_credential=True, should_fallback=True,
        )
    return result_fn(FailoverReason.auth, retryable=False, should_fallback=True)


def _classify_404(error_msg: str, result_fn):
    # Nous API currently surfaces HA/NAS credit depletion as a paid model
    # becoming unavailable on the Free Tier, returned as 404 rather than 402.
    if any(p in error_msg for p in BILLING_PATTERNS):
        return result_fn(
            FailoverReason.billing, retryable=False,
            should_rotate_credential=True, should_fallback=True,
        )
    # OpenRouter policy-block 404 — distinct from "model not found". The
    # model exists; the user's account privacy setting excludes the only
    # endpoint serving it. Falling back won't help (same account setting).
    if any(p in error_msg for p in PROVIDER_POLICY_BLOCKED_PATTERNS):
        return result_fn(FailoverReason.provider_policy_blocked, retryable=False, should_fallback=False)
    if any(p in error_msg for p in MODEL_NOT_FOUND_PATTERNS):
        return result_fn(FailoverReason.model_not_found, retryable=False, should_fallback=True)
    # Generic 404 with no "model not found" signal — could be a wrong
    # endpoint path, a proxy routing glitch, or a transient backend issue.
    # Treat as unknown so the retry loop surfaces the real error instead.
    return result_fn(FailoverReason.unknown, retryable=True)


def _classify_5xx_server(error_msg: str, error_code: str, result_fn):
    # Some OpenAI-compatible gateways return request-validation errors with
    # a 5xx status (codex.nekos.me returns 502 for unknown/unsupported
    # parameters). These are deterministic — every retry gets the identical
    # rejection — so the generic "5xx → retryable server_error" rule would
    # turn one bad request into a retry flood.
    if (
        any(p in error_msg for p in REQUEST_VALIDATION_PATTERNS)
        or error_code.lower() in {"invalid_request_error", "unknown_parameter", "unsupported_parameter"}
    ):
        return result_fn(FailoverReason.format_error, retryable=False, should_fallback=True)
    return result_fn(FailoverReason.server_error, retryable=True)


def _exact_status_handlers(
    error_msg: str, error_code: str, body: dict,
    *, provider: str, model: str, approx_tokens: int, context_length: int,
    num_messages: int, result_fn,
) -> dict:
    """One lambda per status code with a non-generic recovery rule."""
    auth_401 = lambda: result_fn(
        # Not retryable on its own — credential pool rotation and
        # provider-specific refresh run before the retryability check in
        # run_agent.py.  If those succeed, the loop continues; if they
        # fail, retryable=False ensures the client-error abort path is hit.
        FailoverReason.auth, retryable=False,
        should_rotate_credential=True, should_fallback=True,
    )
    rate_limit_429 = lambda: result_fn(
        # Already checked long_context_tier earlier in the pipeline; this
        # is a normal rate limit.
        FailoverReason.rate_limit, retryable=True,
        should_rotate_credential=True, should_fallback=True,
    )
    return {
        401: auth_401,
        403: lambda: _classify_403(error_msg, result_fn),
        402: lambda: classify_402(error_msg, result_fn),
        404: lambda: _classify_404(error_msg, result_fn),
        413: lambda: result_fn(FailoverReason.payload_too_large, retryable=True, should_compress=True),
        429: rate_limit_429,
        400: lambda: classify_400(
            error_msg, error_code, body, provider=provider, model=model,
            approx_tokens=approx_tokens, context_length=context_length,
            num_messages=num_messages, result_fn=result_fn,
        ),
        500: lambda: _classify_5xx_server(error_msg, error_code, result_fn),
        502: lambda: _classify_5xx_server(error_msg, error_code, result_fn),
        503: lambda: result_fn(FailoverReason.overloaded, retryable=True),
        529: lambda: result_fn(FailoverReason.overloaded, retryable=True),
    }


def classify_by_status(
    status_code: int,
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
) -> Optional[object]:
    """Classify based on HTTP status code with message-aware refinement."""
    handlers = _exact_status_handlers(
        error_msg, error_code, body, provider=provider, model=model,
        approx_tokens=approx_tokens, context_length=context_length,
        num_messages=num_messages, result_fn=result_fn,
    )
    if status_code in handlers:
        return handlers[status_code]()
    if 400 <= status_code < 500:
        return result_fn(FailoverReason.format_error, retryable=False, should_fallback=True)
    if 500 <= status_code < 600:
        return result_fn(FailoverReason.server_error, retryable=True)
    return None
