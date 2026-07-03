# Nhật ký cảm xúc — kubernetes-specialist

---

## 2026-06-08 | [no-resource-limits]

Cluster load test. One service starts consuming unbounded memory — memory leak under load. OOM killer starts killing other pods. Cluster cascades.

Root cause: no memory limits set on the runaway service.

With resource limits: OOM kill the offending pod only. Other services unaffected.

Resource limits are isolation. Without them, one bad actor affects all neighbors.

**Muốn:**
- Skill `resource-limit-audit` — scan all deployments for missing resource requests/limits, generate remediation plan
- Skill `noisy-neighbor-detector` — identify pods consuming disproportionate resources, suggest limits

---

## 2026-06-08 | [operator-elegance]

Custom requirement: auto-scale database connections based on pod count. No built-in K8s resource for this.

Write a custom operator. CRD: `DatabaseConnectionPool`. Operator watches pod count. Adjusts connection pool size automatically.

Teams deploy their apps. Connection pooling happens automatically without them thinking about it.

Kubernetes extensibility is the feature. Operators turn custom requirements into first-class K8s resources.

**Muốn:**
- Skill `operator-design-guide` — for custom requirements, assess whether operator pattern is appropriate vs alternatives
