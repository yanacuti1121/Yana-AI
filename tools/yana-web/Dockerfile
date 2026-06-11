# ── Yana Web — production Dockerfile ──────────────────────────────────────
# Compatible: Linux · macOS · Windows (via Docker Desktop)
# Arch:       amd64 · arm64 (Apple M-series, Raspberry Pi, AWS Graviton)
# Base:       node:20-alpine — ~50MB, no CVEs vs ubuntu/debian
#
# Build (từ root repo):
#   docker build -f tools/yana-web/Dockerfile -t yana-web .
#
# Run:
#   docker run -p 8081:8081 yana-web
#
# Custom port:
#   docker run -e PORT=3000 -p 3000:3000 yana-web
#
# Mount live skills (dev mode — không cần rebuild khi sửa skills):
#   docker run -p 8081:8081 \
#     -v $(pwd)/core/skills:/app/core/skills:ro \
#     -v $(pwd)/core/agents:/app/core/agents:ro \
#     yana-web

FROM node:20-alpine

# ── System hardening ───────────────────────────────────────────────────────
RUN apk add --no-cache tini su-exec \
    && addgroup -S yana \
    && adduser  -S yana -G yana

# WORKDIR = repo root inside container so __dirname/../../ resolves correctly
# server.js is at /app/tools/yana-web/server.js
# __dirname/../.. = /app  →  /app/MANIFEST.json, /app/core/skills ✓
WORKDIR /app

# ── Copy only what the server needs ───────────────────────────────────────
# 1. Local dependency yamtam-core (must exist before npm ci resolves file: path)
COPY packages/yamtam-core/ ./packages/yamtam-core/

# 2. package files only — for layer caching (npm ci reruns only when these change)
COPY tools/yana-web/package.json tools/yana-web/package-lock.json ./tools/yana-web/

# 3. Install production deps (resolves file:../../packages/yamtam-core)
RUN cd tools/yana-web && npm ci --omit=dev

# 4. Server source (remaining files after deps installed)
COPY tools/yana-web/ ./tools/yana-web/

# 5. MANIFEST (used by /api/status)
COPY MANIFEST.json ./MANIFEST.json

# 6. Skills — 3,400+ SKILL.md files for skill routing
COPY core/skills/ ./core/skills/

# 7. Agents — system prompt .md files
COPY core/agents/ ./core/agents/

# ── Runtime config ─────────────────────────────────────────────────────────
ENV PORT=8081
# Server defaults to loopback; inside a container we must bind all interfaces
ENV HOST=0.0.0.0
ENV NODE_ENV=production
# Railway/fly.io terminate TLS at their proxy — read the client IP from
# X-Forwarded-For and detect HTTPS via X-Forwarded-Proto (see server.js)
ENV YANA_TRUST_PROXY=1

# Persistent data dir — mount a volume here (Railway: volume at /data +
# RAILWAY_RUN_UID=0 so the entrypoint can chown it before dropping privileges)
ENV YANA_DATA_DIR=/data
RUN mkdir -p /data && chown yana:yana /data && chmod 700 /data

RUN chown -R yana:yana /app \
    && chmod +x /app/tools/yana-web/docker-entrypoint.sh
USER yana

EXPOSE 8081

# Health check — /health returns {"ok":true,"skills":N}
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e \
      "require('http').get('http://localhost:'+process.env.PORT+'/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# tini = PID 1 — proper SIGTERM handling, no zombie processes.
# docker-entrypoint.sh: chown the volume if started as root (Railway
# RAILWAY_RUN_UID=0), then drop to the unprivileged yana user.
ENTRYPOINT ["/sbin/tini", "--", "/app/tools/yana-web/docker-entrypoint.sh"]
CMD ["node", "tools/yana-web/server.js"]
