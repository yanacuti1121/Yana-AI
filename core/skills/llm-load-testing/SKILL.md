---
name: llm-load-testing
description: LLM inference load testing for throughput and concurrency limits. Token/s benchmarks, concurrent request sweeps, latency-vs-throughput curves, and breaking-point identification. Sources: vllm-project/vllm benchmarks (Apache-2.0).
origin: yana-ai — synthesized from vllm-project/vllm benchmark scripts (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /llm-load-testing

## When to Use

- Find the max sustainable QPS before p99 latency breaks SLA
- Compare inference backends (vLLM vs TGI vs Triton) at your specific load
- Capacity planning: how many replicas for N concurrent agents?
- Catch regressions: throughput dropped 30% after model update?

## Do NOT use for

- Accuracy testing (use [[llm-eval-framework]])
- Standard MLPerf reporting (use [[mlperf-inference-benchmarks]])

---

## Key metrics

```
Throughput metrics:
  Requests per second (RPS)        — total requests completed per second
  Output tokens per second (TPS)   — total generated tokens per second
  Input token throughput            — prefill speed

Latency metrics:
  TTFT  — Time to First Token (user-perceived start latency)
  TPOT  — Time Per Output Token (generation speed after first token)
  E2E   — End-to-End latency (TTFT + TPOT × output_len)

Target SLAs (typical):
  Interactive agent: TTFT < 500ms, TPOT < 50ms
  Batch processing:  E2E < 30s, TPS > 1000
```

---

## Benchmark script (concurrent requests)

```python
import asyncio, time, statistics
import aiohttp

async def single_request(session, url: str, payload: dict) -> dict:
  start = time.perf_counter()
  first_token_time = None
  tokens = 0

  async with session.post(url, json=payload) as resp:
    async for line in resp.content:
      if line.startswith(b'data:'):
        if first_token_time is None:
          first_token_time = time.perf_counter() - start
        tokens += 1

  return {
    'ttft':   first_token_time,
    'e2e':    time.perf_counter() - start,
    'tokens': tokens,
  }

async def load_test(url: str, concurrency: int, total: int) -> dict:
  payload = {
    'model':     'local',
    'messages':  [{'role': 'user', 'content': 'Write a haiku about distributed systems.'}],
    'max_tokens': 100,
    'stream':     True,
  }

  semaphore = asyncio.Semaphore(concurrency)
  results   = []

  async def bounded_request(session):
    async with semaphore:
      return await single_request(session, url, payload)

  async with aiohttp.ClientSession() as session:
    tasks = [bounded_request(session) for _ in range(total)]
    start = time.perf_counter()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    elapsed = time.perf_counter() - start

  ok = [r for r in results if isinstance(r, dict)]
  return {
    'rps':         len(ok) / elapsed,
    'tps':         sum(r['tokens'] for r in ok) / elapsed,
    'ttft_p50':    statistics.median(r['ttft'] for r in ok),
    'ttft_p99':    sorted(r['ttft'] for r in ok)[int(len(ok) * 0.99)],
    'e2e_p99':     sorted(r['e2e']  for r in ok)[int(len(ok) * 0.99)],
    'errors':      len(results) - len(ok),
  }

# Sweep concurrency levels
for c in [1, 4, 8, 16, 32, 64]:
  stats = asyncio.run(load_test('http://localhost:8000/v1/chat/completions', c, 100))
  print(f'concurrency={c:3d}: {stats["rps"]:.1f} RPS, p99_ttft={stats["ttft_p99"]:.2f}s, errors={stats["errors"]}')
```

---

## Latency-throughput curve

```
concurrency   RPS    p99_ttft   TPOT
─────────────────────────────────────
1             4.2    0.12s      18ms    ← baseline
4            15.8    0.18s      22ms
8            28.1    0.31s      38ms    ← sweet spot
16           38.4    0.89s      110ms   ← SLA boundary
32           41.2    2.4s       290ms   ← degraded
64           41.0    8.1s       800ms   ← saturated (no gain, high latency)

Optimal operating point: concurrency=8 (28 RPS, p99 < 500ms SLA)
```

---

## Anti-Fake-Pass Checklist

```
❌ Benchmark from same machine as inference server → network/CPU contention, false results
❌ Single concurrency level → misses the latency cliff; always sweep c=1,4,8,16,32,64
❌ No warmup requests → first batch hits cold cache; inflates TTFT
❌ Too short test duration (< 60s) → doesn't capture steady-state throughput
❌ Measuring only throughput, not latency → you can always get more throughput by queuing; check p99
❌ Using synchronous requests for concurrent benchmark → Python GIL limits; use aiohttp/asyncio
```
