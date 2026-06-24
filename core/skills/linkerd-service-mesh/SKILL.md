---
name: linkerd-service-mesh
description: Linkerd2 lightweight service mesh for automatic mTLS, traffic metrics, and certificate rotation. Zero-config mTLS, per-route metrics, traffic splits, retries, and timeouts for inter-agent communication. Sources: linkerd/linkerd2 (Apache-2.0).
origin: yana-ai — synthesized from linkerd/linkerd2 (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.52
---

# /linkerd-service-mesh

## When to Use

- Automatic mTLS for all inter-agent traffic without code changes (lighter than Istio)
- Per-route success rates, p99 latency: which agent endpoint is degraded?
- Traffic splitting: canary deploy with automatic success-rate-gated rollout
- Retries and timeouts: mesh-level reliability without retry logic in application code

## Do NOT use for

- Complex L7 routing policies (use [[istio-traffic-management]])
- Non-Kubernetes environments

---

## Install Linkerd

```bash
# Install CLI
curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install -o /tmp/linkerd-install.sh
# Inspect first: head -40 /tmp/linkerd-install.sh — then run if safe:
sh /tmp/linkerd-install.sh

# Pre-flight check
linkerd check --pre

# Install control plane
linkerd install --crds | kubectl apply -f -
linkerd install        | kubectl apply -f -
linkerd check
```

---

## Inject Linkerd proxy (annotation or CLI)

```yaml
# Annotation on Deployment (auto-inject on rollout)
apiVersion: apps/v1
kind: Deployment
metadata:
  name:      yamtam-agent
  namespace: yamtam
  annotations:
    linkerd.io/inject: enabled   # sidecar injected on pod creation
spec:
  template:
    metadata:
      annotations:
        linkerd.io/inject: enabled
```

```bash
# Or inject all deployments in namespace
kubectl get deploy -n yamtam -o yaml \
  | linkerd inject - \
  | kubectl apply -f -

# Verify injection
linkerd check --proxy -n yamtam
```

---

## Automatic mTLS verification

```bash
# Check that mTLS is active between agent-a and agent-b
linkerd viz edges pod -n yamtam

# Output:
# SRC                  DST                  SECURED
# agent-a-xxxx         agent-b-xxxx         √
# → TLS certificate automatically rotated every 24h
```

---

## Traffic split (canary)

```yaml
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name:      yamtam-canary
  namespace: yamtam
spec:
  service: yamtam-agent
  backends:
    - service: yamtam-agent-stable
      weight: "900m"   # 90%
    - service: yamtam-agent-canary
      weight: "100m"   # 10%
```

---

## ServiceProfile (per-route retries and timeouts)

```yaml
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name:      yamtam-agent.yamtam.svc.cluster.local
  namespace: yamtam
spec:
  routes:
    - name: POST /api/task
      condition:
        method: POST
        pathRegex: /api/task
      responseClasses:
        - condition: { status: { min: 500, max: 599 } }
          isFailure: true
      retryBudget:
        retryRatio:          0.2    # retry up to 20% of requests
        minRetriesPerSecond: 10
        ttl:                 10s
      timeout: 5s
```

---

## Per-route metrics (linkerd viz)

```bash
# Real-time success rate per route
linkerd viz routes -n yamtam deploy/yamtam-agent

# OUTPUT:
# ROUTE                    SERVICE          EFFECTIVE_RPS   EFFECTIVE_SUCCESS
# POST /api/task           yamtam-agent     42.3            98.7%
# GET  /health             yamtam-agent     10.1            100.0%

# Top sources of traffic to a pod
linkerd viz top deploy/yamtam-agent -n yamtam
```

---

## Anti-Fake-Pass Checklist

```
❌ linkerd inject without restarting pods → old pods run without sidecar; mTLS not active
❌ ServiceProfile namespace must match the Service namespace, not the client namespace
❌ TrafficSplit weights must sum to 1000m (milliunits) → non-1000 sum distributes incorrectly
❌ linkerd check failure → control plane issue; don't trust mTLS status until check passes
❌ Linkerd viz not installed → edges/routes/top commands fail; viz is separate from core
❌ retryBudget without isFailure routes → all responses retried including 200s (infinite loop)
```
