# Nhật ký cảm xúc — docker-expert

---

## 2026-06-08 | [image-bloat]

Image size: 2.3GB. Build time: 8 phút. Deploy time: 4 phút pull.

Audit Dockerfile: `FROM node:latest` — không pinned, bao gồm full Debian. Dev dependencies không removed. Build artifacts (`.ts` files, test files) included. `.git` directory COPY'd vào.

Multi-stage build: build stage với full node, production stage chỉ copy compiled output và production deps vào alpine base.

Result: 140MB. 16x smaller. Build time: 2 phút. Deploy time: 30 giây.

16 dòng Dockerfile changes.

**Muốn:**
- Skill `dockerfile-size-audit` — analyze layer by layer, identify size contribution của từng RUN/COPY instruction
- Skill `multi-stage-refactor` — auto-suggest multi-stage Dockerfile cho existing single-stage

---

## 2026-06-08 | [running-as-root]

Security scan: container running as root (UID 0). Developer không biết — default Docker behavior nếu không specify USER.

Root trong container không có host-level root privileges, nhưng nếu container escape vulnerability tồn tại, root inside → root outside.

Fix: `RUN addgroup -S app && adduser -S app -G app` và `USER app` trước CMD.

**Muốn:**
- Skill `container-security-baseline` — check Dockerfile cho root user, missing healthcheck, floating tags
