---
name: vllm-paged-attention
description: vLLM PagedAttention KV-cache management for high-throughput LLM serving. Continuous batching, memory utilization, OpenAI-compatible API, and multi-LoRA serving patterns. Sources: vllm-project/vllm (Apache-2.0).
origin: yamtam-engine — synthesized from vllm-project/vllm (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.51
---

# /vllm-paged-attention

## When to Use

- Serve open-source LLMs with 2–24× higher throughput vs naïve HuggingFace inference
- Long-context requests: PagedAttention eliminates KV-cache memory fragmentation
- Multi-request batching: continuous batching fills GPU utilization gaps
- OpenAI-compatible drop-in for existing tooling

## Do NOT use for

- CPU-only inference (use [[llama-cpp-quantization]])
- Single request at a time (vLLM overhead not worth it below ~4 concurrent requests)

---

## PagedAttention concept

```
Traditional KV cache:
  Each request pre-allocates max_seq_len * num_heads * head_dim → huge waste
  16 requests × 4096 tokens × 32 heads × 128 dim × fp16 = 17 GB wasted

PagedAttention:
  KV cache split into fixed-size "pages" (blocks of 16 tokens each)
  Pages allocated on demand, freed immediately when sequence ends
  Result: near-zero fragmentation, 2–4× more requests fit in VRAM
```

---

## Start vLLM server

```bash
python -m vllm.entrypoints.openai.api_server \
  --model        meta-llama/Llama-3-8B-Instruct \
  --tensor-parallel-size 1   \   # GPUs to shard model across
  --max-model-len 8192        \   # max context window
  --gpu-memory-utilization 0.90 \ # fraction of GPU VRAM to use
  --max-num-seqs  256         \   # max concurrent sequences
  --dtype         bfloat16    \
  --port          8000
```

---

## Client: streaming chat completion

```javascript
import OpenAI from 'openai'

const vllm = new OpenAI({
  baseURL: 'http://localhost:8000/v1',
  apiKey:  'token-abc123',   // vLLM checks this if --api-key set
})

const stream = await vllm.chat.completions.create({
  model:      'meta-llama/Llama-3-8B-Instruct',
  messages:   [
    { role: 'system',  content: 'You are a yamtam agent.' },
    { role: 'user',    content: 'Analyze this code for security issues.' },
  ],
  max_tokens: 1024,
  temperature: 0.2,
  stream:      true,
})

let output = ''
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? ''
  output += delta
  process.stdout.write(delta)
}
```

---

## Multi-LoRA serving (serve N fine-tuned adapters on one base model)

```bash
# Start with LoRA adapters registered
python -m vllm.entrypoints.openai.api_server \
  --model           meta-llama/Llama-3-8B \
  --enable-lora     \
  --lora-modules    security-adapter=/adapters/security-lora \
                    code-adapter=/adapters/code-lora \
  --max-loras       2 \
  --max-cpu-loras   4
```

```javascript
// Select adapter per request
const res = await vllm.chat.completions.create({
  model: 'security-adapter',   // LoRA adapter name
  messages: [...],
})
```

---

## Monitor throughput metrics

```bash
# vLLM exposes Prometheus metrics at /metrics
curl http://localhost:8000/metrics | grep -E "vllm_(requests|tokens|cache)"
# vllm_request_success_total
# vllm_tokens_total
# vllm_gpu_cache_usage_perc   ← target > 80% for good utilization
# vllm_num_requests_running
```

---

## Anti-Fake-Pass Checklist

```
❌ gpu-memory-utilization 1.0 → OOM during KV allocation spike; keep ≤ 0.95
❌ tensor-parallel-size > number of GPUs → vLLM crashes at startup
❌ max-model-len > model's rope_scaling limit → position embeddings overflow
❌ No --api-key in multi-tenant → any process can query the server
❌ Streaming without error handling → partial responses silently truncated on network drop
❌ LoRA adapter mismatch with base model rank → silent degraded output
```
