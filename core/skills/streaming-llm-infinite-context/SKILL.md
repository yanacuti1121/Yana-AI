---
name: streaming-llm-infinite-context
description: StreamingLLM attention sink patterns for infinite-context LLM inference. Attention sink tokens, rolling KV cache window, no recomputation on eviction, and enabling agents to process arbitrarily long sessions. Sources: mit-han-lab/streaming-llm (MIT).
origin: yana-ai — synthesized from mit-han-lab/streaming-llm (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /streaming-llm-infinite-context

## When to Use

- Agent sessions that run indefinitely without context window reset
- Long documents that exceed model context: process chunk-by-chunk without restart
- Streaming decode without out-of-memory as sequence length grows
- Avoid "attention sink" collapse that causes models to fail past their trained context

## Do NOT use for

- Tasks requiring recall from early in the session (evicted tokens are GONE)
- Small contexts < 4k tokens (standard KV cache is fine)

---

## Attention sink discovery

```
Problem:
  Standard KV cache grows linearly → OOM at context limit
  Dense attention past training length → incoherent output

Observation (Xiao et al. 2023):
  Attention scores massively concentrate on the first 4 tokens
  regardless of their semantic content. These are "attention sinks."

StreamingLLM insight:
  Keep: [attention sink tokens (first 4)] + [recent W tokens]
  Evict: everything older than W except the sinks
  Result: stable perplexity even at 4M tokens (tested)

Memory: constant = (4 + W) × KV_size_per_token
```

---

## Streaming generation with attention sinks

```python
from streaming_llm.enable_streaming_llm import enable_streaming_llm
from transformers import AutoModelForCausalLM, AutoTokenizer

model     = AutoModelForCausalLM.from_pretrained('meta-llama/Llama-3-8B', torch_dtype=torch.float16)
tokenizer = AutoTokenizer.from_pretrained('meta-llama/Llama-3-8B')
model     = model.cuda()

# Enable StreamingLLM: patch KV cache to use rolling window
kv_cache = enable_streaming_llm(
  model,
  start_size   = 4,     # number of sink tokens to keep
  recent_size  = 2000,  # sliding window of recent tokens
)

# Generate tokens indefinitely — memory stays flat
def stream_generate(prompt: str, max_tokens: int = 10_000):
  inputs  = tokenizer(prompt, return_tensors='pt').to('cuda')
  past_kv = None

  for _ in range(max_tokens):
    with torch.no_grad():
      outputs = model(**inputs, past_key_values=past_kv, use_cache=True)

    logits  = outputs.logits[:, -1, :]
    next_id = logits.argmax(dim=-1, keepdim=True)

    # Roll the KV cache: evict middle, keep sinks + recent
    past_kv = kv_cache(outputs.past_key_values)

    yield tokenizer.decode(next_id[0])
    inputs = {'input_ids': next_id, 'attention_mask': torch.ones_like(next_id)}
```

---

## When to reset vs stream

```
USE streaming (no reset):
  ✅ Continuous agent session (log reader, monitoring agent)
  ✅ Long document processing (PDF → summary in chunks)
  ✅ When most recent context is sufficient (chat, Q&A)

USE fresh context (reset):
  ✅ When early conversation facts must be recalled precisely
  ✅ Code generation that references declarations from session start
  ✅ When accuracy > throughput (pay the recomputation cost)

Hybrid: summarize evicted window → inject summary as new context
```

---

## Perplexity vs window size tradeoff

```
Window (W)   Memory(8B)   Perplexity degradation
────────────────────────────────────────────────
  512          0.5 GB      +15% vs oracle
 1000          1.0 GB      +5%
 2000          2.0 GB      +2%    ← sweet spot
 4000          4.0 GB      <1%
```

---

## Anti-Fake-Pass Checklist

```
❌ start_size: 0 → no attention sinks → model collapses on long contexts (validated by paper)
❌ recent_size too small (< 256) → model loses critical recent context; output degrades
❌ Using streaming-llm without the monkey-patch → standard KV cache grows unbounded anyway
❌ Expecting recall of evicted tokens → they are gone; no retrieval possible
❌ Applying to models not supported (non-Llama architectures) → attention pattern may differ
❌ Mixing streaming and standard cache → shape mismatch error in attention layers
```
