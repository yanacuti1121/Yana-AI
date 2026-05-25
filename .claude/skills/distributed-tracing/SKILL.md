---
name: distributed-tracing
description: >
  Instrument and debug distributed systems with tracing — OpenTelemetry
  setup, span creation, context propagation (W3C traceparent), sampling
  strategy, exporter configuration (Jaeger/Tempo/Honeycomb/Datadog),
  and correlating traces with logs. Use when asked to "add tracing",
  "OpenTelemetry", "OTel", "distributed trace", "trace propagation",
  "traceparent header", "find slow span", "Jaeger", "Tempo", "Honeycomb",
  "why is this request slow across services", or "trace ID in logs".
  Do NOT use for: metrics collection alone — see observability-instrumentation.
  Do NOT use for: single-service profiling — tracing spans cross-service boundaries.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "OpenTelemetry JS SDK ≥ 1.x, Python SDK ≥ 1.x. Vendor-agnostic via OTLP."
---

## When to Use

- Use when: a request touches > 1 service and you can't tell where latency is coming from
- Use when: adding observability to a new microservice before it goes to production
- Use when: correlating logs across services using a shared trace ID
- Use when: debugging intermittent slowness that only appears under load
- Do NOT use for: single-process performance profiling — use a profiler (py-spy, clinic.js)
- Do NOT use for: error aggregation alone — traces complement, not replace, error tracking

---

## Core Concepts

```
Trace   = one request's full journey across all services
Span    = one unit of work within a trace (DB query, HTTP call, function)
Context = trace ID + span ID propagated across process boundaries via headers

W3C traceparent header (de facto standard):
  traceparent: 00-{traceId:32hex}-{spanId:16hex}-{flags:2hex}
  Example:     00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                  └─ version    └─ trace ID (128-bit)  └─ span ID  └─ sampled
```

---

## Setup (Node.js — SDK init must run before any imports)

```js
// tracing.js — must be required FIRST: node -r ./tracing.js app.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]:    'checkout-service',
    [SEMRESATTRS_SERVICE_VERSION]: process.env.APP_VERSION ?? 'unknown',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()], // auto-instruments HTTP, Express, DB drivers
});

sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
```

Auto-instrumentation covers Express, `fetch`/`http`, `pg`, `redis`, `mongoose` — no manual work for common libraries.

---

## Manual Spans

```js
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const tracer = trace.getTracer('checkout-service');

async function processPayment(orderId, amount) {
  return tracer.startActiveSpan('payment.process', async (span) => {
    span.setAttributes({
      'order.id':     orderId,
      'payment.amount': amount,
      'payment.currency': 'USD',
    });
    try {
      const result = await paymentProvider.charge(orderId, amount);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err);                       // captures stack trace
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();                                      // always end the span
    }
  });
}
```

---

## Setup (Python)

```python
# At app startup — before other imports
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

provider = TracerProvider(resource=Resource({SERVICE_NAME: "order-service"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)

FastAPIInstrumentor.instrument()
SQLAlchemyInstrumentor().instrument(engine=engine)

# Manual span
tracer = trace.get_tracer("order-service")
with tracer.start_as_current_span("inventory.check") as span:
    span.set_attribute("product.id", product_id)
    result = check_inventory(product_id)
```

---

## Sampling Strategy

```
Always-on (100%)   → dev/staging only — too expensive in high-traffic prod
Head-based (%)     → decide at trace root; cheap but misses rare errors
                     OTEL_TRACES_SAMPLER=parentbased_traceidratio
                     OTEL_TRACES_SAMPLER_ARG=0.1   ← 10% of traces

Tail-based         → collect all spans, decide after seeing full trace
                     → captures 100% of errors and slow requests
                     → requires a collector (OTel Collector tail sampler)
                     → recommended for production
```

```yaml
# OTel Collector tail sampling — keep all errors + slow requests
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors,     type: status_code, status_code: { status_codes: [ERROR] }
      - name: slow,       type: latency,     latency: { threshold_ms: 1000 }
      - name: sample-10,  type: probabilistic, probabilistic: { sampling_percentage: 10 }
```

---

## Correlating Traces with Logs

```js
// Inject trace ID into every log entry — enables log→trace navigation
const { trace, context } = require('@opentelemetry/api');

function getTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { traceId, spanId };
}

// With Pino
const logger = pino({
  mixin: getTraceContext,   // automatically added to every log line
});

// Log output:
// {"level":30,"msg":"Payment processed","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","spanId":"00f067aa0ba902b7"}
```

In Grafana: paste `traceId` into Tempo → click "Logs for this span" to jump to Loki.

---

## Common Pitfalls

| Mistake | Fix |
|---|---|
| `sdk.start()` called after app imports | Init tracing before ALL other requires/imports |
| Span never ended (`span.end()` missing) | Use `startActiveSpan` with callback — auto-ends |
| No service name set | Always set `SERVICE_NAME` resource attribute |
| Sampling 100% in production | Use tail-based or 1–10% head-based |
| Trace context not forwarded in async queues | Manually serialize + deserialize context in message headers |

---

## Anti-Fake-Pass Rules

Before claiming tracing is done, you MUST show:
- [ ] SDK init runs before all other imports — not mid-file
- [ ] `service.name` resource attribute set — not default "unknown_service"
- [ ] Manual spans used for business-critical paths (not just HTTP auto-instrumentation)
- [ ] Errors recorded on spans with `span.recordException()` + `SpanStatusCode.ERROR`
- [ ] `span.end()` called in all paths — including error branches
- [ ] Trace ID injected into log entries for log↔trace correlation
- [ ] Sampling strategy defined — not 100% in production

Reference: `gates/anti-fake-pass-gate.md`
