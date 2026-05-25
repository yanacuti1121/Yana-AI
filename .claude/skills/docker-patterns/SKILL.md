---
name: docker-patterns
description: >
  Build production-grade Docker images — multi-stage builds, layer caching,
  non-root user, minimal base images, .dockerignore, health checks,
  docker-compose for local dev, BuildKit secrets, and image size audit.
  Use when asked about "Docker", "Dockerfile", "multi-stage build",
  "Docker image too large", "non-root Docker", "Docker layer cache",
  "docker-compose", "Docker health check", "BuildKit", ".dockerignore",
  "Docker security", "distroless", or "container image best practices".
  Do NOT use for: Kubernetes deployment of that image — see kubernetes-patterns.
  Do NOT use for: container registry setup — see cicd-patterns.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Docker ≥ 24, BuildKit enabled (default since Docker 23). docker-compose v2."
---

## When to Use

- Use when: Dockerfile exists but image is 1GB+ and slow to build
- Use when: app runs as root inside container (security risk)
- Use when: secrets are baked into image layers (git history leak risk)
- Use when: local dev needs consistent environment across team
- Do NOT use for: k8s deployment YAML — see kubernetes-patterns
- Do NOT use for: CI/CD pipeline wiring — see cicd-patterns

---

## Multi-Stage Build (Node.js)

```dockerfile
# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production      # install only prod deps in this layer

# --- build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                         # full deps for build
COPY . .
RUN npm run build

# --- runtime stage --- (smallest possible image)
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only what's needed
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist        ./dist
COPY package.json ./

# Non-root user — REQUIRED for production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

---

## Multi-Stage Build (Python)

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .

RUN useradd -m -u 1000 appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/health || exit 1
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## .dockerignore

```
# Always exclude — reduces context size and prevents secret leaks
.git
.github
.gitignore
node_modules
npm-debug.log*
dist
build
.env
.env.*
*.local
.DS_Store
coverage
.nyc_output
__pycache__
*.pyc
.pytest_cache
*.egg-info
.venv
venv
Dockerfile*
docker-compose*
README.md
docs/
tests/        # exclude if not needed at runtime
```

---

## BuildKit Secrets (No Secret in Layers)

```dockerfile
# Mount secret at build time — NOT baked into image layer
# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./

# Secret mounted as tmpfs — never appears in layer history
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) \
    npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN && \
    npm ci
```

```bash
# Pass secret at build time
docker build --secret id=npm_token,env=NPM_TOKEN .
```

---

## docker-compose for Local Dev

```yaml
# docker-compose.yml
services:
  api:
    build:
      context: .
      target: builder            # use builder stage for dev (has dev tools)
    ports:
      - "3000:3000"
    volumes:
      - .:/app                   # live reload: mount source
      - /app/node_modules        # anonymous volume — don't overwrite container's node_modules
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:password@db:5432/dev
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

## Image Size Audit

```bash
# Inspect layer sizes
docker history myimage:latest --human --format "{{.Size}}\t{{.CreatedBy}}"

# Dive — interactive layer explorer
docker run --rm -it -v /var/run/docker.sock:/var/run/docker.sock wagoodman/dive myimage:latest

# Common bloat causes:
# 1. apt-get without --no-install-recommends
# 2. Build tools left in runtime stage (gcc, make, curl)
# 3. Large base image (ubuntu instead of alpine/slim/distroless)
# 4. Dev dependencies in runtime node_modules
# 5. Source code copied when only dist is needed
```

**Target sizes:** Node.js runtime ~100–150MB, Python ~120–180MB, Go distroless ~15–30MB

---

## Security Scan

```bash
# Trivy — scan for CVEs in image
trivy image myimage:latest

# Or in CI:
trivy image --exit-code 1 --severity HIGH,CRITICAL myimage:latest
```

---

## Anti-Fake-Pass Rules

Before claiming a Dockerfile is production-ready, you MUST show:
- [ ] Multi-stage build — build tools not present in runtime image
- [ ] Non-root user created and set with `USER` directive
- [ ] `.dockerignore` excludes `.git`, `.env`, `node_modules`, `tests`
- [ ] `HEALTHCHECK` defined — k8s/ECS/Docker Swarm requires it
- [ ] No secrets in `ENV`, `ARG`, or `RUN` layers — use `--mount=type=secret`
- [ ] Pinned base image tag (not `node:latest` — use `node:20-alpine`)
- [ ] Runtime image size reasonable (< 200MB for most apps)

Reference: `gates/anti-fake-pass-gate.md`
