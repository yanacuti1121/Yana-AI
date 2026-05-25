---
name: cadvisor-container-metrics
description: cAdvisor container resource metrics from Linux cgroups. CPU throttling detection, OOM kill monitoring, memory working set vs cache, network I/O per container, and integration with Prometheus scraping. Sources: google/cadvisor (Apache-2.0).
origin: yamtam-engine — synthesized from google/cadvisor (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.52
---

# /cadvisor-container-metrics

## When to Use

- Detect CPU throttling: agent is CPU-limited but you don't see high CPU usage
- OOM kill detection: find which agents are being killed by the kernel for exceeding memory limits
- Memory working set: understand actual active memory vs cached memory for right-sizing
- Container network I/O: detect which agent is saturating network bandwidth

## Do NOT use for

- Node-level hardware metrics (use Node Exporter)
- Application-level metrics (use [[prometheus-ai-telemetry]])

---

## Deploy cAdvisor as DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name:      cadvisor
  namespace: kube-system
spec:
  selector:
    matchLabels: { app: cadvisor }
  template:
    metadata:
      labels: { app: cadvisor }
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port:   "8080"
    spec:
      containers:
        - name:  cadvisor
          image: gcr.io/cadvisor/cadvisor:v0.49.1
          ports: [{ containerPort: 8080 }]
          volumeMounts:
            - { name: rootfs,  mountPath: /rootfs,  readOnly: true }
            - { name: var-run, mountPath: /var/run, readOnly: true }
            - { name: sys,     mountPath: /sys,     readOnly: true }
            - { name: docker,  mountPath: /var/lib/docker, readOnly: true }
          securityContext: { privileged: true }
      volumes:
        - { name: rootfs,  hostPath: { path: / } }
        - { name: var-run, hostPath: { path: /var/run } }
        - { name: sys,     hostPath: { path: /sys } }
        - { name: docker,  hostPath: { path: /var/lib/docker } }
```

---

## Key cAdvisor metrics

```promql
# CPU throttling — percentage of time throttled (high = need more CPU limit)
rate(container_cpu_throttled_seconds_total{namespace="yamtam"}[5m])
  / rate(container_cpu_usage_seconds_total{namespace="yamtam"}[5m])

# OOM kills (kernel killed container for exceeding memory limit)
increase(container_oom_events_total{namespace="yamtam"}[1h])

# Memory working set (actual active memory — what to set limits based on)
container_memory_working_set_bytes{namespace="yamtam"}

# Memory cache (page cache — can be evicted, not "real" usage)
container_memory_cache{namespace="yamtam"}

# Usable: working_set = memory - cache
# Set memory.limits to ~1.5× max working set observed over 7 days

# Network receive/transmit bytes per second
rate(container_network_receive_bytes_total{namespace="yamtam"}[5m])
rate(container_network_transmit_bytes_total{namespace="yamtam"}[5m])
```

---

## Resource right-sizing formula

```
Optimal CPU request  = p95(container_cpu_usage_seconds_total rate over 7d)
Optimal CPU limit    = 2× CPU request  (allow burst without throttling)
Optimal memory request = p95(working_set over 7d) + 20% headroom
Optimal memory limit   = p99(working_set over 7d) + 10%
                       ← never set lower than max observed working_set

Alert: throttle_rate > 25% → increase CPU limit
Alert: working_set > 80% of limit → increase memory limit or fix memory leak
```

---

## Alert rules for OOM and throttling

```yaml
groups:
  - name: yamtam.container
    rules:
      - alert: ContainerOOMKilled
        expr: increase(container_oom_events_total{namespace=~"yamtam.*"}[5m]) > 0
        labels: { severity: critical }
        annotations:
          summary: "Container {{ $labels.container }} OOM killed in {{ $labels.namespace }}"

      - alert: HighCPUThrottling
        expr: |
          rate(container_cpu_throttled_seconds_total{namespace=~"yamtam.*"}[5m])
          / rate(container_cpu_usage_seconds_total{namespace=~"yamtam.*"}[5m]) > 0.5
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "{{ $labels.container }} throttled > 50% — increase CPU limit"
```

---

## Anti-Fake-Pass Checklist

```
❌ Memory limit = memory request → no burst headroom; OOM on any spike
❌ Using container_memory_rss for limits instead of working_set → RSS excludes cache; underestimates real pressure
❌ cAdvisor not privileged → can't read /sys/fs/cgroup → blank metrics
❌ CPU throttling alert threshold too low (< 10%) → normal bursting triggers false alerts
❌ OOM alert not paging → OOM kills are always critical; always alert immediately
❌ Right-sizing based on average not p95 → 5% of the time container crashes under normal load
```
