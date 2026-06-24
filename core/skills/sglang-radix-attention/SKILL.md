---
name: sglang-radix-attention
description: sGLang RadixAttention — KV cache stored in a radix tree, reused across requests sharing common prefixes. Cache-aware scheduling (depth-first, LRU at branch level). 29% throughput edge vs vLLM on ShareGPT, 6.4x on RAG workloads, 86% hit rate on voice. Deployed 400k+ GPUs 2026. Sources: rohitg00/ai-engineering-from-scratch (Apache-2.0).
origin: yana-ai — synthesized from rohitg00/ai-engineering-from-scratch (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.54
---

# /sglang-radix-attention

## When to Use

- RAG workloads: same system prompt + same retrieval preamble + varying question
- Agentic workloads: same tool schemas + system prompt repeated across thousands of requests
- Chat with long, stable system prompts (>1K tokens)
- Voice/vision with repeated preambles (audio feature header, image encoder prefix)

## Do NOT use for

- Open-ended chat with unique prompts per request (no shared prefix = no cache benefit)
- Single-shot code completion where every prompt is distinct
- Short prompts (<200 tokens) where cache lookup overhead exceeds savings

---

## How RadixAttention works

```
The radix tree stores token sequences as paths from root to leaf.
Each node owns KV blocks for the token range on its path.
A new request WALKS the tree: matching nodes → KV blocks reused → no prefill.

Example tree:
  root
   └─ "You are a helpful assistant..." (2,000 tokens = 124 KV blocks)
       ├─ "Context: <doc A>..." (500 tokens, 31 blocks)
       │   ├─ "Question: Alice"  (80 tokens, 5 blocks — NEW: only 5 blocks prefilled)
       │   └─ "Question: Bob"    (95 tokens, 6 blocks)
       └─ "Context: <doc B>..." (520 tokens, 33 blocks)

Without tree: request for doc-A + Alice prefills 2,625 tokens (160 blocks).
With tree:    prefills only 80 tokens (5 blocks). ~32x prefill savings.
```

---

## The ordering invariant (engineer's key lever)

```
The 6.4x improvement REQUIRES consistent prompt template ordering.
A shared prefix to a human ≠ shared prefix to the radix tree.

[system, tools, context, history, question]   ← correct (immutable first)
[system, context, tools, history, question]   ← different order → tree miss

Rule: put everything immutable (system, tools, schemas) FIRST.
      put retrieval context next.
      put user question LAST.
      NEVER interleave dynamic content into the stable prefix.

Real case: one deployment went from 7% → 74% cache hit rate
           by moving dynamic content out of the cacheable prefix.
```

---

## Cache-aware scheduling

```
Problem with FCFS (first-come, first-served):
  Request A shares 2,000-token prefix.
  Request B arrives first, shares only 50 tokens.
  FCFS serves B → 2,000-token branch evicted before A is served.

Cache-aware scheduling policies:
  1. Depth-first dispatch    — prefer requests rooted at the same branch as running set
  2. LRU at branch level     — evict whole branches (not individual blocks), shortest-used first
```

---

## Benchmark numbers to remember

```
Benchmark                                       SGLang vs vLLM
──────────────────────────────────────────────  ──────────────────
Llama 3.1 8B, H100, ShareGPT 1K prompts         ~16,200 vs ~12,500 tok/s  (+29%)
Prefix-heavy RAG (same doc, varying question)    up to 6.4x
Voice cloning workloads                          86.4% prefix cache hit rate
Production hit rates across customers            50–99% (depends on prompt discipline)
Deployment scale (2026)                          400,000+ GPUs

Use sGLang over vLLM when: prefix-heavy workload + prompt ordering is controlled.
Use vLLM when: unique-prompt workloads or you need PagedAttention's continuous batching.
```

---

## sGLang deployment (Docker)

```bash
# Start sGLang server (OpenAI-compatible API)
docker run --gpus all \
  -p 30000:30000 \
  lmsysorg/sglang:latest \
  python -m sglang.launch_server \
    --model-path meta-llama/Meta-Llama-3.1-8B-Instruct \
    --port 30000 \
    --enable-prefix-caching \
    --cache-radix-tree \
    --mem-fraction-static 0.88

# OpenAI-compatible: point any client at http://localhost:30000
```

---

## Prompt template discipline (Python)

```python
from dataclasses import dataclass

@dataclass
class PromptBuilder:
    """Enforces immutable-first ordering for maximum prefix cache hits."""
    system_prompt: str          # IMMUTABLE — goes first
    tool_schemas:  list[str]    # IMMUTABLE — goes second
    few_shot_examples: list[str] = ()  # IMMUTABLE if fixed

    def build(self, context: str, history: list[str], question: str) -> str:
        parts = [
            f"[SYSTEM]\n{self.system_prompt}",
            "[TOOLS]\n" + "\n".join(self.tool_schemas),
        ]
        if self.few_shot_examples:
            parts.append("[EXAMPLES]\n" + "\n".join(self.few_shot_examples))
        # Dynamic parts LAST — do not reorder
        if context:
            parts.append(f"[CONTEXT]\n{context}")
        if history:
            parts.append("[HISTORY]\n" + "\n".join(history))
        parts.append(f"[QUESTION]\n{question}")
        return "\n\n".join(parts)

    def validate_ordering(self) -> None:
        """Fail fast if dynamic content would corrupt the immutable prefix."""
        if "{" in self.system_prompt or "{" in " ".join(self.tool_schemas):
            raise ValueError("System prompt and tool schemas must not contain dynamic f-string placeholders")
```

---

## Anti-Fake-Pass Checklist

```
❌ Dynamic content interleaved into system prompt → radix tree cannot find shared prefix → 6.4x → 1.0x
❌ Prompt template varies across requests → cache miss rate > 90% → sGLang offers no advantage over vLLM
❌ FCFS scheduling not replaced → hot branch evicted before high-prefix-share requests → cache churns
❌ All-in-one vLLM used for RAG workload → missing 29–6.4x throughput; switch to sGLang
❌ Short prompts (<200 tokens) → lookup overhead > savings; RadixAttention not worth it
❌ Assuming "cache hit" without measuring → instrument with SGLang's cache_hit_rate metric
```
