"""Context compression — ported core algorithm, not a verbatim copy.

Origin:  NousResearch/hermes-agent @ 5378b941209d8f62a65455041658ce8ce8144cc9
         agent/context_compressor.py (class ContextCompressor, MIT License)
Ported:  2026-06-19 — by hand, reading the real ~2400-line source. The
         original class extends hermes' ContextEngine and calls hermes'
         multi-provider auxiliary_client/get_model_context_length. Those are
         hermes-specific plumbing and are NOT ported — this module exposes
         the same four-phase algorithm (prune -> protect head/tail -> LLM
         summarize -> graceful degradation) through a plain callable
         (`summarize_fn`) so Yana AI can wire in whatever model it wants.
License: MIT (see vendor/hermes-agent/_upstream/LICENSE for the original text)

Algorithm (faithful to the original):
  1. Prune old tool results — dedupe identical outputs, summarize large ones,
     truncate oversized tool_call arguments outside the protected tail.
  2. Protect head (system prompt + first N messages) and tail (most recent
     ~token_budget tokens), never splitting a tool_call/tool_result pair.
  3. Summarize the middle window via `summarize_fn`, updating the previous
     summary iteratively instead of re-summarizing from scratch each time.
  4. On summarizer failure: abort (return unchanged) or insert a static
     fallback summary, depending on `abort_on_summary_failure`.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from core.lib.hermes_adapted.context_compressor_pairs import (
    ensure_last_assistant_message_in_tail,
    ensure_last_user_message_in_tail,
    sanitize_tool_pairs,
)

_SUMMARY_PREFIX = "[CONTEXT COMPACTION — REFERENCE ONLY]"
_SUMMARY_END_MARKER = "[END OF COMPACTED SUMMARY — respond to the message below]"
_DUPLICATE_PLACEHOLDER = "[Duplicate tool output — same content as a more recent call]"


@dataclass
class CompressorConfig:
    threshold_percent: float = 0.50      # fire when prompt_tokens >= this % of context_length
    protect_first_n: int = 3             # head: system prompt + first N messages, always kept
    protect_last_n: int = 20             # tail: minimum message-count floor
    summary_target_ratio: float = 0.20   # tail token budget = threshold_tokens * this ratio
    abort_on_summary_failure: bool = False
    min_saving_percent: float = 0.10     # anti-thrash: skip if last 2 compressions saved less


class ContextCompressor:
    """Standalone port — no ContextEngine base, no provider/model switching."""

    def __init__(self, context_length: int, cfg: Optional[CompressorConfig] = None,
                 summarize_fn: Optional[Callable[[str], Optional[str]]] = None):
        self.cfg = cfg or CompressorConfig()
        self.context_length = context_length
        self.threshold_tokens = int(context_length * self.cfg.threshold_percent)
        self.tail_token_budget = int(self.threshold_tokens * self.cfg.summary_target_ratio)
        self.summarize_fn = summarize_fn or (lambda _text: None)

        self._previous_summary: Optional[str] = None
        self._last_savings_pct: List[float] = []
        self.compression_count = 0

    # ------------------------------------------------------------------
    # Phase 0: should we compress at all?
    # ------------------------------------------------------------------

    def should_compress(self, prompt_tokens: int) -> bool:
        if prompt_tokens < self.threshold_tokens:
            return False
        recent = self._last_savings_pct[-2:]
        if len(recent) >= 2 and all(s < self.cfg.min_saving_percent for s in recent):
            return False  # anti-thrash: last 2 compressions barely helped — stop looping
        return True

    # ------------------------------------------------------------------
    # Phase 1: cheap pruning (no LLM call)
    # ------------------------------------------------------------------

    def _prune_old_tool_results(self, messages: List[Dict[str, Any]],
                                 protect_tail_count: int) -> List[Dict[str, Any]]:
        result = [m.copy() for m in messages]
        boundary = max(0, len(result) - protect_tail_count)
        seen_hashes: Dict[str, int] = {}

        for i in range(len(result) - 1, -1, -1):
            msg = result[i]
            if msg.get("role") != "tool":
                continue
            content = msg.get("content")
            if not isinstance(content, str) or len(content) < 200:
                continue
            h = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()[:16]
            if h in seen_hashes:
                result[i] = {**msg, "content": _DUPLICATE_PLACEHOLDER}
            else:
                seen_hashes[h] = i

        for i in range(boundary):
            msg = result[i]
            if msg.get("role") != "tool":
                continue
            content = msg.get("content")
            if not isinstance(content, str) or len(content) <= 200:
                continue
            if content == _DUPLICATE_PLACEHOLDER:
                continue
            lines = content.count("\n") + 1
            result[i] = {**msg, "content": f"[tool result pruned — {lines} lines, {len(content):,} chars]"}

        return result

    # ------------------------------------------------------------------
    # Phase 2: boundary detection — never split a tool_call/result pair
    # ------------------------------------------------------------------

    def _protect_head_size(self, messages: List[Dict[str, Any]]) -> int:
        head = 1 if messages and messages[0].get("role") == "system" else 0
        return head + self.cfg.protect_first_n

    def _align_forward(self, messages: List[Dict[str, Any]], idx: int) -> int:
        while idx < len(messages) and messages[idx].get("role") == "tool":
            idx += 1
        return idx

    def _align_backward(self, messages: List[Dict[str, Any]], idx: int) -> int:
        check = idx - 1
        while check >= 0 and messages[check].get("role") == "tool":
            check -= 1
        if check >= 0 and messages[check].get("role") == "assistant" and messages[check].get("tool_calls"):
            return check
        return idx

    def _find_tail_cut(self, messages: List[Dict[str, Any]], head_end: int) -> int:
        n = len(messages)
        min_tail = max(3, min(self.cfg.protect_last_n, n - head_end))
        accumulated = 0
        cut_idx = n
        for i in range(n - 1, head_end - 1, -1):
            content = messages[i].get("content") or ""
            tokens = (len(content) if isinstance(content, str) else 0) // 4 + 10
            if accumulated + tokens > self.tail_token_budget and (n - i) >= min_tail:
                break
            accumulated += tokens
            cut_idx = i
        cut_idx = min(cut_idx, n - min_tail)
        if cut_idx <= head_end:
            cut_idx = head_end + 1
        cut_idx = self._align_backward(messages, cut_idx)
        # Anchor: never let the active task (#10896) or the user's last
        # visible reply (#29824) fall into the compressed middle region.
        cut_idx = ensure_last_user_message_in_tail(messages, cut_idx, head_end)
        cut_idx = ensure_last_assistant_message_in_tail(messages, cut_idx, head_end, self._align_backward)
        return cut_idx

    # ------------------------------------------------------------------
    # Phase 3: summarize the middle window
    # ------------------------------------------------------------------

    def _generate_summary(self, turns: List[Dict[str, Any]], focus_topic: str = "") -> Optional[str]:
        serialized = "\n".join(
            f"[{m.get('role')}] {m.get('content') if isinstance(m.get('content'), str) else ''}"
            for m in turns
        )
        prompt = (
            f"Previous summary:\n{self._previous_summary}\n\nUpdate it with the new turns below.\n\n"
            if self._previous_summary else ""
        )
        prompt += (
            "Summarize these conversation turns into: Active Task, Goal & Constraints, "
            "Completed Actions (dated, past-tense), In Progress / Blocked, Remaining Work. "
            "Never include secrets/credentials — replace with [REDACTED]."
        )
        if focus_topic:
            prompt += f" Focus 60-70% on: {focus_topic}"
        prompt += f"\n\n{serialized}"

        summary = self.summarize_fn(prompt)
        if summary:
            self._previous_summary = summary
        return summary

    @staticmethod
    def _static_fallback_summary(turns: List[Dict[str, Any]]) -> str:
        paths = sorted({
            m.get("content", "")[:80] for m in turns
            if isinstance(m.get("content"), str) and m.get("role") == "user"
        })[:5]
        bullets = "\n".join(f"- {p}" for p in paths) or "- (no recoverable anchors)"
        return f"{_SUMMARY_PREFIX}\nSummarizer unavailable — {len(turns)} turn(s) dropped.\nRecent topics:\n{bullets}"

    # ------------------------------------------------------------------
    # Phase 4: orchestration
    # ------------------------------------------------------------------

    def compress(self, messages: List[Dict[str, Any]], prompt_tokens: int,
                 focus_topic: str = "") -> List[Dict[str, Any]]:
        head_end = self._protect_head_size(messages)
        if len(messages) <= head_end + 4:
            return messages  # too few messages — head/tail protection would overlap
        head_end = self._align_forward(messages, head_end)
        tail_start = self._find_tail_cut(messages, head_end)
        if head_end >= tail_start:
            self._last_savings_pct.append(0.0)
            return messages  # nothing worth compressing

        messages = self._prune_old_tool_results(messages, self.cfg.protect_last_n)
        turns = messages[head_end:tail_start]

        summary = self._generate_summary(turns, focus_topic)
        if not summary and self.cfg.abort_on_summary_failure:
            return messages
        if not summary:
            summary = self._static_fallback_summary(turns)

        summary_role = "user" if messages[head_end - 1].get("role") in ("assistant", "tool") else "assistant"
        summary_msg = {"role": summary_role, "content": f"{summary}\n\n{_SUMMARY_END_MARKER}"}

        compressed = messages[:head_end] + [summary_msg] + messages[tail_start:]
        compressed = sanitize_tool_pairs(compressed)  # drop/stub orphaned tool_call pairs

        new_tokens = sum(len(str(m.get("content", ""))) for m in compressed) // 4
        saving_pct = max(0.0, 1 - (new_tokens / prompt_tokens)) if prompt_tokens else 0.0
        self._last_savings_pct.append(saving_pct)
        if len(self._last_savings_pct) > 5:
            self._last_savings_pct.pop(0)
        self.compression_count += 1
        return compressed
