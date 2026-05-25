---
name: kv-cache-optimization
description: KV-cache optimization patterns for LLM inference. Prefix caching, sliding window attention, cache reuse across turns, static cache for fixed prompts, and TTFT reduction strategies. Sources: huggingface/transformers (Apache-2.0).
origin: yamtam-engine — synthesized from huggingface/transformers (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.51
---

# /kv-cache-optimization

## When to Use

- Multi-turn agent conversations: reuse KV cache from previous turns
- Fixed system prompt across 1000s of requests: compute once, cache forever
- Long-context RAG: cache the document, stream different queries against it
- Reduce TTFT (Time-to-First-Token) for latency-sensitive tool calls

## Do NOT use for

- Single-shot stateless inference (cache doesn't help)
- Models without `use_cache` support

---

## KV cache mechanics

```
Without cache (turn N):
  All N turns re-computed from scratch: O(N²) attention cost

With KV cache:
  Turn 1: compute KV for all tokens, store in cache
  Turn 2: only compute KV for NEW tokens, attend over cached KV
  Cost: O(new_tokens × total_cached_tokens) ← linear, not quadratic

Memory cost:
  KV cache size = 2 × layers × heads × head_dim × seq_len × dtype_bytes
  Llama-3-8B, 4096 tokens, fp16: 2 × 32 × 32 × 128 × 4096 × 2 ≈ 2 GB
```

---

## Multi-turn chat with cache reuse (transformers)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, DynamicCache

model     = AutoModelForCausalLM.from_pretrained('meta-llama/Llama-3-8B-Instruct')
tokenizer = AutoTokenizer.from_pretrained('meta-llama/Llama-3-8B-Instruct')

# Initialize a reusable cache object
cache = DynamicCache()

messages = []

def chat_turn(user_msg: str) -> str:
  global cache, messages
  messages.append({'role': 'user', 'content': user_msg})

  inputs   = tokenizer.apply_chat_template(messages, return_tensors='pt').to('cuda')
  outputs  = model.generate(
    inputs,
    past_key_values = cache,       # pass existing cache
    max_new_tokens  = 256,
    do_sample       = False,
    use_cache       = True,
  )

  # Update cache for next turn
  cache = outputs.past_key_values   # type: ignore

  new_tokens = outputs.sequences[0][inputs.shape[1]:]
  reply      = tokenizer.decode(new_tokens, skip_special_tokens=True)
  messages.append({'role': 'assistant', 'content': reply})
  return reply
```

---

## Static cache for fixed system prompt

```python
from transformers import StaticCache

# Pre-compute system prompt KV once
system_prompt = tokenizer('You are a yamtam security agent.', return_tensors='pt').to('cuda')

static_cache = StaticCache(
  config           = model.config,
  max_batch_size   = 8,
  max_cache_len    = 4096,
  device           = 'cuda',
  dtype            = torch.float16,
)

# Run system prompt through model to fill static cache
with torch.no_grad():
  model(**system_prompt, past_key_values=static_cache, use_cache=True)

# Reuse this cache for ALL requests — system prompt never recomputed
```

---

## Sliding window (long context without full KV growth)

```python
# SlidingWindowCache: only keep last W tokens in KV
from transformers import SlidingWindowCache

cache = SlidingWindowCache(
  config         = model.config,
  max_batch_size = 1,
  max_cache_len  = 2048,   # window size W
  device         = 'cuda',
  dtype          = torch.float16,
)
# Older tokens evicted as new tokens arrive → constant memory
```

---

## Anti-Fake-Pass Checklist

```
❌ Reusing DynamicCache across different prompts → KV state is prompt-specific; cross-contamination
❌ use_cache=False accidentally → cache not populated, next turn re-computes everything
❌ Static cache max_cache_len too small → cache overflow raises IndexError mid-generation
❌ Not detaching cache tensors before serialization → huge graph kept alive, memory leak
❌ SlidingWindowCache with model not trained for sliding window → incoherent output on long contexts
❌ Batch size > StaticCache.max_batch_size → silent shape mismatch error
```
