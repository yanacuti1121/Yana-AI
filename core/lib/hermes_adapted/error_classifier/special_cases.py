"""Provider-specific special cases checked before generic status/message rules.

Origin: NousResearch/hermes-agent agent/error_classifier.py (MIT) — see
        core/lib/hermes_adapted/error_classifier/__init__.py for port notes.

These were inline checks at the top of ``classify_api_error`` (step 1 of the
pipeline); extracted into named functions, called in the same order, with
identical patterns and identical recovery hints.
"""
from __future__ import annotations

from typing import Optional

from core.lib.hermes_adapted.error_classifier.patterns_request import CONTENT_POLICY_BLOCKED_PATTERNS
from core.lib.hermes_adapted.error_classifier.taxonomy import FailoverReason


def check_content_policy_blocked(error_msg: str, result_fn) -> Optional[object]:
    # The provider has made a deterministic refusal decision about THIS
    # prompt — retrying unchanged just reproduces the same refusal and burns
    # paid attempts. Must run before status-based classification so a 400
    # safety block isn't downgraded to a generic format_error and a
    # status-less block (OpenAI Codex SDK can raise without one) isn't left
    # in the retryable "unknown" bucket. See issue #18028.
    if any(p in error_msg for p in CONTENT_POLICY_BLOCKED_PATTERNS):
        return result_fn(FailoverReason.content_policy_blocked, retryable=False, should_fallback=True)
    return None


def check_thinking_signature(status_code: Optional[int], error_msg: str, result_fn) -> Optional[object]:
    # Anthropic thinking block recovery (400).  Two distinct failure modes,
    # same recovery (strip all reasoning_details and retry without thinking
    # blocks):
    #   1. Signature mismatch: a thinking block is signed against the full
    #      turn content; any upstream mutation invalidates the signature.
    #      Pattern: "signature" + "thinking".
    #   2. Frozen-block mutation: Anthropic rejects any change to the
    #      thinking/redacted_thinking blocks in the latest assistant message.
    #      Pattern: "thinking" + ("cannot be modified" | "must remain as they were").
    # Don't gate on provider — OpenRouter proxies Anthropic errors, so the
    # provider may be "openrouter" even though the error is Anthropic-specific.
    if (
        status_code == 400
        and "thinking" in error_msg
        and (
            "signature" in error_msg
            or "cannot be modified" in error_msg
            or "must remain as they were" in error_msg
        )
    ):
        return result_fn(FailoverReason.thinking_signature, retryable=True, should_compress=False)
    return None


def check_long_context_tier(status_code: Optional[int], error_msg: str, result_fn) -> Optional[object]:
    # Anthropic long-context tier gate (429 "extra usage" + "long context")
    if status_code == 429 and "extra usage" in error_msg and "long context" in error_msg:
        return result_fn(FailoverReason.long_context_tier, retryable=True, should_compress=True)
    return None


def check_oauth_long_context_beta(status_code: Optional[int], error_msg: str, result_fn) -> Optional[object]:
    # Anthropic OAuth subscription rejects the 1M-context beta header.
    # Observed error body: "The long context beta is not yet available for
    # this subscription." Returned as HTTP 400 from native Anthropic even
    # though the request carries `anthropic-beta: context-1m-2025-08-07`.
    if status_code == 400 and "long context beta" in error_msg and "not yet available" in error_msg:
        return result_fn(FailoverReason.oauth_long_context_beta_forbidden, retryable=True, should_compress=False)
    return None


def check_llama_cpp_grammar(status_code: Optional[int], error_msg: str, result_fn) -> Optional[object]:
    # llama.cpp's json-schema-to-grammar converter (used by its OAI server to
    # build GBNF tool-call parsers) rejects regex escape classes like
    # \d/\w/\s and most `format` values. MCP servers routinely emit
    # `"pattern": "\\d{4}-\\d{2}-\\d{2}"` for date/phone/email params.
    if status_code == 400 and (
        "error parsing grammar" in error_msg
        or "json-schema-to-grammar" in error_msg
        or ("unable to generate parser" in error_msg and "template" in error_msg)
    ):
        return result_fn(FailoverReason.llama_cpp_grammar_pattern, retryable=True, should_compress=False)
    return None


def check_grok_entitlement(error_msg: str, result_fn) -> Optional[object]:
    # xAI Grok subscription entitlement errors, surfaced through an SSE
    # type=error frame with status_code=None — without this guard the error
    # falls through to FailoverReason.unknown (retryable=True), burning
    # max_retries before the agent stops.
    if (
        "do not have an active grok subscription" in error_msg
        or ("out of available resources" in error_msg and "grok" in error_msg)
    ):
        return result_fn(FailoverReason.auth, retryable=False, should_fallback=True)
    return None
