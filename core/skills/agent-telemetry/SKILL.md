---
name: agent-telemetry
description: Telemetry and observability patterns for AI agent systems. Structured multi-transport logging, OpenTelemetry traces/spans through action gates, crash diagnostics, ultra-low-overhead logging, and percentile latency metrics. Sources: winstonjs/winston, open-telemetry/opentelemetry-js, nodejs/node-report, pinojs/pino, vladimir-kostyukov/metrics.
origin: yana-ai — synthesized from winstonjs/winston, open-telemetry/opentelemetry-js, nodejs/node-report, pinojs/pino, vladimir-kostyukov/scalameter (metrics/percentile patterns)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.43
---

# /agent-telemetry

## When to Use

- Tracing an agent action through multiple gates (L0→L5)
- "Why did this agent call fail?" — need structured logs with context
- Measuring p95/p99 latency of tool calls, not just averages
- Post-mortem after an agent crash with minimal clues

## Do NOT use for

- Dev-only scripts (console.log is fine)
- Environments where log output must be completely silent

---

## Structured Logging (winston)

```javascript
import winston from 'winston'

// Routing: DEBUG→file, WARN+→file+stderr, ERROR→file+stderr+alert
const logger = winston.createLogger({
  defaultMeta: { service: 'yamtam-agent', version: process.env.YAMTAM_VERSION },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'releases/logs/agent.log', level: 'debug' }),
    new winston.transports.Console({ level: 'warn',
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()) }),
  ],
})

// Always include structured context — never string interpolation
logger.info('tool_call', { tool: 'WebFetch', url, agentId, sessionId, blastScore })
// NOT: logger.info(`Agent called ${tool}`)  ← unsearchable
```

---

## OpenTelemetry Tracing Through Gates

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('yana-ai', '1.3.43')

async function tracedToolCall(tool: string, args: unknown, execute: () => Promise<string>) {
  return tracer.startActiveSpan(`tool.${tool}`, async (span) => {
    span.setAttributes({
      'agent.tool':     tool,
      'agent.session':  process.env.YAMTAM_SESSION_ID ?? 'unknown',
      'gate.blast':     computeBlastRadius({ tool, args }),
    })

    try {
      // Each middleware step as a child span
      const result = await tracer.startActiveSpan('middleware.pre', async (mwSpan) => {
        const r = await runPreMiddleware(tool, args)
        mwSpan.end()
        return r
      })

      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message })
      throw err
    } finally {
      span.end()
    }
  })
}

// Visualize: pipe to Jaeger / Zipkin / Grafana Tempo
// See full path: agent_intent → pre_middleware → tool_exec → post_middleware → result
```

---

## Crash Diagnostics (node-report pattern)

```javascript
// Auto-generate diagnostic on unhandled crash
import v8 from 'v8'
import fs from 'fs'

process.on('uncaughtException', (err) => {
  const report = {
    timestamp:  new Date().toISOString(),
    error:      err.message,
    stack:      err.stack,
    heapStats:  v8.getHeapStatistics(),
    memUsage:   process.memoryUsage(),
    uptime:     process.uptime(),
    agentState: globalAgentFSM?.state ?? 'unknown',
    lastTool:   auditLog.last(1),
  }
  fs.writeFileSync(
    `releases/logs/crash-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  )
  console.error('[crash] diagnostic written, exiting')
  process.exit(1)
})
// Rule: crash report must include agent FSM state + last tool call for root cause
```

---

## Ultra-Low-Overhead Logging (pino)

```javascript
import pino from 'pino'

// pino: ~8× faster than winston for hot paths (tool middleware logging)
const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['args.apiKey', 'args.password', 'result.token'], // auto-scrub PII
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }    // dev: human-readable
    : undefined,                   // prod: raw JSON (fastest)
})

// Child logger per agent session — zero-overhead context inheritance
const agentLog = log.child({ sessionId: process.env.YAMTAM_SESSION_ID })
agentLog.info({ tool: 'Bash', cmd }, 'tool_exec')
// Rule: use pino for tool middleware (hot path), winston for alert routing
```

---

## Percentile Latency Metrics (p95/p99)

```javascript
// Reservoir sampling — accurate percentiles without storing all values
class LatencyHistogram {
  #samples = []
  #maxSize = 1024

  record(ms) {
    if (this.#samples.length < this.#maxSize) {
      this.#samples.push(ms)
    } else {
      // Reservoir: replace random element to maintain distribution
      const idx = Math.floor(Math.random() * this.#maxSize)
      this.#samples[idx] = ms
    }
  }

  percentile(p) {
    const sorted = [...this.#samples].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * p / 100)]
  }

  report() {
    return {
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
      max: Math.max(...this.#samples),
      count: this.#samples.length,
    }
  }
}

const toolLatency = new LatencyHistogram()
// toolLatency.record(elapsed_ms) after each tool call
// toolLatency.report() → { p50: 45, p95: 280, p99: 850, max: 1200 }
// Alert: p99 > 2000ms = SLO breach
```

---

## Anti-Fake-Pass Checklist

```
❌ Logging with string interpolation (not structured — unsearchable)
❌ OpenTelemetry span not ended in finally block (leaked span = memory)
❌ Crash report missing agent FSM state (can't diagnose without it)
❌ pino used for alert routing (use winston transports for that)
❌ Average latency reported instead of p95/p99 (hides tail latency)
❌ PII in log fields without redact config (token/apiKey logged plaintext)
❌ Log file write without fallback when disk full
```
