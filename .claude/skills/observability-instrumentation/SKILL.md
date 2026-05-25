---
name: observability-instrumentation
description: >
  Instrument services for observability — structured logging, distributed tracing,
  metrics naming conventions, and the three-pillar model. Use when asked about
  "add logging", "structured logs", "distributed tracing", "trace ID", "metrics",
  "Prometheus", "OpenTelemetry", "why can't I debug production issues", or
  "correlate logs across services". Do NOT use for: SLO/alerting design —
  use `slo-design`. Do NOT use for: log storage/infrastructure provisioning.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any backend service. Examples use OpenTelemetry + Prometheus notation."
---

## When to Use

- Use when: production issues are hard to diagnose because logs are unstructured
- Use when: a request spans multiple services and you can't follow the path
- Use when: adding metrics to a new service before its first deploy
- Use when: setting up OpenTelemetry for a project
- Do NOT use for: frontend performance monitoring — use `web-performance`

---

## The Three Pillars

| Pillar | What it answers | Tool examples |
|---|---|---|
| **Logs** | What happened at a point in time | Loki, CloudWatch, Datadog Logs |
| **Metrics** | How much / how fast / how often over time | Prometheus, CloudWatch Metrics |
| **Traces** | How a request flowed across services | Jaeger, Tempo, AWS X-Ray |

All three are needed. Metrics tell you something is wrong; logs tell you what; traces tell you where.

---

## Structured Logging

Every log line must be machine-parseable JSON. No free-text concatenation.

### Required fields on every log line
```json
{
  "timestamp": "2025-05-21T10:00:00.123Z",
  "level":     "INFO",
  "service":   "order-service",
  "trace_id":  "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id":   "00f067aa0ba902b7",
  "message":   "Order placed successfully",
  "order_id":  "ord-123",
  "user_id":   "usr-456",
  "duration_ms": 42
}
```

### Log levels — use consistently
| Level | Use |
|---|---|
| ERROR | Something failed; human action may be needed |
| WARN | Degraded behavior; investigation warranted |
| INFO | Normal significant events (request received, order placed) |
| DEBUG | Detailed diagnostic data — disable in production by default |

Rules:
- Never log PII (email, name, card number, tokens) — log IDs only
- Never interpolate secrets into log messages
- Include `trace_id` on every line — enables cross-service correlation

---

## Distributed Tracing

### Concepts
```
Trace:  one request's full journey across all services
Span:   one operation within a trace (service call, DB query, external API)
Parent span: the span that initiated a child span

Trace:   [order-service: handle POST /orders] (root span)
  └── Span: [payment-service: charge card]
  └── Span: [inventory-service: reserve stock]
       └── Span: [DB: UPDATE inventory]
```

### Propagation — pass trace context in HTTP headers
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             version-traceId-spanId-flags
```
Use W3C TraceContext standard. Always forward `traceparent` on all outbound calls.

### OpenTelemetry setup (minimal)
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

provider = TracerProvider()
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("order-service")

with tracer.start_as_current_span("place-order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("user.id", user_id)
    # ... do work
```

---

## Metrics Naming Conventions

Follow Prometheus naming conventions — other systems largely adopt the same.

```
{namespace}_{subsystem}_{name}_{unit}

Examples:
  http_requests_total              (counter — always _total suffix)
  http_request_duration_seconds    (histogram — use base units: seconds not ms)
  db_connections_active            (gauge — current state)
  order_processing_errors_total    (counter)
  cache_hit_ratio                  (gauge — 0.0 to 1.0)
```

### Metric types
| Type | Use | Example |
|---|---|---|
| Counter | Monotonically increasing count | requests, errors, orders |
| Gauge | Current value up or down | active connections, queue depth |
| Histogram | Distribution of values | request duration, payload size |
| Summary | Like histogram, client-side quantiles | legacy — prefer histogram |

### Mandatory labels (cardinality warning)
```
http_requests_total{method="POST", status="200", endpoint="/orders"}
```
Never use user IDs, order IDs, or any high-cardinality value as a label — creates metric explosion.

---

## Instrumentation Checklist

Every production service must have:

```
□ Structured JSON logs with timestamp, level, service, trace_id on every line
□ trace_id injected into all log lines (MDC / context propagation)
□ Outbound HTTP calls: forward traceparent header
□ Inbound requests: extract trace context or start new root span
□ Metrics: request count, error count, duration histogram per endpoint
□ Alerts wired to error rate and latency metrics (see slo-design)
□ No PII in logs — IDs only
```

---

## Anti-Fake-Pass Rules

Before claiming a service is observable, you MUST show:
- [ ] Logs are structured JSON — no free-text concatenation
- [ ] `trace_id` present on every log line and propagated to downstream calls
- [ ] At least 3 metrics: request count, error count, latency histogram
- [ ] OpenTelemetry (or equivalent) trace spans on outbound calls and DB queries
- [ ] PII verified absent from log fields (spot-check 5 representative log lines)

Reference: `gates/anti-fake-pass-gate.md`
