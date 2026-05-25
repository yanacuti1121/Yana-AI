---
name: traefik-ingress-routing
description: Traefik cloud-native ingress router with automatic TLS, dynamic configuration, middleware chains, and Kubernetes IngressRoute CRDs. Sources: traefik/traefik (MIT).
origin: yamtam-engine — synthesized from traefik/traefik (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.52
---

# /traefik-ingress-routing

## When to Use

- Auto-provision Let's Encrypt TLS for every new agent service without manual certificate management
- Dynamic routing: add new service → Traefik detects via K8s annotations, no restart
- Middleware chains: add rate limiting, auth, IP allowlisting at router level
- Canary routing with weighted backends before Istio service mesh complexity

## Do NOT use for

- East-west (service-to-service) traffic — use [[istio-traffic-management]]
- L4 TCP load balancing (Traefik supports it but Envoy is more capable)

---

## Helm install with Let's Encrypt

```bash
helm repo add traefik https://traefik.github.io/charts
helm install traefik traefik/traefik \
  --namespace traefik --create-namespace \
  --set certificatesResolvers.letsencrypt.acme.email=admin@yamtam.io \
  --set certificatesResolvers.letsencrypt.acme.storage=/data/acme.json \
  --set certificatesResolvers.letsencrypt.acme.httpChallenge.entryPoint=web \
  --set persistence.enabled=true
```

---

## IngressRoute (Traefik CRD)

```yaml
# Route yamtam.example.com → yamtam-agent service with TLS
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name:      yamtam-agent-ingress
  namespace: yamtam
spec:
  entryPoints: [websecure]   # HTTPS
  routes:
    - match: Host(`yamtam.example.com`) && PathPrefix(`/api`)
      kind:     Rule
      services:
        - name: yamtam-agent
          port: 3000
      middlewares:
        - name: rate-limit
        - name: auth-header
  tls:
    certResolver: letsencrypt
```

---

## Middleware definitions

```yaml
# Rate limiting
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
spec:
  rateLimit:
    average: 100   # requests per second
    burst:    50

---
# Basic auth header check
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: auth-header
spec:
  headers:
    customRequestHeaders:
      X-Yamtam-Source: "traefik"
    customResponseHeaders:
      X-Frame-Options: "DENY"

---
# IP allowlist
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: ip-allowlist
spec:
  ipAllowList:
    sourceRange:
      - 10.0.0.0/8
      - 192.168.0.0/16
```

---

## Weighted canary routing

```yaml
# Split traffic: 90% stable, 10% canary
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: yamtam-canary
spec:
  entryPoints: [websecure]
  routes:
    - match: Host(`yamtam.example.com`)
      kind: Rule
      services:
        - name: yamtam-agent-stable
          port:   3000
          weight: 9
        - name: yamtam-agent-canary
          port:   3000
          weight: 1
```

---

## Dynamic routing via K8s annotations (Ingress)

```yaml
# Standard K8s Ingress (simpler than IngressRoute)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: yamtam-agent
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
    traefik.ingress.kubernetes.io/router.middlewares: yamtam-rate-limit@kubernetescrd
spec:
  rules:
    - host: yamtam.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service: { name: yamtam-agent, port: { number: 3000 } }
```

---

## Anti-Fake-Pass Checklist

```
❌ acme.json not persistent (no PVC) → TLS certificates lost on Traefik pod restart, immediate outage
❌ Let's Encrypt rate limits: 5 certificate requests per domain per hour → test with staging ACME first
❌ IngressRoute entryPoint mismatch (web vs websecure) → HTTPS traffic not handled
❌ Middleware name must include @namespace suffix in IngressRoute reference
❌ Multiple Traefik instances sharing same acme.json → certificate conflicts and corruption
❌ Canary weights must sum correctly; Traefik normalizes to ratios but 0-weight = never routed
```
