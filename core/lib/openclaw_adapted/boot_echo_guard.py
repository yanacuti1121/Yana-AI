"""Defense-in-depth check for outbound text that substantially echoes a boot/system prompt.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/boot-echo-guard.ts (MIT)
Ported:  2026-06-20. The algorithm (chunked substring echo detection) is a
         direct translation. The original holds its two Maps as module-level
         mutable state with standalone functions; ported here as a class
         instance instead so state does not leak across test runs / sessions
         that import this module -- a structural adaptation, not a logic
         change.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: a model that paraphrases out delimiter markers but reproduces a long
contiguous chunk of the system/boot prompt content slips past simple marker
stripping. This adds a substantial-echo check (sliding-window substring
match) against the active boot/system prompt as a second line of defense --
directly relevant to Yana AI's owasp-llm-output-law.md (no system prompt
leakage to the user/output channel).
"""
from __future__ import annotations

import re

MIN_ECHO_CHARS = 80

_WHITESPACE_RE = re.compile(r"\s+", re.UNICODE)


def _normalize_echo_comparison_text(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


class BootEchoGuard:
    """Per-session tracker of the active boot/system prompt for echo detection."""

    def __init__(self) -> None:
        self._boot_context_by_session_key: dict[str, tuple[str, str]] = {}
        self._boot_chunks_by_normalized_prompt: dict[str, dict[int, set[str]]] = {}

    def _get_boot_prompt_chunks(self, normalized_boot_prompt: str, min_len: int) -> set[str]:
        chunks_by_length = self._boot_chunks_by_normalized_prompt.setdefault(normalized_boot_prompt, {})
        cached = chunks_by_length.get(min_len)
        if cached is not None:
            return cached
        chunks = {
            normalized_boot_prompt[i : i + min_len]
            for i in range(0, len(normalized_boot_prompt) - min_len + 1)
        }
        chunks_by_length[min_len] = chunks
        return chunks

    def set_boot_echo_context_for_session(self, session_key: str, boot_prompt: str) -> None:
        if not session_key or not boot_prompt:
            return
        normalized_boot_prompt = _normalize_echo_comparison_text(boot_prompt)
        if len(normalized_boot_prompt) >= MIN_ECHO_CHARS:
            self._get_boot_prompt_chunks(normalized_boot_prompt, MIN_ECHO_CHARS)
        self._boot_context_by_session_key[session_key] = (boot_prompt, normalized_boot_prompt)

    def clear_boot_echo_context_for_session(self, session_key: str) -> None:
        if not session_key:
            return
        context = self._boot_context_by_session_key.pop(session_key, None)
        if context is not None:
            self._boot_chunks_by_normalized_prompt.pop(context[1], None)

    def get_boot_echo_context_for_session(self, session_key: str | None) -> str | None:
        if not session_key:
            return None
        context = self._boot_context_by_session_key.get(session_key)
        return context[0] if context else None

    def contains_substantial_boot_echo(
        self, outbound_text: str, boot_prompt: str, min_len: int = MIN_ECHO_CHARS
    ) -> bool:
        """True if outbound_text contains a contiguous substring of boot_prompt >= min_len chars."""
        haystack = _normalize_echo_comparison_text(outbound_text or "")
        needle = _normalize_echo_comparison_text(boot_prompt or "")
        if len(haystack) < min_len or len(needle) < min_len:
            return False
        boot_chunks = self._get_boot_prompt_chunks(needle, min_len)
        for i in range(0, len(haystack) - min_len + 1):
            if haystack[i : i + min_len] in boot_chunks:
                return True
        return False

    def strip_boot_echo_from_outbound_text(
        self, outbound_text: str, boot_prompt: str | None
    ) -> str:
        """Returns "" when outbound_text substantially echoes boot_prompt, else outbound_text unchanged."""
        if not boot_prompt:
            return outbound_text
        return "" if self.contains_substantial_boot_echo(outbound_text, boot_prompt) else outbound_text

    def reset_for_tests(self) -> None:
        self._boot_context_by_session_key.clear()
        self._boot_chunks_by_normalized_prompt.clear()
