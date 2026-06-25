---
name: hermes-conversation-loop
description: Production-grade agent conversation loop — iteration budget with grace call, stale-stream detection (90s), chunked retry on truncation, continuation prompt, jittered backoff (base 5s/max 120s). Source: NousResearch/hermes-agent (MIT).
origin: NousResearch/hermes-agent (MIT) — agent/conversation_loop.py
license: MIT
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

## Implementation (partial — added 2026-06-19)

The real `agent/conversation_loop.py` (4486 lines) is, by its own docstring,
hermes' entire per-turn orchestration body extracted from `AIAgent` — not a
standalone algorithm. Porting it verbatim would mean pulling in most of
hermes-agent's ~110-file package. Only the genuinely portable building
blocks were ported:

- Module: `core/lib/hermes_adapted/conversation_loop.py`
  - `IterationBudget` — ported verbatim from `agent/iteration_budget.py`
  - `jittered_backoff()` — ported verbatim from `agent/retry_utils.py`
  - `FailoverReason` / `ClassifiedError` / `classify_api_error()` — condensed
    from `agent/error_classifier.py` (1365 lines → generic HTTP-status +
    billing/rate-limit keyword pipeline + SSL/server-disconnect/timeout
    transport heuristics, incl. "disconnect on a large session is likely
    context overflow, not a network hiccup"; provider-specific branches dropped)
- Tests: `tests/test_hermes_conversation_loop.py` (17 passing)

**Not implemented** (still prose-only, by deliberate scope cut — see the
module's own docstring): stale-stream detection (90s), chunked retry on
truncation, continuation prompt. These live inside the un-ported
`run_conversation` body and have no standalone form in the original.

# /hermes-conversation-loop

## When to Use

- Building an autonomous agent loop (mission-dispatcher, Yana AI backend)
- Need handling for stale streams, truncated responses, rate limits
- Want retry logic that doesn't hammer the API on transient errors
- Iteration budget enforcement to prevent runaway agents

## Do NOT use for

- Single-turn completions (no loop needed)
- Human-interactive chat where user drives pacing
- See also: [[hermes-tool-loop-guard]] for within-turn tool-call failure-loop protection

---

## Loop Architecture

```
while api_calls < max_iterations AND budget > 0:

  ① Check interrupt (user pressed Ctrl-C → break immediately)

  ② Call LLM (streaming preferred for stale-stream detection)
        │
        ├─ Success → parse finish_reason
        │       │
        │       ├─ "stop"      → generation complete → return
        │       ├─ "length"    → truncated
        │       │     ├─ has tool_call → chunked retry (boost max_tokens)
        │       │     └─ text only    → append continuation prompt, retry ≤3×
        │       └─ "tool_use" → execute tools → append results → next iteration
        │
        └─ Error → classify → retry with jittered backoff OR break
              │
              ├─ rate_limit  → check proactive limit, skip API call if detected early
              ├─ invalid_response → immediate fallback attempt before backoff
              └─ unicode_error → sanitize surrogates → retry ≤2×

  ③ Consume 1 iteration_budget
       └─ budget == 0: grant ONE grace_call → final attempt → exit
```

---

## Core Implementation (Python)

```python
import asyncio, random, time
from dataclasses import dataclass

@dataclass
class LoopConfig:
    max_iterations:    int   = 40
    max_retries:       int   = 3
    base_delay:        float = 5.0
    max_delay:         float = 120.0
    stale_stream_sec:  float = 90.0   # no data for 90s → timeout
    read_timeout_sec:  float = 60.0
    continuation_max:  int   = 3      # max continuation retries on length truncation


def jittered_backoff(retry: int, base: float = 5.0, max_d: float = 120.0) -> float:
    """Exponential backoff with ±25% jitter."""
    delay = min(base * (2 ** retry), max_d)
    return delay * (0.75 + random.random() * 0.5)


async def conversation_loop(agent, messages: list[dict],
                             cfg: LoopConfig | None = None) -> str:
    cfg    = cfg or LoopConfig()
    budget = cfg.max_iterations
    output = ""

    for api_call_count in range(cfg.max_iterations + 1):  # +1 for grace call
        # ① Interrupt check
        if agent.interrupt_requested:
            break

        # Grace call: one final attempt when budget exhausted
        is_grace = (budget == 0)

        for retry in range(cfg.max_retries):
            try:
                response = await _call_with_stale_detection(
                    agent, messages,
                    stale_timeout=cfg.stale_stream_sec,
                    read_timeout=cfg.read_timeout_sec,
                )
                break   # success
            except StaleStreamError:
                if retry == cfg.max_retries - 1:
                    raise
                await asyncio.sleep(jittered_backoff(retry, cfg.base_delay, cfg.max_delay))
            except RateLimitError as e:
                if e.proactive:                  # detected early — skip API call
                    await asyncio.sleep(e.retry_after)
                    continue
                await asyncio.sleep(jittered_backoff(retry, cfg.base_delay, cfg.max_delay))
            except InvalidResponseError:
                if retry == 0:
                    response = _empty_fallback_response()
                    break
                await asyncio.sleep(jittered_backoff(retry, cfg.base_delay, cfg.max_delay))
            except UnicodeError:
                messages = _sanitize_messages(messages)
                if retry >= 2:
                    raise

        finish = response.finish_reason

        if finish == "stop":
            output = response.text
            break

        if finish == "length":
            if response.has_tool_calls:
                # Boost max_tokens and retry same turn (chunked retry)
                agent.max_tokens = min(agent.max_tokens * 2, agent.model_max_tokens)
                continue
            else:
                # Text truncation — append continuation and retry
                messages.append({"role": "assistant", "content": response.text})
                messages.append({"role": "user",
                                  "content": "Please continue from where you left off."})
                for _ in range(cfg.continuation_max):
                    cont = await _call_with_stale_detection(agent, messages,
                                                            cfg.stale_stream_sec,
                                                            cfg.read_timeout_sec)
                    output += cont.text
                    if cont.finish_reason == "stop":
                        break
                    messages.append({"role": "assistant", "content": cont.text})
                    messages.append({"role": "user", "content": "Continue."})
                break

        if finish == "tool_use":
            # Execute tools and loop
            tool_results = await execute_tools(response.tool_calls, agent)
            messages.append({"role": "assistant", "content": response.content})
            messages.extend(tool_results)

        # Consume budget
        if budget > 0:
            budget -= 1
        elif is_grace:
            break   # grace used — exit unconditionally

    return output
```

---

## Stale-stream detection

```python
async def _call_with_stale_detection(agent, messages, stale_timeout, read_timeout):
    last_data_at = time.monotonic()

    async def check_stale(stream):
        async for chunk in stream:
            now = time.monotonic()
            if now - last_data_at > stale_timeout:
                raise StaleStreamError(f"No data for {stale_timeout}s")
            nonlocal last_data_at
            last_data_at = now
            yield chunk

    return await agent.call_streaming(messages, middleware=check_stale,
                                       read_timeout=read_timeout)
```

---

## Proactive rate-limit detection (Nous Portal pattern)

```python
class RateLimitTracker:
    def __init__(self, requests_per_minute: int = 60):
        self._rpm   = requests_per_minute
        self._calls = []   # timestamps of recent calls

    def check(self) -> float | None:
        """Return seconds to wait, or None if safe to proceed."""
        now   = time.monotonic()
        cutoff = now - 60.0
        self._calls = [t for t in self._calls if t > cutoff]

        if len(self._calls) >= self._rpm:
            oldest = self._calls[0]
            wait   = 60.0 - (now - oldest) + 0.5   # +0.5s safety margin
            return wait
        self._calls.append(now)
        return None

    async def acquire(self) -> None:
        wait = self.check()
        if wait:
            await asyncio.sleep(wait)
```

---

## Anti-Fake-Pass Checklist

```
❌ No stale-stream timeout — hung stream blocks turn forever, never times out
❌ Continuation loop unbounded — text truncation → infinite continuation retries
❌ Same max_tokens on chunked retry — truncation repeats on next call
❌ Jitter missing from backoff — synchronized retries hammer API simultaneously
❌ Budget exhausted with no grace call — last valid partial response discarded
❌ Interrupt check only at loop start — user Ctrl-C during tool execution ignored
❌ Unicode sanitization not bounded — surrogates in recursive content → infinite loop
```
