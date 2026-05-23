---
name: statsd-metrics-streaming
description: Real-time metrics streaming via StatsD UDP protocol. Counter, gauge, timer, and set metrics; sampling rates; DogStatsD tags; flush intervals; and integration with Datadog/Graphite dashboards. Sources: besquare/node-statsd, statsd spec.
origin: yamtam-engine — synthesized from besquare/node-statsd (MIT), Etsy StatsD protocol spec
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /statsd-metrics-streaming

## When to Use

- Stream agent performance metrics to Datadog/Graphite without blocking execution
- Track tool call counts, execution durations, error rates per session
- Monitor rate limit hits and sandbox rejections in real time
- Low-overhead UDP fire-and-forget — zero latency impact on agent

## Do NOT use for

- Critical delivery metrics (UDP = no acknowledgement, packets may drop)
- High-cardinality tags on every request (DogStatsD tag explosion)

---

## Setup and basic metrics

```javascript
import StatsD from 'node-statsd'

const stats = new StatsD({
  host:      process.env.STATSD_HOST ?? '127.0.0.1',
  port:      parseInt(process.env.STATSD_PORT ?? '8125'),
  prefix:    'yamtam.',
  errorHandler: (err) => console.error('[statsd] error:', err.message),
})

// Counter: increment on each tool call
stats.increment('tool.calls')
stats.increment('tool.calls', 1, ['tool:fetch', `session:${sessionId}`])

// Gauge: current agent count
stats.gauge('agents.active', activeAgentCount)

// Timer: measure tool execution
const start = Date.now()
await runTool(cmd)
stats.timing('tool.duration_ms', Date.now() - start)

// Set: unique sessions today
stats.set('sessions.unique', sessionId)
```

---

## Sampling (reduce UDP volume)

```javascript
// Sample at 10% for high-frequency events
stats.increment('tool.calls.debug', 1, 0.1)
// → sends metric only 10% of the time; StatsD server adjusts rate
```

---

## DogStatsD tags + histogram

```javascript
const ddStats = new StatsD({
  host:       '127.0.0.1',
  port:       8125,
  prefix:     'yamtam.',
  global_tags: [`env:${process.env.NODE_ENV}`, `version:${process.env.YAMTAM_VERSION}`],
})

// Histogram (DogStatsD extension)
ddStats.histogram('sandbox.memory_mb', sandboxMemoryMb, ['sandbox:bwrap'])
```

---

## Wrap tool calls with timing

```javascript
function measuredTool<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  return fn()
    .then(result => {
      stats.timing(`tool.${name}.duration_ms`, Date.now() - start)
      stats.increment(`tool.${name}.success`)
      return result
    })
    .catch(err => {
      stats.increment(`tool.${name}.error`)
      throw err
    })
}
```

---

## Anti-Fake-Pass Checklist

```
❌ No errorHandler → StatsD client throws silently on UDP send failure
❌ Metrics with high-cardinality tags (per-request IDs) → Datadog metric explosion
❌ Missing prefix → metrics mixed with other apps on same StatsD server
❌ UDP drops silently → counter != actual count at high load (use sampling)
❌ stats.close() not called → UDP socket leaks on process exit
❌ timer measured from wrong start point (before async call vs after) → wrong latency
```
