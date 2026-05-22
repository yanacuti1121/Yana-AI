---
name: kubernetes-patterns
description: >
  Design and debug Kubernetes workloads — Deployment/StatefulSet patterns,
  resource requests/limits, liveness/readiness/startup probes, HPA/KEDA
  autoscaling, ConfigMap/Secret injection, PodDisruptionBudget, rolling
  update strategy, and debugging CrashLoopBackOff. Use when asked about
  "Kubernetes deployment", "k8s", "pod crashing", "CrashLoopBackOff",
  "OOMKilled", "resource limits", "liveness probe", "readiness probe",
  "HPA", "horizontal pod autoscaler", "rolling update", "kubectl debug",
  "pod not starting", "namespace isolation", or "Kubernetes health check".
  Do NOT use for: Helm chart authoring — that's a separate concern.
  Do NOT use for: cluster provisioning — see terraform-patterns.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Kubernetes ≥ 1.28. kubectl ≥ 1.28. KEDA v2."
---

## When to Use

- Use when: deploying a service to Kubernetes for the first time
- Use when: a pod is crashing (`CrashLoopBackOff`, `OOMKilled`, `Pending`)
- Use when: service is unreachable after deployment (probe misconfiguration)
- Use when: needing autoscaling based on CPU, memory, or custom metrics
- Do NOT use for: cluster setup — use managed k8s (EKS/GKE/AKS) or terraform-patterns
- Do NOT use for: service mesh (Istio/Linkerd) — separate concern

---

## Production-Ready Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0      # zero-downtime: always have 3 pods serving
  template:
    metadata:
      labels:
        app: api-service
    spec:
      containers:
        - name: api
          image: myrepo/api-service:1.2.3   # always pin exact tag, never :latest
          ports:
            - containerPort: 3000

          # Resource budgets — REQUIRED or scheduler can't plan
          resources:
            requests:
              cpu:    "100m"      # guaranteed minimum
              memory: "128Mi"
            limits:
              cpu:    "500m"      # throttled at this, not killed
              memory: "256Mi"     # OOMKilled if exceeded

          # Probes — all three serve different purposes
          startupProbe:           # gives app time to boot (k8s ≥ 1.16)
            httpGet: { path: /health, port: 3000 }
            failureThreshold: 30
            periodSeconds: 5      # up to 150s to start

          readinessProbe:         # gates traffic routing
            httpGet: { path: /health/ready, port: 3000 }
            initialDelaySeconds: 0
            periodSeconds: 5
            failureThreshold: 3

          livenessProbe:          # restarts if stuck
            httpGet: { path: /health/live, port: 3000 }
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3

          # Graceful shutdown
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]   # drain in-flight requests

      terminationGracePeriodSeconds: 30

      # Security hardening
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        readOnlyRootFilesystem: true
```

---

## ConfigMap + Secret Injection

```yaml
# ConfigMap — non-sensitive config
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
data:
  LOG_LEVEL: "info"
  PORT: "3000"
  DB_HOST: "postgres.production.svc.cluster.local"

---
# Secret — sensitive values (base64-encoded)
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
type: Opaque
stringData:            # k8s base64-encodes automatically
  DB_PASSWORD: "$(vault kv get -field=password secret/prod/db)"
  API_KEY: "$(aws secretsmanager get-secret-value ...)"

---
# Inject into Pod
spec:
  containers:
    - name: api
      envFrom:
        - configMapRef: { name: api-config }    # all keys → env vars
        - secretRef:    { name: api-secrets }
      # Or individual key:
      env:
        - name: DB_PASS
          valueFrom:
            secretKeyRef: { name: api-secrets, key: DB_PASSWORD }
```

---

## Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-service
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60    # scale up when avg CPU > 60%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
```

---

## PodDisruptionBudget — Safe Node Drains

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-service-pdb
spec:
  minAvailable: 2       # at least 2 pods always running during node drain
  selector:
    matchLabels:
      app: api-service
```

Without PDB, `kubectl drain` kills all pods simultaneously → outage.

---

## Debug Runbook

```bash
# Pod not starting
kubectl get pods -n production
kubectl describe pod <name> -n production   # look at Events section
kubectl logs <name> -n production --previous   # logs from crashed container

# Common causes:
# ImagePullBackOff  → wrong image tag or missing registry secret
# CrashLoopBackOff  → app crashes on startup; check logs
# OOMKilled         → increase memory limit
# Pending           → insufficient cluster resources; check node capacity

# Exec into running pod
kubectl exec -it <pod> -n production -- /bin/sh

# Port-forward for local debugging
kubectl port-forward svc/api-service 3000:3000 -n production

# Watch rolling update
kubectl rollout status deployment/api-service -n production
kubectl rollout undo deployment/api-service -n production   # rollback
```

---

## Anti-Fake-Pass Rules

Before claiming a Kubernetes deployment is production-ready, you MUST show:
- [ ] `resources.requests` and `resources.limits` set on every container
- [ ] All three probes configured: startup, readiness, liveness
- [ ] Image pinned to exact digest or immutable tag — never `:latest`
- [ ] `PodDisruptionBudget` defined — prevents outage during node drain
- [ ] Secrets injected via `secretRef` — not hardcoded in deployment YAML
- [ ] `runAsNonRoot: true` in `securityContext`
- [ ] `maxUnavailable: 0` in rolling update strategy for zero-downtime

Reference: `gates/anti-fake-pass-gate.md`
