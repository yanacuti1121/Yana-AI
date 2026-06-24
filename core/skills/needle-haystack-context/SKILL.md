---
name: needle-haystack-context
description: Needle-in-a-Haystack context placement testing for LLM retrieval accuracy. Context window stress tests, information placement strategies, lost-in-the-middle avoidance, and optimal document ordering for agent prompts. Sources: gkamradt/LLMTest_NeedleInAHaystack (MIT).
origin: yana-ai — synthesized from gkamradt/LLMTest_NeedleInAHaystack (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /needle-haystack-context

## When to Use

- Test whether an LLM can retrieve a specific fact buried in a long context window
- Choose optimal placement for critical information in agent system prompts
- Diagnose why an agent "forgets" instructions in long conversations
- Benchmark model context quality before deploying for long-context RAG tasks

## Do NOT use for

- Short contexts < 4k tokens (all models handle these reliably)
- Semantic search (use [[in-memory-vector-storage]] for retrieval)

---

## Lost-in-the-Middle effect

```
Research finding (Liu et al. 2023):
  Models perform best when critical info is at START or END of context.
  Performance degrades ~40% when critical info is buried in the MIDDLE.

  0%──────────────────────100% position in context
  ████████░░░░░░░░░░░░████████  ← retrieval accuracy
  Best    Worst     Best

Agent implication: put rules/constraints at the TOP of system prompt,
  not buried in the middle of a long document list.
```

---

## Needle-in-Haystack test runner

```python
import anthropic

def needle_test(
  client:    anthropic.Anthropic,
  needle:    str,   # fact to retrieve: "The magic number is 42"
  haystack:  str,   # long filler text (Paul Graham essays, etc.)
  position:  float, # 0.0 = start, 0.5 = middle, 1.0 = end
  ctx_len:   int,   # target context length in tokens
) -> bool:
  # Place needle at the specified position
  words   = haystack.split()
  insert  = int(len(words) * position)
  padded  = ' '.join(words[:insert]) + f'\n\n{needle}\n\n' + ' '.join(words[insert:])
  trimmed = padded[:ctx_len * 4]  # ~4 chars/token

  response = client.messages.create(
    model      = 'claude-sonnet-4-6',
    max_tokens = 64,
    system     = 'Answer based only on the provided text.',
    messages   = [
      { 'role': 'user', 'content': f'{trimmed}\n\nWhat is the magic number?' }
    ],
  )
  answer = response.content[0].text
  return '42' in answer
```

---

## Sweep test across positions and context lengths

```python
import numpy as np

positions = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]
ctx_lens  = [2048, 4096, 8192, 16384]
results   = {}

for ctx in ctx_lens:
  for pos in positions:
    hit = needle_test(client, needle, haystack, pos, ctx)
    results[(ctx, pos)] = hit
    print(f'ctx={ctx:6d} pos={pos:.1f} → {"PASS" if hit else "FAIL"}')

# Identify weak spots
failures = [(ctx, pos) for (ctx, pos), ok in results.items() if not ok]
print('\nFailed positions:', failures)
```

---

## Agent prompt ordering rules (from NIAH findings)

```
Priority order for system prompt sections:
  1. [TOP]    Hard constraints, safety rules, tool restrictions
  2. [TOP]    Agent identity and role
  3. [MIDDLE] Reference documents, context (expendable)
  4. [BOTTOM] Specific task instructions
  5. [BOTTOM] Output format requirements

NEVER bury "do not do X" rules in the middle of a long document list.
If context > 32k tokens: summarize middle sections, keep rules at edges.
```

---

## Anti-Fake-Pass Checklist

```
❌ Testing with model's advertised context length but not checking quality → model "accepts" 128k but retrieves poorly past 32k
❌ Needle is too similar to haystack content → false positives (model guesses correctly without retrieval)
❌ Single position test → must sweep all positions to find the degradation curve
❌ Counting tokens by character/4 for needle placement → use tiktoken for accurate position
❌ Using this test for semantic understanding → NIAH tests literal retrieval only
❌ Fixing NIAH failures by just shortening context → also restructure prompt (put key info at top)
```
