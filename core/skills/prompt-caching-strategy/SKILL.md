---
name: prompt-caching-strategy
description: >
  Minimize token cost and latency with Anthropic prompt caching — cache
  breakpoints, static vs dynamic block separation, skills snapshot
  pre-computation, context invalidation strategy, and 90% cost reduction
  patterns for repeated system content. Use when asked about "prompt
  caching", "cache breakpoint", "reduce token cost", "Anthropic caching",
  "cache_control", "reuse system prompt", "skills snapshot", "context
  invalidation", "token budget", "90% cache hit", "cost optimization for
  Claude", or "cached prompt tokens". Do NOT use for: general output budget
  — see the OUTPUT_BUDGET_POLICY.md. Do NOT use for: session memory
  compaction — see pre-compact-backup.
origin: adapted:MIT © Anthropic/anthropic-cookbook
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Claude 3.5+ / Claude 4 via API. claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-7."
---

## When to Use

- Use when: sending the same large system prompt (skills, rules, docs) on every request
- Use when: RAG context contains a stable large document + small dynamic query
- Use when: building a multi-turn conversation where history is repeated each turn
- Do NOT use for: one-off single requests — caching overhead not worth it
- Do NOT use for: Claude Code sessions (caching is automatic in the IDE)

---

## How Prompt Caching Works

```
Without cache:
  Every request = full prompt tokens charged at input rate
  1000 requests × 10K tokens = 10M tokens billed

With cache (cache hit ~90%):
  First request = full input tokens (write to cache)
  Subsequent = 10% input tokens (cache read) + 90% cached at ~0.1× cost
  TTL: 5 minutes (resets each time cache is read)

Break-even: caching pays off after ~2 requests with the same prefix.
```

---

## Cache Breakpoints (API)

```python
import anthropic

client = anthropic.Anthropic()

# Static block (cached) + dynamic block (not cached)
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LARGE_STATIC_CONTENT,   # skills docs, rules, codebase snapshot
            "cache_control": {"type": "ephemeral"}  # ← cache this block
        }
    ],
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": LARGE_STATIC_CONTEXT,    # stable reference docs
                    "cache_control": {"type": "ephemeral"}
                },
                {
                    "type": "text",
                    "text": user_query              # small dynamic part — NOT cached
                }
            ]
        }
    ]
)

# Check cache performance
usage = response.usage
print(f"Input tokens:        {usage.input_tokens}")
print(f"Cache write tokens:  {usage.cache_creation_input_tokens}")
print(f"Cache read tokens:   {usage.cache_read_input_tokens}")
```

---

## Skills Snapshot — Pre-compute for Caching

```bash
# build-skills-snapshot.sh generates a compact index for use as cached context
# The snapshot contains skill names, descriptions, and trigger phrases
# — NOT the full SKILL.md bodies (too large to send every request)
bash core/scripts/build-skills-snapshot.sh > .claude/skills-snapshot.md
```

```python
# Load snapshot once, cache it for all requests in this session
with open('.claude/skills-snapshot.md') as f:
    SKILLS_SNAPSHOT = f.read()

# Use as cached system block — ~136 skills × ~100 chars = ~14K tokens, cached
system = [
    {
        "type": "text",
        "text": f"You have access to the following skills:\n\n{SKILLS_SNAPSHOT}",
        "cache_control": {"type": "ephemeral"}
    }
]
```

---

## Static vs Dynamic Block Design

```
Cached (stable, changes rarely):
  ├─ System instructions / rules
  ├─ Skills index snapshot
  ├─ Codebase architecture overview
  ├─ Reference documentation (API docs, style guide)
  └─ Conversation history up to N turns ago

NOT cached (changes every request):
  ├─ Current user message
  ├─ Latest N turns of conversation
  ├─ Real-time data (current time, live metrics)
  └─ Per-request session context
```

```python
# Multi-turn: cache all history except last 2 turns
def build_messages_with_cache(history: list[dict], new_message: str):
    messages = []

    # Cache stable history
    for msg in history[:-2]:
        messages.append({
            **msg,
            "content": [{
                "type": "text",
                "text": msg["content"],
                "cache_control": {"type": "ephemeral"}
            }]
        })

    # No cache on recent + new messages (they change)
    for msg in history[-2:]:
        messages.append(msg)

    messages.append({"role": "user", "content": new_message})
    return messages
```

---

## TTL Management

```
Cache TTL: 5 minutes from last read
Implication: if request rate < 1 per 5min, cache provides no benefit

For background batch jobs (low frequency):
  → Cache not useful — use streaming or batch API instead

For interactive apps (>1 req/min):
  → Cache hits every request after first — 90% cost reduction

For scheduled jobs (hourly):
  → Warm cache manually before batch starts:
     send a preflight "ping" request 30s before batch to re-warm
```

---

## Cost Calculation

```python
# Approximate cost calculator
SONNET_INPUT_PRICE  = 3.00    # per 1M tokens
SONNET_CACHE_WRITE  = 3.75    # per 1M tokens (25% premium on first write)
SONNET_CACHE_READ   = 0.30    # per 1M tokens (90% discount on reads)

static_tokens  = 14_000   # skills snapshot
dynamic_tokens = 500      # user message
requests       = 100

no_cache_cost  = requests * (static_tokens + dynamic_tokens) / 1e6 * SONNET_INPUT_PRICE
with_cache     = (1 * static_tokens / 1e6 * SONNET_CACHE_WRITE +        # first write
                  (requests - 1) * static_tokens / 1e6 * SONNET_CACHE_READ +  # reads
                  requests * dynamic_tokens / 1e6 * SONNET_INPUT_PRICE)  # dynamic always full

print(f"Without cache: ${no_cache_cost:.2f}")    # ~$4.25
print(f"With cache:    ${with_cache:.2f}")       # ~$0.47 (~89% savings)
```

---

## Anti-Fake-Pass Rules

Before claiming prompt caching is optimized, you MUST show:
- [ ] `cache_control: {type: "ephemeral"}` on static blocks — not dynamic content
- [ ] Cache block is placed BEFORE the dynamic content in the message
- [ ] `cache_read_input_tokens` logged — confirmed cache is actually hitting
- [ ] Static content does not change between requests (no timestamps, no session IDs in cached block)
- [ ] Cache TTL respected — preflight warm-up if request interval > 4 minutes

Reference: `gates/anti-fake-pass-gate.md`
