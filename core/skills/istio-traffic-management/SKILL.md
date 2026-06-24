---
name: istio-traffic-management
description: Istio service mesh traffic management for agent clusters. VirtualService routing, DestinationRule load balancing, circuit breaking, canary deployments, mTLS policies, and fault injection. Sources: istio/istio (Apache-2.0).
origin: yana-ai — synthesized from istio/istio (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.52
---

# /istio-traffic-management

## When to Use

- Canary deploy: route 10% of agent traffic to new version, ramp up if metrics pass
- Circuit breaking: stop sending requests to unhealthy agent pods automatically
- mTLS: encrypt all inter-agent traffic without modifying application code
- Fault injection: test agent resilience by injecting 500ms delay or 10% error rate

## Do NOT use for

- North-south traffic (Ingress) — use [[traefik-ingress-routing]]
- Simple environments without multi-service communication

---

## VirtualService (traffic splitting: canary)

```yaml
# Route 90% to v1, 10% to v2 (canary rollout)
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: yamtam-agent
spec:
  hosts:
    - yamtam-agent
  http:
    - match:
        - headers:
            x-canary: { exact: "true" }   # force canary for testers
      route:
        - destination: { host: yamtam-agent, subset: v2 }
    - route:
        - destination: { host: yamtam-agent, subset: v1 }
          weight: 90
        - destination: { host: yamtam-agent, subset: v2 }
          weight: 10
```

---

## DestinationRule (load balancing + circuit breaker)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: yamtam-agent
spec:
  host: yamtam-agent
  trafficPolicy:
    connectionPool:
      http:
        http1MaxPendingRequests: 100
        http2MaxRequests:        1000
    outlierDetection:            # circuit breaker
      consecutive5xxErrors:  5   # open circuit after 5 consecutive 5xx
      interval:              30s # scan interval
      baseEjectionTime:      60s # eject for 60s
      maxEjectionPercent:    50  # never eject > 50% of pods
  subsets:
    - name: v1
      labels: { version: v1 }
    - name: v2
      labels: { version: v2 }
      trafficPolicy:
        loadBalancer: { simple: LEAST_CONN }
```

---

## Mutual TLS policy (auto-encrypt all agent traffic)

```yaml
# PeerAuthentication: require mTLS in yamtam namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name:      yamtam-mtls
  namespace: yamtam
spec:
  mtls:
    mode: STRICT   # reject plaintext connections

---
# AuthorizationPolicy: agent-A can only call agent-B's /task endpoint
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: agent-b-authz
  namespace: yamtam
spec:
  selector:
    matchLabels: { app: agent-b }
  action: ALLOW
  rules:
    - from:
        - source: { principals: ["cluster.local/ns/yamtam/sa/agent-a"] }
      to:
        - operation: { methods: ["POST"], paths: ["/task/*"] }
```

---

## Fault injection (chaos testing)

```yaml
# Inject 500ms delay for 50% of requests to agent-b
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: agent-b-chaos
spec:
  hosts: [agent-b]
  http:
    - fault:
        delay:
          percentage: { value: 50 }
          fixedDelay: 500ms
        abort:
          percentage: { value: 10 }
          httpStatus: 503
      route:
        - destination: { host: agent-b }
```

---

## Anti-Fake-Pass Checklist

```
❌ Namespace not labeled with istio-injection: enabled → Envoy sidecar not injected, no mesh
❌ PeerAuthentication STRICT without all services having Istio sidecar → plaintext traffic rejected
❌ VirtualService hosts not matching Service name exactly → traffic not intercepted
❌ outlierDetection without connectionPool → circuit breaker ineffective on high concurrency
❌ Canary weight totals ≠ 100 → Istio rejects VirtualService configuration
❌ Fault injection left enabled in production → intentional errors become real customer impact
```
