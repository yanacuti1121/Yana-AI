# YAMTAM ENGINE — Container Hardening Law
# Sources:
#   hadolint/hadolint (GPL-3.0)        — github.com/hadolint/hadolint
#   aquasecurity/trivy (Apache 2.0)    — github.com/aquasecurity/trivy
# Gate: Action Gate L3 (infra code review) + pre-push scan

**Status:** Active  
**Tier:** TIER 1 — SECURITY  
**Scope:** All Dockerfile, docker-compose.yml, Kubernetes YAML, Terraform files

---

## Dockerfile Rules (hadolint-derived)

### Tier A — Merge Block (zero exceptions)

```
❌ USER root          — never run container process as root
❌ FROM ubuntu:latest — no floating :latest tags on base images
❌ FROM node          — must specify exact digest or pinned tag (node:20.11.0-alpine3.19)
❌ ADD http://...     — use COPY, not ADD for URLs (no implicit curl)
❌ RUN apt-get install without apt-get update in same RUN layer
❌ ENV secrets        — no API keys, passwords, tokens in ENV instructions
❌ COPY . .           — must use .dockerignore; never copy .env or secrets into image
```

### Tier B — Warning (fix before merge recommended)

```
⚠ No HEALTHCHECK instruction defined
⚠ No non-root USER declaration before CMD/ENTRYPOINT
⚠ Multiple RUN layers that could be collapsed (increases image size)
⚠ apt-get install without --no-install-recommends
⚠ No explicit WORKDIR (relying on default /)
```

### Compliant Dockerfile Pattern

```dockerfile
FROM node:20.11.0-alpine3.19 AS base

WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --only=production --no-install-recommends

COPY --chown=appuser:appgroup . .

USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
```

---

## Docker Compose / Kubernetes Rules (trivy-derived)

### Tier A — Merge Block

```
❌ privileged: true          — no privileged containers
❌ hostNetwork: true         — no host network namespace sharing
❌ hostPID: true             — no host PID namespace sharing
❌ allowPrivilegeEscalation: true
❌ runAsUser: 0              — no root UID
❌ capabilities.add: [ALL]   — no ALL capabilities grant
❌ volumes: ['/:/host']      — no host root mount
```

### Tier B — Warning

```
⚠ No readOnlyRootFilesystem: true
⚠ No resource limits (cpu/memory requests+limits)
⚠ No seccomp or appArmor profile
⚠ Image tag is :latest or missing digest
```

### Compliant Kubernetes Pod Security

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: [ALL]
```

---

## Pre-push Scan Integration

Before pushing any infra file, run:

```bash
# Dockerfile lint (if hadolint available)
hadolint Dockerfile 2>/dev/null || echo "[warn] hadolint not installed — manual review required"

# Trivy misconfiguration scan
trivy config . 2>/dev/null || echo "[warn] trivy not installed — manual review required"
```

Add to `/security-scan` skill execution pipeline.

---

## Violation Response

```
[yamtam/container-hardening] BLOCKED — dangerous container configuration
  File    : <path>
  Rule    : <rule name>
  Source  : hadolint/<trivy>
  Gate    : L3
  Fix     : See compliant pattern above
```
