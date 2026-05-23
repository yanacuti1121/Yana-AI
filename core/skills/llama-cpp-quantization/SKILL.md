---
name: llama-cpp-quantization
description: llama.cpp GGUF/GGML quantization patterns for local LLM inference. Quantization levels (Q4_K_M, Q8_0, F16), CPU/GPU offloading, context window sizing, and embedding extraction via llama.cpp HTTP server. Sources: ggerganov/llama.cpp (MIT).
origin: yamtam-engine — synthesized from ggerganov/llama.cpp (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.51
---

# /llama-cpp-quantization

## When to Use

- Run open-source LLMs locally without GPU (CPU inference via GGUF)
- Choose quantization level based on quality/memory tradeoff
- Embed llama.cpp HTTP server for OpenAI-compatible local API
- Extract embeddings from local model for [[in-memory-vector-storage]]

## Do NOT use for

- Cloud LLM APIs (Anthropic/OpenAI — use [[http-client-auth-patterns]])
- Production GPU clusters (use [[vllm-paged-attention]] or [[tgi-streaming-inference]])

---

## Quantization level guide

```
Format      Bits  Size(7B)  Quality  Use case
──────────────────────────────────────────────
Q2_K        2.6   2.8 GB    poor     emergency low-RAM only
Q4_K_S      4.4   4.1 GB    ok       minimum usable
Q4_K_M      4.8   4.5 GB    good     ← default recommendation
Q5_K_M      5.7   5.3 GB    great    if RAM allows
Q8_0        8.0   7.2 GB    near-lossless  pre-production
F16        16.0  13.5 GB    lossless  fine-tuning only

Rule: Q4_K_M for dev/testing, Q8_0 for production inference gates
```

---

## Start llama.cpp HTTP server

```bash
# Download GGUF model
curl -L -o models/mistral-7b-q4.gguf \
  "https://huggingface.co/TheBloke/Mistral-7B-v0.1-GGUF/resolve/main/mistral-7b-v0.1.Q4_K_M.gguf"

# Start server (OpenAI-compatible API)
./llama-server \
  --model    models/mistral-7b-q4.gguf \
  --ctx-size 4096       \   # context window (tokens)
  --n-gpu-layers 35     \   # layers on GPU (0 = CPU-only)
  --threads  8          \   # CPU threads
  --port     8080       \
  --host     0.0.0.0    \
  --parallel 4              # concurrent request slots
```

---

## OpenAI-compatible client call

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'http://localhost:8080/v1',
  apiKey:  'not-needed',   // llama.cpp ignores this
})

const completion = await client.chat.completions.create({
  model:      'local',
  messages:   [{ role: 'user', content: 'What is 2+2?' }],
  max_tokens: 256,
  temperature: 0.1,
  stream:     true,
})

for await (const chunk of completion) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '')
}
```

---

## Quantize a model yourself

```bash
# Convert HuggingFace model → GGUF
python3 convert_hf_to_gguf.py \
  --outfile models/my-model-f16.gguf \
  --model   /path/to/hf-model

# Quantize F16 → Q4_K_M
./quantize \
  models/my-model-f16.gguf \
  models/my-model-q4km.gguf \
  Q4_K_M
```

---

## Extract embeddings

```bash
# GET /embedding (llama.cpp server endpoint)
curl -s http://localhost:8080/embedding \
  -H "Content-Type: application/json" \
  -d '{"content": "agent identity for vector search"}' \
  | jq '.embedding | length'   # → 4096 (model dim)
```

---

## Anti-Fake-Pass Checklist

```
❌ ctx-size > model's trained max → gibberish past context boundary (check model card)
❌ n-gpu-layers too high → VRAM OOM; start at 0 and increment until it fits
❌ Q2_K for code tasks → quality too low; code fails to compile, logic errors
❌ --parallel > available RAM/VRAM → OOM on concurrent requests
❌ F16 for CPU inference → 2× slower than Q8_0 with same quality; use Q8_0
❌ Not setting --threads to nproc → defaults to 1 thread, 10× slower
```
