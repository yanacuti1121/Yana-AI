---
name: runtime-metrics-meters
description: Runtime operational metrics with meters, timers, histograms, and moving averages. node-measured patterns for tracking request rates, execution durations, error rates, and EWMAs for agent performance observability. Sources: caustik/node-measured.
origin: yana-ai — synthesized from caustik/node-measured (BSD-2-Clause), metrics patterns from Coda Hale's Metrics library
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /runtime-metrics-meters

## When to Use

- Track tool call rates and durations with 1m/5m/15m moving averages
- Measure p50/p95/p99 latency without external infrastructure
- Count error rates alongside success rates for circuit breaker thresholds
- Self-describing metrics report for agent health API endpoint

## Do NOT use for

- Persistent metrics across restarts (use [[statsd-metrics-streaming]] with Datadog)
- Sub-microsecond precision (overhead makes it unsuitable for tight loops)

---

## Core metrics setup

```javascript
import { createCollection } from 'measured-core'

const metrics = createCollection()

// Counter: monotonically increasing
const toolCalls    = metrics.counter('tool.calls')
const toolErrors   = metrics.counter('tool.errors')

// Meter: rate per second (1m/5m/15m EWMA)
const callRate = metrics.meter('tool.call_rate')

// Timer: duration + rate + histogram
const toolTimer = metrics.timer('tool.duration')

// Gauge: current value
metrics.gauge('agents.active', () => activeAgentCount)
```

---

## Instrument tool calls

```javascript
async function measuredTool(name: string, fn: () => Promise<unknown>) {
  const stopwatch = toolTimer.start()
  toolCalls.inc()
  callRate.mark()

  try {
    const result = await fn()
    return result
  } catch (err) {
    toolErrors.inc()
    metrics.counter(`tool.error.${name}`).inc()
    throw err
  } finally {
    stopwatch.end()
  }
}
```

---

## Read metrics for health endpoint

```javascript
import { createCollection } from 'measured-core'

function getMetricsReport() {
  const data = metrics.toJSON()
  return {
    toolCalls:    data['tool.calls'],
    errorRate:    data['tool.call_rate'],
    duration: {
      mean:  data['tool.duration']?.histogram?.mean,
      p95:   data['tool.duration']?.histogram?.p95,
      p99:   data['tool.duration']?.histogram?.p99,
    },
  }
}

// Health endpoint
app.get('/health/metrics', (_req, res) => {
  res.json(getMetricsReport())
})
```

---

## Histogram percentiles

```javascript
const histogram = metrics.histogram('sandbox.memory_mb')
histogram.update(currentMemMb)

const snap = histogram.toJSON()
// snap.min, snap.max, snap.mean, snap.p50, snap.p75, snap.p95, snap.p99
console.log(`p99 sandbox memory: ${snap.p99?.toFixed(1)} MB`)
```

---

## Anti-Fake-Pass Checklist

```
❌ Timer.start() result not stored → stopwatch.end() not called → duration not recorded
❌ Meter EWMA needs 5+ minutes to stabilize — early readings are misleading
❌ metrics.toJSON() serializes Meter as {count, rate} — access .rate not root object
❌ Histogram percentiles only valid after enough samples (< 5 samples = unreliable p99)
❌ Counter not thread-safe across Node.js cluster workers — each worker has own metrics
❌ No metrics.end() on shutdown → background EWMA intervals keep process alive
```
