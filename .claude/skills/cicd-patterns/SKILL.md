---
name: cicd-patterns
description: >
  Design CI/CD pipelines and container builds — Dockerfile best practices,
  GitHub Actions pipeline structure, pipeline stages, secrets management in CI,
  deployment strategies, and pipeline failure triage. Use when asked to "set up
  CI", "write a Dockerfile", "GitHub Actions pipeline", "deployment strategy",
  "blue-green deploy", "canary release", or "why is CI slow/failing".
  Do NOT use for: deploy gate authorization — that is YAMTAM's `deploy-gate.sh`.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "GitHub Actions + Docker. Patterns apply to GitLab CI, CircleCI."
---

## When to Use

- Use when: setting up CI/CD for a new project from scratch
- Use when: Docker image is too large or taking too long to build
- Use when: secrets are leaking or improperly handled in CI
- Use when: choosing between blue-green, canary, or rolling deployments
- Do NOT use for: infrastructure provisioning (Terraform/Pulumi) — separate concern

---

## Dockerfile Best Practices

### Layer ordering — put least-changed layers first
```dockerfile
# ✓ Correct: dependencies before source code
FROM node:20-alpine AS base
WORKDIR /app

# Layer 1: system deps (rarely changes)
RUN apk add --no-cache curl

# Layer 2: package lock (changes only when deps change)
COPY package*.json ./
RUN npm ci --only=production

# Layer 3: source (changes every build)
COPY . .

# ✗ Wrong: COPY . . before npm install — cache busted on every commit
```

### Multi-stage builds — keep runtime image small
```dockerfile
# Stage 1: build
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime — only the output, not the build tools
FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node                       # never run as root
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Security rules
- `USER node` (or non-root equivalent) — never `USER root` in runtime stage
- Pin base image tags: `node:20.12-alpine3.19` not `node:latest`
- No secrets in Dockerfile or build args — use runtime env vars
- `.dockerignore`: exclude `.git`, `node_modules`, `*.env`, `*.log`

---

## GitHub Actions Pipeline Structure

### Standard pipeline stages
```yaml
jobs:
  lint:       # Fast feedback — 1–2 min
  test:       # Unit + integration — run in parallel where possible
  build:      # Compile / bundle / Docker build
  security:   # SAST scan, dependency audit
  deploy-staging:   # Auto on main branch
  deploy-production: # Manual gate or tag-triggered
```

### Minimal working pipeline
```yaml
name: CI
on:
  push:    { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

### Secrets in CI — rules
- Use GitHub Actions secrets — never hardcode in workflow files
- Use `${{ secrets.MY_SECRET }}` — never echo or print secrets
- Rotate secrets on any suspected leak — don't wait
- Use OIDC federation for cloud providers (no static credentials in CI):
  ```yaml
  permissions:
    id-token: write
    contents: read
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/GitHubActions
  ```

---

## Deployment Strategies

| Strategy | Risk | Rollback | Best for |
|---|---|---|---|
| Rolling | Medium | Slow (redeploy old) | Standard services |
| Blue-Green | Low | Instant (flip DNS/LB) | Zero-downtime requirement |
| Canary | Low | Fast (reduce traffic %) | Risky changes, large user bases |
| Feature flags | Very low | Instant (flip flag) | Product features, A/B testing |

### Blue-Green
```
Before:  LB → Blue (v1) 100%
Deploy:  spin up Green (v2), run smoke tests
Switch:  LB → Green (v2) 100%
Cleanup: keep Blue for 30 min (instant rollback window), then teardown
```

### Canary
```
Phase 1: 5% traffic → v2    (monitor error rate + latency for 10 min)
Phase 2: 25% traffic → v2   (monitor 10 min)
Phase 3: 100% traffic → v2
Rollback trigger: error rate > SLO threshold at any phase
```

---

## Pipeline Failure Triage

| Symptom | Check |
|---|---|
| Tests pass locally, fail in CI | Environment diff: Node version, env vars, timezone |
| Docker build cache never hits | Layer order wrong — deps after COPY . . |
| Pipeline takes > 20 min | Parallelize jobs; cache dependencies |
| Secret leaking in logs | Audit `echo` / `print` statements; mask in GitHub secrets |
| Deploy fails but build passes | Smoke test missing; check health endpoint after deploy |

---

## Anti-Fake-Pass Rules

Before claiming CI/CD is set up, you MUST show:
- [ ] Dockerfile: multi-stage build, non-root user, pinned base image tag
- [ ] Pipeline: lint → test → build stages present; test runs before build
- [ ] Secrets: in GitHub Actions secrets, not hardcoded — verified no plaintext in workflow
- [ ] Deployment: strategy chosen (rolling/blue-green/canary) and rollback procedure documented
- [ ] Build cache: verified working (second run faster than first)

Reference: `gates/anti-fake-pass-gate.md`
