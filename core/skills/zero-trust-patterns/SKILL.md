---
name: zero-trust-patterns
description: >
  Apply zero-trust architecture to services — mTLS with SPIFFE/SPIRE,
  per-request authentication, short-lived credentials, least-privilege
  service accounts, network policy enforcement, and audit logging every
  access decision. Use when asked about "zero trust", "ZTA", "never trust
  always verify", "mTLS", "SPIFFE", "SPIRE", "service identity", "network
  policy", "per-request auth", "service mesh security", "lateral movement
  prevention", "east-west traffic", or "microservice auth". Do NOT use for:
  user-facing authentication — see auth-patterns. Do NOT use for:
  secret storage — see secret-management.
origin: adapted:MIT © VoltAgent/awesome-agent-skills
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Kubernetes + Istio/Cilium, SPIRE v1.x, AWS IAM, general microservices."
---

## When to Use

- Use when: services communicate over a network and trust is assumed (implicit trust = vulnerability)
- Use when: a compromised service could move laterally to other services
- Use when: compliance requires audit log of every inter-service access
- Do NOT use for: public API auth (JWT/OAuth) — see auth-patterns
- Do NOT use for: network perimeter firewall — ZTA replaces, not extends, perimeter

---

## Core Principles

```
1. Never trust — no implicit trust based on network location
2. Always verify — every request authenticated, every time
3. Least privilege — services access only what they need, nothing more
4. Assume breach — contain blast radius, log everything, detect anomalies
```

---

## Service Identity with SPIFFE/SPIRE

```yaml
# SPIRE — issues cryptographic SVIDs (X.509 certs) per workload
# Every pod gets an identity: spiffe://myorg.com/ns/production/sa/payment-service

# spire-server.conf
server {
  trust_domain = "myorg.com"
  bind_address = "0.0.0.0"
  bind_port    = "8081"
}

# Entry: grant "payment-service" an SVID
spire-server entry create \
  -spiffeID "spiffe://myorg.com/ns/production/sa/payment-service" \
  -selector "k8s:ns:production" \
  -selector "k8s:sa:payment-service" \
  -ttl 3600
```

---

## mTLS Between Services

```yaml
# Istio PeerAuthentication — enforce mTLS for all traffic in namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT    # PERMISSIVE during migration, STRICT in production
```

```yaml
# Istio AuthorizationPolicy — only payment-service can call order-service
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: order-service-policy
  namespace: production
spec:
  selector:
    matchLabels:
      app: order-service
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/production/sa/payment-service"
              - "cluster.local/ns/production/sa/checkout-service"
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/orders/*"]
```

---

## Short-Lived Credentials

```bash
# ❌ Long-lived static credentials — if leaked, attacker has indefinite access
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX   # rotated yearly (too long)

# ✅ STS temporary credentials (15min–1hr TTL)
aws sts assume-role \
  --role-arn arn:aws:iam::123456789:role/payment-processor \
  --role-session-name payment-service-$(date +%s) \
  --duration-seconds 900   # 15 minutes

# In k8s: use IRSA (IAM Roles for Service Accounts) — auto-rotated by EKS
# Pod gets STS token mounted at /var/run/secrets/eks.amazonaws.com/serviceaccount/token
```

---

## Kubernetes Network Policy

```yaml
# Default deny all ingress + egress in namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]

---
# Then explicitly allow what payment-service needs
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payment-service-allow
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: payment-service
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: checkout-service
      ports: [{ port: 3000 }]
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports: [{ port: 5432 }]
    - ports: [{ port: 443 }]   # external HTTPS only
```

---

## Audit Log Every Access Decision

```ts
// Log the decision, not just the result
function auditLog(decision: {
  service: string; callerIdentity: string; resource: string;
  action: string; allowed: boolean; reason: string;
}) {
  console.log(JSON.stringify({
    type:     'access_decision',
    ts:       new Date().toISOString(),
    ...decision,
  }));
}

// Middleware
function authzMiddleware(req: Request, res: Response, next: NextFunction) {
  const callerSVID = req.headers['x-spiffe-id'] as string;
  const allowed = policyEngine.evaluate(callerSVID, req.path, req.method);

  auditLog({
    service:        'order-service',
    callerIdentity: callerSVID,
    resource:       req.path,
    action:         req.method,
    allowed,
    reason:         allowed ? 'policy match' : 'no matching policy rule',
  });

  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  next();
}
```

---

## Anti-Fake-Pass Rules

Before claiming zero-trust is implemented, you MUST show:
- [ ] Every service has a cryptographic identity (SVID, IRSA, Workload Identity)
- [ ] mTLS enforced between all services — `STRICT` mode, not `PERMISSIVE`
- [ ] AuthorizationPolicy allows only named caller identities — no wildcard `*`
- [ ] Network policies default-deny — explicit allow-list per service
- [ ] All credentials are short-lived (≤ 1hr TTL)
- [ ] Every access decision is logged with caller identity, resource, and outcome

Reference: `gates/anti-fake-pass-gate.md`
