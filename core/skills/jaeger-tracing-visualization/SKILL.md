---
name: jaeger-tracing-visualization
description: Jaeger distributed trace collection and visualization. OTLP ingest, sampling strategies, trace analysis, latency bottleneck detection, and agent chain root-cause analysis. Sources: jaegertracing/jaeger (Apache-2.0).
origin: yana-ai — synthesized from jaegertracing/jaeger (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.52
---

# /jaeger-tracing-visualization

## When to Use

- Visualize end-to-end trace of a multi-agent task: which agent took longest?
- Root-cause latency: identify the bottleneck span in a 500ms agent chain
- Error propagation: which upstream agent caused a downstream agent to fail?
- Adaptive sampling: only store traces that are slow or errored, discard fast healthy traces

## Do NOT use for

- Metrics aggregation (use [[prometheus-scraping-rules]])
- Log queries (use [[loki-log-aggregation]])

---

## Deploy Jaeger (all-in-one for dev, collector for prod)

```bash
# Development: all-in-one
kubectl apply -f https://github.com/jaegertracing/jaeger/releases/download/v1.58.0/jaeger-all-in-one-kubernetes.yml

# Jaeger UI: http://localhost:16686
kubectl port-forward -n observability svc/jaeger-query 16686:16686

# Production: separate collector + query
helm repo add jaegertracing https://jaegertracing.github.io/helm-charts
helm install jaeger jaegertracing/jaeger \
  --namespace observability --create-namespace \
  --set collector.service.otlp.grpc.name=otlp-grpc \
  --set storage.type=elasticsearch \
  --set elasticsearch.enabled=true
```

---

## OTLP → Jaeger routing (OpenTelemetry Collector)

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch:
    timeout:       1s
    send_batch_size: 1024
  memory_limiter:
    limit_mib: 512

exporters:
  jaeger:
    endpoint: jaeger-collector:14250
    tls: { insecure: true }

service:
  pipelines:
    traces:
      receivers:  [otlp]
      processors: [memory_limiter, batch]
      exporters:  [jaeger]
```

---

## Adaptive sampling (only store slow + error traces)

```yaml
# jaeger-sampling-config.yaml — remote sampling strategy
{
  "service_strategies": [
    {
      "service": "yamtam-agent",
      "type":    "adaptive",
      "max_traces_per_second": 50,
      "operation_strategies": [
        {
          "operation": "task.execute",
          "type":      "probabilistic",
          "param":     0.1    # sample 10% of fast healthy traces
        }
      ]
    }
  ],
  "default_strategy": {
    "type":  "probabilistic",
    "param": 0.05    # 5% of all other traces
  }
}
```

---

## Trace analysis queries (Jaeger API)

```javascript
const JAEGER_URL = 'http://jaeger-query:16686'

// Find slow traces for a service
async function findSlowTraces(service: string, minDurationMs: number) {
  const params = new URLSearchParams({
    service,
    minDuration: `${minDurationMs}ms`,
    limit:       '20',
    lookback:    '1h',
  })
  const res    = await fetch(`${JAEGER_URL}/api/traces?${params}`)
  const traces = await res.json()

  return traces.data.map((t: any) => ({
    traceId:  t.traceID,
    duration: Math.max(...t.spans.map((s: any) => s.duration)) / 1000,  // µs → ms
    spans:    t.spans.length,
    // Find the root span
    root: t.spans.find((s: any) => !s.references?.length),
  }))
}

// Get all spans for a trace
async function getTrace(traceId: string) {
  const res = await fetch(`${JAEGER_URL}/api/traces/${traceId}`)
  return res.json()
}
```

---

## Find bottleneck span

```javascript
function findBottleneck(trace: any): string {
  const spans   = trace.data[0].spans
  const slowest = spans.sort((a: any, b: any) => b.duration - a.duration)[0]
  const service = slowest.process?.serviceName
  const op      = slowest.operationName
  const ms      = (slowest.duration / 1000).toFixed(1)
  return `[jaeger] bottleneck: ${service}.${op} = ${ms}ms`
}
```

---

## Anti-Fake-Pass Checklist

```
❌ All-in-one Jaeger in production → in-memory storage, all traces lost on pod restart
❌ No sampling → every trace stored → TB/day for high-traffic systems, Elasticsearch fills up
❌ TraceID not propagated (missing [[opentelemetry-distributed-tracing]] context propagation) → disconnected spans, not a tree
❌ Jaeger collector not behind auth → anyone can query all internal traces
❌ Adaptive sampling without tail-sampling collector → head sampling misses slow traces (slow = slow to start)
❌ Span timestamps not synchronized (NTP skew > 1s) → trace timeline shows negative durations
```
