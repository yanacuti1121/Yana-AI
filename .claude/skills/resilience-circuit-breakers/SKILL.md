---
name: resilience-circuit-breakers
description: Resilience patterns for AI agent external calls. Circuit breakers, exponential backoff with jitter, stream recovery, batch error handling, and log fallback under disk pressure. Sources: nodeshift/opossum, softonic/axios-retry, vimeo/player.js, trentm/node-bunyan, visionmedia/batch.
origin: yamtam-engine — synthesized from nodeshift/opossum, softonic/axios-retry, vimeo/player.js, trentm/node-bunyan, visionmedia/batch
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.43
---

# /resilience-circuit-breakers

## When to Use

- Agent calls external LLM API, WebFetch, or DB that can fail/rate-limit
- Stream-based data pipeline where disconnects must not lose data
- Batch of agent tasks where some fail and need retry without blocking others
- "Agent crashes on every 429 / timeout instead of backing off"

## Do NOT use for

- Internal in-process function calls (no network = no circuit needed)
- One-shot scripts that don't retry

---

## Circuit Breaker (opossum)

```javascript
import CircuitBreaker from 'opossum'

// Wrap any async function — breaks circuit after 5 failures in 10s
const callLLM = async (prompt) => fetch('/api/llm', { method: 'POST', body: prompt })

const breaker = new CircuitBreaker(callLLM, {
  timeout:              5000,   // fail if > 5s
  errorThresholdPct:    50,     // open after 50% failures
  resetTimeout:         30000,  // try again after 30s (half-open)
  volumeThreshold:      5,      // min 5 calls before tripping
})

breaker.fallback(() => ({ cached: true, text: 'LLM unavailable — using cached response' }))
breaker.on('open',     () => console.warn('[circuit] OPEN — LLM unreachable'))
breaker.on('halfOpen', () => console.log('[circuit] HALF-OPEN — testing'))
breaker.on('close',    () => console.log('[circuit] CLOSED — restored'))

// Usage: same API as the original function
const result = await breaker.fire(prompt)
```

---

## Exponential Backoff + Jitter (axios-retry)

```javascript
import axios from 'axios'
import axiosRetry from 'axios-retry'

axiosRetry(axios, {
  retries: 4,
  retryDelay: (retryCount) => {
    const base = axiosRetry.exponentialDelay(retryCount)  // 1s, 2s, 4s, 8s
    const jitter = Math.random() * 1000                   // 0–1000ms noise
    return base + jitter  // prevents thundering herd on shared API
  },
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    error.response?.status === 429 ||
    error.response?.status >= 500,
  onRetry: (count, error) => {
    console.warn(`[retry] attempt ${count} after: ${error.message}`)
  },
})

// Rule: always add jitter to retry delay when multiple agents share an API
// Rule: 429 = rate limit → retry; 400 = bad request → do NOT retry (fix the call)
```

---

## Stream Recovery (Vimeo player.js pattern)

```typescript
// Pattern: detect stream interruption, buffer + replay from last checkpoint
class ResumableStream {
  #offset = 0
  #buffer: Buffer[] = []

  pipe(source: NodeJS.ReadableStream, sink: NodeJS.WritableStream) {
    source.on('data', (chunk) => {
      this.#buffer.push(chunk)
      this.#offset += chunk.length
      sink.write(chunk)
    })

    source.on('error', (err) => {
      console.error(`[stream] error at offset ${this.#offset}:`, err.message)
      this.#reconnect(sink)
    })
  }

  #reconnect(sink: NodeJS.WritableStream) {
    // Replay buffered chunks not yet confirmed downstream
    for (const chunk of this.#buffer) sink.write(chunk)
    this.#buffer = []
  }
}
// Rule: never drop stream data on error — buffer and replay
// Rule: buffer max = 5MB — beyond that, write checkpoint to disk
```

---

## Log Fallback Under Disk Pressure (bunyan pattern)

```javascript
import bunyan from 'bunyan'
import fs from 'fs'

// Primary: structured JSON log file
// Fallback: stderr + memory ring buffer when disk full/locked
const log = bunyan.createLogger({
  name: 'yamtam-agent',
  streams: [
    {
      type:   'rotating-file',
      path:   'releases/logs/agent.log',
      period: '1d',
      count:  7,
    },
    {
      level:  'warn',
      stream: process.stderr,      // always available fallback
    }
  ],
})

// Graceful handling of ENOSPC (no space left on device)
process.on('uncaughtException', (err) => {
  if (err.code === 'ENOSPC') {
    console.error('[log] disk full — switching to stderr only')
    // log-rotate.sh should trigger here
  }
})
```

---

## Batch Error Handling (visionmedia/batch)

```javascript
import Batch from 'batch'

// Process 50 agent sub-tasks — collect ALL results, even partial failures
const batch = new Batch()
batch.concurrency(5)   // max 5 parallel (matches p-queue pattern)

agentSubTasks.forEach(task => {
  batch.push((done) => {
    executeAgentTask(task)
      .then(result => done(null, result))
      .catch(err   => done(null, { error: err.message, task }))  // null = don't abort batch
  })
})

batch.end((err, results) => {
  if (err) return console.error('Batch aborted:', err)  // only on .push() throw
  const failed  = results.filter(r => r.error)
  const success = results.filter(r => !r.error)
  console.log(`${success.length} OK, ${failed.length} failed`)
  // Re-queue failed tasks for retry with backoff
  failed.forEach(f => retryQueue.add(() => executeAgentTask(f.task)))
})
```

---

## Anti-Fake-Pass Checklist

```
❌ Circuit breaker absent on LLM API calls (429 storm = agent crash loop)
❌ Retry without jitter on shared API (thundering herd)
❌ Retry on 4xx errors (400 = bad request, retrying won't fix it)
❌ Stream data dropped on error (must buffer and replay)
❌ Log write fails silently when disk full (must fall back to stderr)
❌ Batch aborts on first error (use done(null, err) to collect all results)
❌ resetTimeout missing on circuit breaker (open state = permanent outage)
```
