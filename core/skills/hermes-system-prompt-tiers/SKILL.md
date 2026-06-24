---
name: hermes-system-prompt-tiers
description: Build system prompts in three tiers — stable (identity+tools, prefix-cache-friendly), context (session CWD files), volatile (memory+date-only) — to maximize upstream prompt cache reuse across turns. Source: NousResearch/hermes-agent (MIT).
origin: NousResearch/hermes-agent (MIT) — agent/system_prompt.py
license: MIT
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

## Implementation (architecture ported, content not — added 2026-06-19)

Most of the original file's *content* (SOUL.md identity, kanban worker
guidance, nous subscription prompts) is hermes-product-specific with no
Yana AI equivalent. What's ported is the architecture: the 3-tier
stable/context/volatile builder with cache-until-invalidated semantics,
the platform-hint override resolver (ported close to verbatim — it was
already pure), and the model-family-guidance matching pattern.

- Module: `core/lib/hermes_adapted/system_prompt.py`
- Tests:  `tests/test_hermes_system_prompt.py` (8 passing)

Yana AI supplies its own tier-section callables and guidance text; this
module only provides the assembly/caching/override mechanics.

# /hermes-system-prompt-tiers

## When to Use

- Building a multi-turn agent where system prompt is rebuilt each turn (kills cache)
- Optimizing Claude API cost by maximizing prefix cache hits
- System prompt contains both stable identity and volatile per-turn state
- Yana AI or any long-running session with 20+ turns

## Do NOT use for

- Single-turn completions (no cache warmth benefit)
- System prompts under ~200 tokens (cache overhead not worth it)
- See also: [[hermes-context-compressor]] — compression rebuilds only stable tier

---

## The Problem

Rebuilding the system prompt with a different timestamp or memory snapshot every turn
invalidates the upstream prefix cache → every turn pays full input token cost.

---

## Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────┐
│  STABLE TIER  — rebuilt only after compression         │
│  • Agent identity (SOUL.md or default persona)         │
│  • Tool descriptions (static JSON)                     │
│  • Model-specific instructions (Gemini quirks, etc.)   │
│  • Skills prompt                                       │
│  • Environment hints (OS, shell, CWD type)             │
│  → Prefix cache reuse: ALL turns in session            │
├─────────────────────────────────────────────────────────┤
│  CONTEXT TIER  — session-stable, CWD-dependent         │
│  • Caller-supplied system_message                      │
│  • Context files found in CWD: AGENTS.md, CLAUDE.md,  │
│    .cursorrules, etc.                                  │
│  → Prefix cache reuse: until user changes CWD         │
├─────────────────────────────────────────────────────────┤
│  VOLATILE TIER  — per-session, never cached            │
│  • Memory snapshot (from MemoryManager)                │
│  • USER.md profile                                     │
│  • Date only: "2026-06-08" — NOT "13:58" (key!)       │
│  • Session ID, model name, provider name               │
│  → No cache: changes per session                       │
└─────────────────────────────────────────────────────────┘
```

**Key insight:** Date uses day precision, not minute. A timestamp like `13:58`
invalidates the stable prefix every minute. `2026-06-08` is byte-stable all day.

---

## Implementation

```python
from dataclasses import dataclass
from datetime import date
from pathlib import Path

CONTEXT_FILE_NAMES = ["AGENTS.md", "CLAUDE.md", ".cursorrules", "SYSTEM.md"]

@dataclass
class SystemPromptParts:
    stable:   str
    context:  str
    volatile: str

    def assemble(self) -> str:
        parts = [p for p in (self.stable, self.context, self.volatile) if p]
        return "\n\n".join(parts)


class SystemPromptBuilder:
    def __init__(self, agent_identity: str, tool_descriptions: str):
        self._identity  = agent_identity
        self._tools     = tool_descriptions
        self._cached:   str | None = None          # full assembled prompt
        self._stable:   str | None = None

    # ── Stable tier ──────────────────────────────────────────────────────────
    def _build_stable(self, skills_prompt: str = "", env_hint: str = "") -> str:
        parts = [self._identity, self._tools]
        if skills_prompt: parts.append(skills_prompt)
        if env_hint:      parts.append(env_hint)
        return "\n\n".join(p for p in parts if p)

    # ── Context tier ─────────────────────────────────────────────────────────
    def _build_context(self, cwd: Path, caller_system: str = "") -> str:
        parts = []
        if caller_system:
            parts.append(caller_system)
        for fname in CONTEXT_FILE_NAMES:
            fpath = cwd / fname
            if fpath.exists():
                try:
                    content = fpath.read_text(encoding="utf-8").strip()
                    if content:
                        parts.append(f"# {fname}\n{content}")
                except OSError:
                    pass
        return "\n\n".join(parts)

    # ── Volatile tier ────────────────────────────────────────────────────────
    def _build_volatile(self, memory_block: str = "",
                        session_id: str = "", model: str = "") -> str:
        # DATE ONLY — not hour/minute (prefix cache stability)
        today = date.today().isoformat()   # "2026-06-08"
        parts = [f"Date: {today}"]
        if session_id: parts.append(f"Session: {session_id}")
        if model:      parts.append(f"Model: {model}")
        if memory_block:
            parts.append(memory_block)     # already wrapped in <memory-context>
        return "\n".join(parts)

    # ── Public API ───────────────────────────────────────────────────────────
    def build(self, *, cwd: Path, skills_prompt: str = "",
              caller_system: str = "", env_hint: str = "",
              memory_block: str = "", session_id: str = "",
              model: str = "") -> str:
        if self._cached:
            return self._cached

        parts = SystemPromptParts(
            stable   = self._build_stable(skills_prompt, env_hint),
            context  = self._build_context(cwd, caller_system),
            volatile = self._build_volatile(memory_block, session_id, model),
        )
        self._cached = parts.assemble()
        return self._cached

    def invalidate(self) -> None:
        """Call after compression — forces stable tier rebuild next turn."""
        self._cached = None
        self._stable = None
```

---

## Wiring in Yana AI (TypeScript sketch)

```typescript
const builder = new SystemPromptBuilder(SOUL_MD, formatToolsAsJSON(tools))

// Build once per session — cache naturally
const systemPrompt = builder.build({
  cwd:          process.cwd(),
  skillsPrompt: loadSkillsPrompt(),
  memoryBlock:  await memoryManager.buildSystemPrompt(),
  sessionId:    sessionId,
  model:        "claude-sonnet-4-6",
})

// Every turn: reuse cached prompt
const response = await anthropic.messages.create({
  system:   systemPrompt,   // same string each turn → prefix cache hit
  messages: conversationHistory,
  model:    "claude-sonnet-4-6",
})

// After compression fires → invalidate + rebuild
builder.invalidate()
```

---

## Cache hit verification (Anthropic API)

```typescript
// Check usage.cache_read_input_tokens in response
if (response.usage.cache_read_input_tokens > 0) {
  console.log(`Cache hit: ${response.usage.cache_read_input_tokens} tokens saved`)
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Timestamp includes hours/minutes — invalidates prefix cache every minute
❌ Stable tier rebuilt on every turn "for freshness" — no cache benefit at all
❌ Memory block injected into stable tier — volatile content poisons cache
❌ Context files re-read from disk every turn — I/O waste + cache miss
❌ invalidate() never called after compression — stale stable prompt persists
❌ Tool descriptions differ per-turn (model-specific flags toggled) — cache miss
```
