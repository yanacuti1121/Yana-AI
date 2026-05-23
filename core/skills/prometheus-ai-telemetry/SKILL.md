---
name: prometheus-ai-telemetry
description: Prometheus metrics for LLM/AI inference telemetry. Token throughput counters, KV-cache hit/miss rates, latency histograms, model queue depth gauges, and Grafana dashboard patterns. Sources: prometheus/client_golang (Apache-2.0).
origin: yamtam-engine — synthesized from prometheus/client_golang (Apache-2.0), prom-client (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.51
---

# /prometheus-ai-telemetry

## When to Use

- Expose tokens/s, TTFT, queue depth from LLM inference engines to Grafana
- Alert when cache hit rate drops below 60% (indicates prompt change degrading prefix caching)
- Track per-model cost: tokens consumed × price/token over time
- Detect inference regressions: p99 latency spike after model update

## Do NOT use for

- Application-level metrics unrelated to AI (use [[statsd-metrics-streaming]])
- One-shot benchmarks (use [[mlperf-inference-benchmarks]])

---

## Core AI metrics to instrument

```
Counters (monotonically increasing):
  llm_tokens_total{model, type="input|output"}    — total tokens processed
  llm_requests_total{model, status="ok|error"}     — request count
  llm_cost_usd_total{model}                        — estimated cost

Histograms (latency distribution):
  llm_ttft_seconds{model}          — Time to First Token
  llm_e2e_latency_seconds{model}   — end-to-end request latency
  llm_tokens_per_second{model}     — generation throughput

Gauges (current value):
  llm_active_requests{model}       — in-flight requests
  llm_queue_depth{model}           — waiting requests
  llm_kv_cache_hit_rate{model}     — prefix cache efficiency (0–1)
  llm_gpu_memory_used_bytes{gpu}   — VRAM utilization
```

---

## Node.js instrumentation (prom-client)

```javascript
import { Registry, Counter, Histogram, Gauge } from 'prom-client'

const registry = new Registry()

const tokenCounter = new Counter({
  name:    'llm_tokens_total',
  help:    'Total tokens processed',
  labelNames: ['model', 'type'],
  registers: [registry],
})

const ttftHistogram = new Histogram({
  name:    'llm_ttft_seconds',
  help:    'Time to first token latency in seconds',
  labelNames: ['model'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
  registers: [registry],
})

const activeRequests = new Gauge({
  name:    'llm_active_requests',
  help:    'Currently in-flight LLM requests',
  labelNames: ['model'],
  registers: [registry],
})

// Instrument an inference call
async function instrumentedInfer(model: string, prompt: string): Promise<string> {
  const start = Date.now()
  activeRequests.inc({ model })

  try {
    let firstToken = false
    let result     = ''

    for await (const token of streamInfer(model, prompt)) {
      if (!firstToken) {
        ttftHistogram.observe({ model }, (Date.now() - start) / 1000)
        firstToken = true
      }
      result += token
      tokenCounter.inc({ model, type: 'output' })
    }

    tokenCounter.inc({ model, type: 'input' }, estimateTokens(prompt))
    return result
  } finally {
    activeRequests.dec({ model })
  }
}

// Expose /metrics endpoint
import express from 'express'
const app = express()
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType)
  res.send(await registry.metrics())
})
```

---

## Grafana alert rules

```yaml
# alerts.yaml — alert on AI infra degradation
groups:
  - name: yamtam-ai
    rules:
      - alert: HighTTFT
        expr: histogram_quantile(0.99, rate(llm_ttft_seconds_bucket[5m])) > 2.0
        for: 2m
        labels:     { severity: warning }
        annotations:
          summary: "p99 TTFT > 2s for {{ $labels.model }}"

      - alert: LowCacheHitRate
        expr: llm_kv_cache_hit_rate < 0.5
        for: 5m
        labels:     { severity: warning }
        annotations:
          summary: "KV cache hit rate < 50% — prefix caching degraded"

      - alert: HighQueueDepth
        expr: llm_queue_depth > 50
        for: 1m
        labels:     { severity: critical }
        annotations:
          summary: "Inference queue backlog > 50 — scale up or throttle"
```

---

## Anti-Fake-Pass Checklist

```
❌ Not labeling by model → all models merged in one metric, can't diagnose regressions
❌ Histogram buckets too coarse (e.g., [1, 5, 10]) → can't distinguish 50ms from 999ms
❌ Counter reset on process restart → rate() will show negative spike; use increase() for totals
❌ Gauge for tokens (should be Counter) → gauge can decrease; tokens only increase
❌ /metrics endpoint not secured → exposes system internals; add IP allowlist or basic auth
❌ Not recording input tokens separately → cost estimation impossible without input count
```
