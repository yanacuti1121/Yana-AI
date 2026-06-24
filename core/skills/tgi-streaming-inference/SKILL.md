---
name: tgi-streaming-inference
description: HuggingFace Text Generation Inference (TGI) for production LLM streaming. Continuous batching, SSE token streaming, speculative decoding, quantization (GPTQ/AWQ), and multi-node tensor parallelism. Sources: huggingface/text-generation-inference (Apache-2.0).
origin: yana-ai — synthesized from huggingface/text-generation-inference (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /tgi-streaming-inference

## When to Use

- Production LLM endpoint with token streaming (SSE) and low TTFT
- Automatic continuous batching: new requests join in-flight batches
- GPTQ/AWQ quantization: run 70B model on 2×A100 instead of 4×
- Speculative decoding: draft model speeds up large model generation 2–3×

## Do NOT use for

- CPU inference (use [[llama-cpp-quantization]])
- Multi-model serving (use [[triton-inference-server]])

---

## Docker deployment

```bash
docker run --gpus all \
  -p 8080:80 \
  -v $HOME/models:/data \
  ghcr.io/huggingface/text-generation-inference:latest \
    --model-id          meta-llama/Llama-3-8B-Instruct \
    --quantize          bitsandbytes-nf4   \   # or gptq / awq
    --max-input-length  4096               \
    --max-total-tokens  8192               \
    --max-batch-prefill-tokens 4096        \
    --num-shard         1                      # tensor parallel shards = GPUs
```

---

## SSE token streaming (Node.js)

```javascript
async function* streamTGI(prompt: string, params = {}) {
  const res = await fetch('http://localhost:8080/generate_stream', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens:  512,
        temperature:     0.1,
        repetition_penalty: 1.1,
        do_sample:       true,
        ...params,
      },
    }),
  })

  if (!res.ok) throw new Error(`[tgi] ${res.status}`)

  const reader = res.body!.getReader()
  const dec    = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data:'))
    for (const line of lines) {
      const event = JSON.parse(line.slice(5))
      if (event.token?.text) yield event.token.text
      if (event.generated_text) return  // final event
    }
  }
}

// Usage
for await (const token of streamTGI('Explain PagedAttention in 3 lines:')) {
  process.stdout.write(token)
}
```

---

## Speculative decoding config

```bash
# Use a small draft model to propose tokens, large model to verify
docker run --gpus all \
  ghcr.io/huggingface/text-generation-inference:latest \
    --model-id          meta-llama/Llama-3-70B-Instruct \
    --speculate         4    \   # draft 4 tokens at a time
    --num-shard         4
# Throughput improvement: ~2.5× for typical instruction-following workloads
```

---

## Quantization comparison (70B model)

```
Method        VRAM     Speed     Quality loss
──────────────────────────────────────────────
fp16          140 GB   1.0×      baseline
bfloat16      140 GB   1.0×      near-zero
GPTQ-4bit      35 GB   1.3×      ~1–2 perplexity pts
AWQ-4bit       35 GB   1.4×      ~0.5 perplexity pts ← best 4-bit
NF4/bitsandbytes 35 GB 0.9×     ~1 perplexity pt (slower than GPTQ)
```

---

## Anti-Fake-Pass Checklist

```
❌ max-total-tokens < max-input-length + expected output → requests rejected
❌ --num-shard > number of GPUs → TGI fails to start
❌ Streaming without handling SSE 'error' events → silent truncation on OOM
❌ temperature: 0 with do_sample: true → nonsensical; use do_sample: false for greedy
❌ GPTQ model without matching --quantize gptq flag → wrong kernel, wrong output
❌ No Content-Type: application/json → TGI returns 415, not parsed as JSON error
```
