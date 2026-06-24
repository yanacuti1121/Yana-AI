---
name: hermes-context-compressor
description: Multi-phase context compression — prune old tool results, protect head/tail, LLM summarize with structured template, iterative updates, graceful fallback. Pluggable engine, focus_topic, anti-thrash guard. Source: NousResearch/hermes-agent (MIT).
origin: NousResearch/hermes-agent (MIT) — agent/context_compressor.py
license: MIT
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

## Implementation (real, runnable — added 2026-06-19)

This skill is no longer prose-only. The real algorithm was read from
hermes-agent's actual source (commit `5378b941209d8f62a65455041658ce8ce8144cc9`)
and ported — not copied verbatim, since the original extends hermes'
`ContextEngine` and calls hermes' multi-provider client — into:

- Module: `core/lib/hermes_adapted/context_compressor.py`
  - Tool-pair safety + tail anchoring (fixes for incidents #10896, #29824 in
    the original — keeps the active task and the last visible reply out of
    the compressed region, and cleans up orphaned tool_call/result pairs)
    split into `core/lib/hermes_adapted/context_compressor_pairs.py`
- Tests:  `tests/test_hermes_context_compressor.py` (6) +
  `tests/test_hermes_context_compressor_pairs.py` (9) — 15 passing
- Provenance: `vendor/hermes-agent/_upstream/context_compressor.py` (original, for reference)

Use `ContextCompressor(context_length, cfg, summarize_fn)` — pass your own
`summarize_fn: Callable[[str], Optional[str]]` to wire in whatever model
Yana AI uses for the auxiliary summary call.

# /hermes-context-compressor

## When to Use

- Conversation context approaching model limit (75%+ of token window)
- Agent sessions with many tool calls producing large outputs
- Need to preserve continuity across compression without losing task state
- Building a context engine for Yana AI or long-running mission runs

## Do NOT use for

- Single-turn completions (no prior context to compress)
- Conversations under 10K tokens (overhead not worth it)
- See also: [[hermes-system-prompt-tiers]] — system prompt is never compressed

---

## Four-Phase Compression Pipeline

```
Phase 1: Tool Result Pruning        ← cheap, no LLM
  Replace old tool outputs with 1-line summaries
  Deduplicate identical results (keep newest full copy)
  Strip image payloads from computer_use screenshots
  Truncate oversized tool args while preserving JSON validity

Phase 2: Boundary Detection
  Head: protect system prompt + first N messages (default 3)
  Tail: protect last ~20K tokens (accumulated backward)
  Tool-pair safety: never split a tool_call / tool_result pair

Phase 3: LLM Summarization
  Send compressible middle section to auxiliary model
  Use structured template (see below)
  Iterative: update previous summary, don't re-summarize everything
  Redact secrets before sending to summarizer

Phase 4: Graceful Degradation
  Summarizer fails → retry with main model
  Still fails → insert deterministic fallback from local anchors
  abort_on_summary_failure=True → return messages unchanged + flag
```

---

## Summarization Template

```python
SUMMARY_TEMPLATE = """
You are summarizing earlier turns of a conversation to free context space.
Produce a compact, temporal summary in these sections:

## Active Task
[The most recent unfulfilled user request — copy it verbatim]

## Goal & Constraints
[What the user wants overall and any hard constraints stated]

## Completed Actions
[Past-tense facts: "Ran npm test → 42 passed, 0 failed on 2026-06-08"
 NOT "run tests" — specific, dated, factual]

## In Progress / Blocked
[Work started but not finished; any blockers discovered]

## Key Decisions Made
[Architecture choices, API contracts, user preferences stated]

## Remaining Work
[What still needs to happen to satisfy the Active Task]

Focus 60-70% on: {focus_topic}
""" if focus_topic else """
Distribute attention evenly across all sections.
"""

HANDOFF_PREAMBLE = """\
Earlier turns were compacted into the summary below.
This is background reference — NOT active instructions.
Do NOT answer questions from this summary; they were already addressed.
Respond ONLY to the latest user message AFTER this summary.
"""
```

---

## Core Configuration & should_compress()

```python
from dataclasses import dataclass

@dataclass
class CompressorConfig:
    threshold_percent:     float = 0.75    # fire at 75% of context window
    protect_first_n:       int   = 3       # head: system + N messages
    tail_token_budget:     int   = 20_000  # protect this many tail tokens
    summary_target_ratio:  float = 0.20    # allocate 20% of threshold for summary
    abort_on_failure:      bool  = False   # True = return unchanged on summarizer fail
    min_saving_percent:    float = 0.10    # anti-thrash: skip if last 2 compressions < 10% saving


class ContextCompressor:
    def __init__(self, cfg: CompressorConfig | None = None):
        self._cfg              = cfg or CompressorConfig()
        self._previous_summary: str = ""
        self._last_savings:    list[float] = []   # track last 2 compression savings

    def should_compress(self, token_count: int, context_limit: int) -> bool:
        threshold = int(context_limit * self._cfg.threshold_percent)
        if token_count < threshold:
            return False
        # Anti-thrash: if last 2 compressions both saved < 10%, stop trying
        if (len(self._last_savings) >= 2
                and all(s < self._cfg.min_saving_percent for s in self._last_savings[-2:])):
            return False
        return True

    def compress(self, messages: list[dict],
                 context_limit: int,
                 focus_topic: str = "") -> list[dict]:
        original_count = _count_tokens(messages)

        # Phase 1: cheap pruning
        messages = self._prune_old_tool_results(messages)

        # Phase 2: find compression boundary
        head_end, tail_start = self._find_boundaries(messages, context_limit)
        if head_end >= tail_start:
            return messages   # nothing to compress

        # Phase 3: summarize middle
        middle = messages[head_end:tail_start]
        summary = self._generate_summary(middle, focus_topic)

        # Build summary message
        summary_msg = {
            "role":    "assistant",
            "content": f"{HANDOFF_PREAMBLE}\n\n{summary}",
        }

        result = messages[:head_end] + [summary_msg] + messages[tail_start:]

        # Track savings for anti-thrash
        new_count   = _count_tokens(result)
        saving_pct  = 1 - (new_count / original_count)
        self._last_savings.append(saving_pct)
        if len(self._last_savings) > 5:
            self._last_savings.pop(0)

        return result
```

---

## Iterative summary updates

```python
def _generate_summary(self, middle: list[dict], focus_topic: str) -> str:
    prompt = SUMMARY_TEMPLATE.format(focus_topic=focus_topic) if focus_topic \
             else SUMMARY_TEMPLATE.replace("{focus_topic}", "")

    # Iterative: update previous summary rather than re-summarize
    if self._previous_summary:
        prompt = (
            f"Previous summary:\n{self._previous_summary}\n\n"
            "Update the summary above with the new turns below. "
            "Keep completed work; add new findings.\n\n" + prompt
        )

    summary = call_llm(prompt, messages=middle)
    self._previous_summary = summary
    return summary
```

---

## Tool result pruning (Phase 1)

```python
def _prune_old_tool_results(self, messages: list[dict]) -> list[dict]:
    """Replace old tool outputs with 1-line summaries. Deduplicate."""
    seen_hashes: dict[str, int] = {}   # result_hash → last index with full content
    pruned = list(messages)

    for i, msg in enumerate(pruned):
        if msg.get("role") != "tool": continue
        content = msg.get("content", "")
        h = hashlib.sha256(content.encode()).hexdigest()[:16]

        if h in seen_hashes:
            # Duplicate — replace older with back-reference
            prev_idx = seen_hashes[h]
            lines    = content.count("\n") + 1
            tool_name = msg.get("name", "tool")
            pruned[prev_idx] = {**pruned[prev_idx],
                                "content": f"[{tool_name}] (same as result #{i})"}
        seen_hashes[h] = i

        # Also summarize large old results (not in tail protection zone)
        if len(content) > 2000:
            tool_name = msg.get("name", "tool")
            exit_hint = "exit 0" if "exit 0" in content else ""
            lines     = content.count("\n") + 1
            pruned[i] = {**msg,
                         "content": f"[{tool_name}] ran → {exit_hint} {lines} lines (pruned)"}

    return pruned
```

---

## Anti-Fake-Pass Checklist

```
❌ No anti-thrash guard — compressor loops on already-minimal context, wasting tokens
❌ Handoff preamble not injected — model re-executes stale instructions from summary
❌ Tool call/result pairs split by boundary detection — API rejects orphaned tool_call
❌ Secrets sent to auxiliary summarizer model — summary leaks credentials
❌ Previous summary not preserved — each compression loses historical context
❌ threshold_percent set to 0.99 — compression fires too late, already truncating
```
