---
name: cni-network-policies
description: Container Network Interface (CNI) plugin patterns and Kubernetes NetworkPolicy for agent network isolation. CNI plugin structure, IPAM, namespace-level firewall rules, egress restrictions, and deny-all defaults. Sources: containernetworking/plugins (Apache-2.0).
origin: yamtam-engine — synthesized from containernetworking/plugins (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.52
---

# /cni-network-policies

## When to Use

- Isolate agent namespaces: agent-A cannot reach agent-B's pods directly
- Deny-all default with explicit allow: principle of least-privilege networking
- Restrict egress: sandboxed agents can only call approved external endpoints
- Block inter-namespace traffic: dev agents cannot reach prod database pods

## Do NOT use for

- L7 policy (use [[istio-traffic-management]] for HTTP-level AuthorizationPolicy)
- Performance-sensitive East-West (NetworkPolicy adds iptables rules, minor overhead)

---

## NetworkPolicy: deny all ingress/egress by default

```yaml
# Apply first in every namespace — blocks all traffic until explicitly allowed
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name:      deny-all
  namespace: yamtam
spec:
  podSelector: {}       # applies to all pods in namespace
  policyTypes:
    - Ingress
    - Egress
  # No ingress/egress rules = deny everything
```

---

## Allow specific ingress (agent-b accepts from agent-a only)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name:      allow-agent-a-to-b
  namespace: yamtam
spec:
  podSelector:
    matchLabels: { app: agent-b }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: { app: agent-a }
      ports:
        - protocol: TCP
          port:     3000
```

---

## Allow DNS egress (required for all pods)

```yaml
# Without this, pods can't resolve service names after deny-all
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name:      allow-dns
  namespace: yamtam
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - ports:
        - protocol: UDP
          port:     53
        - protocol: TCP
          port:     53
```

---

## Restrict agent egress to approved external IPs

```yaml
# Sandbox agents: only reach internal services + specific external IPs
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name:      sandbox-egress
  namespace: yamtam-sandbox
spec:
  podSelector:
    matchLabels: { tier: sandbox }
  policyTypes: [Egress]
  egress:
    # Allow internal cluster traffic
    - to:
        - namespaceSelector: {}
    # Allow specific external API (e.g., Anthropic API)
    - to:
        - ipBlock:
            cidr: 160.79.104.0/23   # api.anthropic.com range
      ports:
        - protocol: TCP
          port:     443
```

---

## CNI plugin configuration (reference)

```json
{
  "cniVersion": "1.0.0",
  "name":       "yamtam-net",
  "type":       "bridge",
  "bridge":     "cni0",
  "isGateway":  true,
  "ipMasq":     true,
  "ipam": {
    "type":   "host-local",
    "subnet": "10.88.0.0/16",
    "routes": [{ "dst": "0.0.0.0/0" }]
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ NetworkPolicy without DNS egress allow → pods can't resolve DNS → all outbound connections fail
❌ podSelector: {} on Egress means all pods → correct; but leaving egress rules empty = deny all egress
❌ Policy not enforced without CNI plugin that supports NetworkPolicy (e.g., bare Flannel doesn't) → use Calico/Cilium
❌ ipBlock CIDR for external API → cloud provider NAT may change IPs; use FQDN with Cilium instead
❌ Deny-all applied before allow rules → window where all traffic is blocked (apply atomically)
❌ NetworkPolicy only applies to pods in same namespace by default → namespaceSelector required for cross-namespace
```
