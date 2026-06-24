---
name: loki-log-aggregation
description: Grafana Loki label-based log aggregation. LogQL queries, Promtail scraping, structured log indexing, stream selectors, and log-to-metric extraction for agent audit trail analysis. Sources: grafana/loki (AGPL-3.0).
origin: yana-ai — synthesized from grafana/loki (AGPL-3.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.52
---

# /loki-log-aggregation

## When to Use

- Aggregate logs from all 87 agents into one queryable store without per-log indexing cost
- LogQL: query agent logs like Prometheus queries metrics (label-based, not full-text index)
- Correlate logs with traces: jump from Jaeger trace → matching Loki log lines
- Alert on log patterns: fire alert when "FATAL" appears in agent logs for > 30s

## Do NOT use for

- Metrics (use [[prometheus-scraping-rules]])
- Full-text search across logs (use Elasticsearch for substring search)

---

## Loki label strategy

```
Loki indexes only LABELS (not log content) → keep cardinality low

Good labels (low cardinality, stable):
  {namespace="yamtam", app="agent", tier="power"}

Bad labels (high cardinality):
  {request_id="abc123"}  ← never; one stream per request = OOM
  {user_id="12345"}      ← never; millions of unique streams

Log content filtering (after label selection):
  |= "ERROR"             ← line contains
  |~ "task_id=\w+"       ← regex match
  != "health"            ← does not contain
```

---

## Promtail config (K8s pod log scraping)

```yaml
# promtail-config.yaml
server: { http_listen_port: 9080 }
clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: yamtam-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_namespace]
        action:       keep
        regex:        yamtam.*
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app
      - source_labels: [__meta_kubernetes_pod_label_tier]
        target_label: tier
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
    pipeline_stages:
      # Parse JSON log lines → extract fields as labels
      - json:
          expressions:
            level:    level
            agent_id: agentId
            task_id:  taskId
      - labels:
          level:    null
          agent_id: null
      # Drop debug logs in production
      - drop:
          expression: `level="debug"`
```

---

## LogQL queries

```logql
# All ERROR logs from power-tier agents in last 1h
{namespace="yamtam", tier="power"} |= "ERROR" | json | level="error"

# Count errors per agent per minute
sum by (agent_id) (
  count_over_time(
    {namespace="yamtam"} |= "ERROR" [1m]
  )
)

# Extract latency metric from log line
# Log: {"level":"info","ttft":0.234,"taskId":"abc"}
{namespace="yamtam", app="agent"}
  | json
  | ttft > 2.0
  | line_format "SLOW: task={{.taskId}} ttft={{.ttft}}s"

# Correlation: find logs for a specific trace_id
{namespace="yamtam"} |= "trace_id=abc123def456"
```

---

## Log-to-metric (Loki ruler)

```yaml
# Extract error rate metric from log lines
groups:
  - name: yamtam-log-metrics
    rules:
      - record: yamtam:log_error_rate:5m
        expr: |
          sum by (agent_id) (
            rate({namespace="yamtam"} |= "ERROR" [5m])
          )
      - alert: AgentLogErrorSpike
        expr: yamtam:log_error_rate:5m > 5
        for: 2m
        annotations:
          summary: "Agent {{ $labels.agent_id }} log errors > 5/s"
```

---

## Anti-Fake-Pass Checklist

```
❌ High-cardinality labels (request_id, user_id) → millions of streams, Loki OOM
❌ No pipeline_stages → raw log lines, no label extraction, poor query performance
❌ LogQL regex without anchors → `|~ "error"` matches "errorhandler" too; use `|~ "\berror\b"`
❌ Loki retention too short → historical audit trail unavailable for compliance
❌ Promtail scraping all namespaces → log volume overwhelms Loki; filter by namespace
❌ JSON logs with nested objects → Loki json stage only parses top-level fields by default
```
