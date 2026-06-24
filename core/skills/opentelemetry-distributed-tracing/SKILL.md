---
name: opentelemetry-distributed-tracing
description: OpenTelemetry JS SDK for distributed tracing across agent chains. Span creation, context propagation (W3C Trace Context), OTLP export, baggage passing, and auto-instrumentation for Node.js. Sources: open-telemetry/opentelemetry-js (Apache-2.0).
origin: yana-ai — synthesized from open-telemetry/opentelemetry-js (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.52
---

# /opentelemetry-distributed-tracing

## When to Use

- Trace a request from user → orchestrator → 5 sub-agents → tool execution as a single trace
- Find latency bottleneck: which agent in the chain takes 90% of the time?
- Correlate logs, metrics, and traces for a single request with trace_id
- Auto-instrument: HTTP clients, gRPC, database calls traced without code changes

## Do NOT use for

- Metrics collection (use [[prometheus-scraping-rules]] or [[prometheus-ai-telemetry]])
- Log aggregation (use [[loki-log-aggregation]])

---

## SDK initialization (Node.js)

```javascript
// tracing.ts — must be loaded FIRST before any other imports
import { NodeSDK }                from '@opentelemetry/sdk-node'
import { OTLPTraceExporter }      from '@opentelemetry/exporter-trace-otlp-http'
import { Resource }               from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.YAMTAM_AGENT_ID ?? 'yamtam-agent',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],   // auto-instrument http, grpc, etc.
})

sdk.start()
process.on('SIGTERM', () => sdk.shutdown())
```

---

## Manual span creation

```javascript
import { trace, context, SpanStatusCode } from '@opentelemetry/api'

const tracer = trace.getTracer('yamtam-agent', '1.3.52')

async function executeTask(taskId: string, tool: string, params: object) {
  const span = tracer.startSpan('task.execute', {
    attributes: {
      'yamtam.task_id':  taskId,
      'yamtam.tool':     tool,
      'yamtam.agent_id': process.env.YAMTAM_AGENT_ID!,
    },
  })

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await runTool(tool, params)
      span.setStatus({ code: SpanStatusCode.OK })
      span.setAttribute('yamtam.output_tokens', result.tokens ?? 0)
      return result
    } catch (err: any) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
      span.recordException(err)
      throw err
    } finally {
      span.end()
    }
  })
}
```

---

## Context propagation (W3C Trace Context)

```javascript
import { propagation, context } from '@opentelemetry/api'

// Agent A — inject trace context into outgoing HTTP headers
const headers: Record<string, string> = {}
propagation.inject(context.active(), headers)
// headers now contains: traceparent: "00-{traceId}-{spanId}-01"

await fetch('http://agent-b/api/task', {
  method:  'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body:    JSON.stringify(payload),
})

// Agent B — extract and continue the trace
app.post('/api/task', (req, res) => {
  const ctx = propagation.extract(context.active(), req.headers)
  context.with(ctx, () => {
    const span = tracer.startSpan('task.receive')
    // This span is a child of agent-A's span
    // ...
    span.end()
  })
})
```

---

## Baggage (pass metadata across trace)

```javascript
import { propagation, context, baggageEntryMetadataFromString } from '@opentelemetry/api'

// Set baggage: pass agentId and tier through the entire trace
const baggage = propagation.createBaggage({
  'yamtam.agent_id': { value: 'agent-1' },
  'yamtam.tier':     { value: 'power' },
})
const ctx = propagation.setBaggage(context.active(), baggage)

// Read baggage downstream
const bag      = propagation.getBaggage(context.active())
const agentId  = bag?.getEntry('yamtam.agent_id')?.value
```

---

## Anti-Fake-Pass Checklist

```
❌ tracing.ts not imported first → auto-instrumentation patches happen after modules loaded → misses spans
❌ Span not ended in finally → dangling spans never exported; memory leak
❌ context.with() not used → child spans don't attach to parent; disconnected trace
❌ OTLP exporter URL wrong → spans dropped silently (no error thrown by default)
❌ Baggage vs Attributes: baggage propagates across services, attributes stay on one span only
❌ getNodeAutoInstrumentations() in production without filtering → instruments everything including test libs
```
