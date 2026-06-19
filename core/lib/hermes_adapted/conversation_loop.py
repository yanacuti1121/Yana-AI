"""Turn-loop building blocks: iteration budget, jittered backoff, error
classification — NOT a port of the conversation loop itself.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/conversation_loop.py + agent/iteration_budget.py +
         agent/retry_utils.py + agent/error_classifier.py (MIT License)
Ported:  2026-06-19.

**Scope note (read before extending):** `conversation_loop.py` in the
original is, by its own docstring, "the roughly 3,900-line run_conversation
body that drives one user turn through the agent" — extracted from
`run_agent.AIAgent` and mutating that object's state directly through ~15
sibling hermes modules (turn_context, message_sanitization, prompt_caching,
trajectory, usage_pricing, ...). There is no standalone "conversation loop
algorithm" to port; it is hermes' entire runtime orchestration glue, and
porting it verbatim would mean dragging in most of hermes-agent's ~110-file
package — exactly the "rau ria" (peripheral bulk) this integration is
explicitly meant to filter out.

What *is* real, portable algorithm — and what this module ports — are three
small sibling files the loop depends on, each already self-contained in the
original:
  - `IterationBudget`      (agent/iteration_budget.py, 62 lines, verbatim)
  - `jittered_backoff()`   (agent/retry_utils.py, 57 lines, verbatim)
  - `FailoverReason` / `ClassifiedError` / `classify_api_error()`
    (agent/error_classifier.py, 1365 lines in the original — condensed here
    to the generic HTTP-status-code + billing/rate-limit keyword pipeline;
    the ~15 provider-specific branches — Anthropic thinking-block signature
    mismatches, llama.cpp grammar pattern stripping, OpenRouter metadata.raw
    unwrapping, Copilot SDK quirks — are hermes/provider-specific and
    excluded, not silently dropped: that is the explicit scope cut.)

`TurnRetryState` (agent/turn_retry_state.py) was read but not ported: every
field on it is a one-shot guard for a hermes-specific recovery branch
(codex_auth_retry_attempted, llama_cpp_grammar_retry_attempted, ...) with no
generic algorithm underneath — there is nothing language-agnostic left once
the hermes-specific guards are removed.
License: MIT (see vendor/hermes-agent/_upstream/LICENSE)
"""
from __future__ import annotations

import enum
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


class IterationBudget:
    """Thread-safe iteration counter for an agent turn loop.

    Each agent (parent or sub-agent) gets its own budget capped at
    `max_total`. Iterations spent on bookkeeping (not real model/tool work)
    can be given back via `refund()` so they don't eat into the budget.
    """

    def __init__(self, max_total: int):
        self.max_total = max_total
        self._used = 0
        self._lock = threading.Lock()

    def consume(self) -> bool:
        """Try to consume one iteration. Returns True if allowed."""
        with self._lock:
            if self._used >= self.max_total:
                return False
            self._used += 1
            return True

    def refund(self) -> None:
        with self._lock:
            if self._used > 0:
                self._used -= 1

    @property
    def used(self) -> int:
        with self._lock:
            return self._used

    @property
    def remaining(self) -> int:
        with self._lock:
            return max(0, self.max_total - self._used)


_jitter_counter = 0
_jitter_lock = threading.Lock()


def jittered_backoff(attempt: int, *, base_delay: float = 5.0,
                      max_delay: float = 120.0, jitter_ratio: float = 0.5) -> float:
    """Jittered exponential backoff: min(base * 2^(attempt-1), max) + jitter.

    The jitter decorrelates concurrent retries so multiple callers hitting
    the same rate-limited provider don't all retry at the same instant.
    """
    global _jitter_counter
    with _jitter_lock:
        _jitter_counter += 1
        tick = _jitter_counter

    exponent = max(0, attempt - 1)
    delay = max_delay if exponent >= 63 or base_delay <= 0 else min(base_delay * (2 ** exponent), max_delay)

    seed = (time.time_ns() ^ (tick * 0x9E3779B9)) & 0xFFFFFFFF
    jitter = random.Random(seed).uniform(0, jitter_ratio * delay)
    return delay + jitter


class FailoverReason(enum.Enum):
    """Why an API call failed — determines recovery strategy."""
    auth = "auth"
    billing = "billing"
    rate_limit = "rate_limit"
    overloaded = "overloaded"
    server_error = "server_error"
    timeout = "timeout"
    context_overflow = "context_overflow"
    payload_too_large = "payload_too_large"
    model_not_found = "model_not_found"
    format_error = "format_error"
    unknown = "unknown"


@dataclass
class ClassifiedError:
    """Structured classification of an API error with recovery hints."""
    reason: FailoverReason
    status_code: Optional[int] = None
    message: str = ""
    error_context: Dict[str, Any] = field(default_factory=dict)
    retryable: bool = True
    should_compress: bool = False
    should_rotate_credential: bool = False
    should_fallback: bool = False

    @property
    def is_auth(self) -> bool:
        return self.reason is FailoverReason.auth


_BILLING_PATTERNS = (
    "insufficient credits", "insufficient_quota", "insufficient balance",
    "credit balance", "credits exhausted", "payment required",
    "billing hard limit", "exceeded your current quota", "out of funds",
)
_RATE_LIMIT_PATTERNS = (
    "rate limit", "rate_limit", "too many requests", "throttled",
    "requests per minute", "tokens per minute", "try again in", "resource_exhausted",
)
_TIMEOUT_MESSAGE_PATTERNS = (
    "timed out", "turn timed out", "request timed out", "deadline exceeded",
    "operation timed out", "upstream timed out",
)
# SSL/TLS mid-stream alerts are a transport hiccup, not a server-side
# context-overflow signal — classify as timeout, never as context_overflow,
# even on a large session (see _SERVER_DISCONNECT_PATTERNS below for the
# case that DOES get the large-session check).
_SSL_TRANSIENT_PATTERNS = (
    "bad record mac", "ssl alert", "tls alert", "ssl handshake failure",
    "bad_record_mac", "ssl_alert", "tls_alert", "[ssl:",
)
# A plain connection close is ambiguous: could be a transient transport
# hiccup, or the gateway dropping the connection instead of returning a
# proper 413/400 for an oversized request. Disambiguated by session size
# below (large session -> context_overflow, else -> timeout).
_SERVER_DISCONNECT_PATTERNS = (
    "server disconnected", "peer closed connection", "connection reset by peer",
    "connection was closed", "network connection lost", "unexpected eof",
    "incomplete chunked read",
)


def classify_api_error(status_code: Optional[int], message: str, *,
                        approx_tokens: int = 0, context_length: int = 200_000,
                        num_messages: int = 0) -> ClassifiedError:
    """Classify an API error into a structured recovery recommendation.

    Generic HTTP-status-code + keyword pipeline (condensed from the
    original's 8-stage, multi-provider pipeline — see module docstring for
    what was cut). Order: context overflow (token count) -> status code ->
    billing/rate-limit keyword disambiguation -> SSL/disconnect/timeout
    transport heuristics -> generic 4xx/5xx fallback -> unknown.
    """
    msg = (message or "").lower()

    if approx_tokens and context_length and approx_tokens > context_length:
        return ClassifiedError(FailoverReason.context_overflow, status_code, message,
                                retryable=True, should_compress=True)

    if status_code == 401:
        return ClassifiedError(FailoverReason.auth, status_code, message,
                                retryable=False, should_rotate_credential=True, should_fallback=True)
    if status_code == 403:
        if any(p in msg for p in _BILLING_PATTERNS) or "spending limit" in msg:
            return ClassifiedError(FailoverReason.billing, status_code, message,
                                    retryable=False, should_rotate_credential=True, should_fallback=True)
        return ClassifiedError(FailoverReason.auth, status_code, message, retryable=False, should_fallback=True)
    if status_code == 402:
        return ClassifiedError(FailoverReason.billing, status_code, message,
                                retryable=False, should_rotate_credential=True, should_fallback=True)
    if status_code == 404:
        return ClassifiedError(FailoverReason.model_not_found, status_code, message,
                                retryable=False, should_fallback=True)
    if status_code == 413:
        return ClassifiedError(FailoverReason.payload_too_large, status_code, message,
                                retryable=True, should_compress=True)
    if status_code == 429:
        return ClassifiedError(FailoverReason.rate_limit, status_code, message,
                                retryable=True, should_rotate_credential=True, should_fallback=True)
    if status_code == 400:
        if any(p in msg for p in _BILLING_PATTERNS):
            return ClassifiedError(FailoverReason.billing, status_code, message, retryable=False, should_fallback=True)
        return ClassifiedError(FailoverReason.format_error, status_code, message, retryable=False, should_fallback=True)
    if status_code in (500, 502):
        return ClassifiedError(FailoverReason.server_error, status_code, message, retryable=True)
    if status_code in (503, 529):
        return ClassifiedError(FailoverReason.overloaded, status_code, message, retryable=True)
    if status_code is not None and 400 <= status_code < 500:
        return ClassifiedError(FailoverReason.format_error, status_code, message, retryable=False, should_fallback=True)
    if status_code is not None and 500 <= status_code < 600:
        return ClassifiedError(FailoverReason.server_error, status_code, message, retryable=True)

    if any(p in msg for p in _RATE_LIMIT_PATTERNS):
        return ClassifiedError(FailoverReason.rate_limit, status_code, message,
                                retryable=True, should_rotate_credential=True, should_fallback=True)
    if any(p in msg for p in _BILLING_PATTERNS):
        return ClassifiedError(FailoverReason.billing, status_code, message,
                                retryable=False, should_rotate_credential=True, should_fallback=True)

    # SSL alerts → timeout, never context_overflow, regardless of session size.
    if any(p in msg for p in _SSL_TRANSIENT_PATTERNS):
        return ClassifiedError(FailoverReason.timeout, status_code, message, retryable=True)

    # Plain disconnect on a large session is more likely the gateway dropping
    # an oversized request than a transient network hiccup.
    if not status_code and any(p in msg for p in _SERVER_DISCONNECT_PATTERNS):
        is_large = (approx_tokens > context_length * 0.6
                    or (context_length <= 256_000 and (approx_tokens > 120_000 or num_messages > 200)))
        if is_large:
            return ClassifiedError(FailoverReason.context_overflow, status_code, message,
                                    retryable=True, should_compress=True)
        return ClassifiedError(FailoverReason.timeout, status_code, message, retryable=True)

    if any(p in msg for p in _TIMEOUT_MESSAGE_PATTERNS):
        return ClassifiedError(FailoverReason.timeout, status_code, message, retryable=True)

    return ClassifiedError(FailoverReason.unknown, status_code, message, retryable=True)
