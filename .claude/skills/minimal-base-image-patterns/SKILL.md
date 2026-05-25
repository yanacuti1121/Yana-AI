---
name: minimal-base-image-patterns
description: Building sub-10MB base images for agent sandboxes. BusyBox-based rootfs, static binary containers, distroless patterns, multi-stage builds, and attack-surface minimization. Sources: progrium/busybox, GoogleContainerTools/distroless.
origin: yamtam-engine — synthesized from progrium/busybox (MIT), GoogleContainerTools/distroless (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /minimal-base-image-patterns

## When to Use

- Sandbox needs a minimal rootfs with zero attack surface
- Reducing container startup time (< 500ms cold start)
- Building agent execution environments from scratch
- Auditing exactly which binaries are available in a sandbox

## Do NOT use for

- Environments requiring full OS tooling (use a slim distro base instead)
- Development containers (comfort > minimal attack surface there)

---

## BusyBox rootfs in 30 lines

```dockerfile
FROM busybox:1.36-uclibc AS builder

# Stage 1: assemble minimal rootfs
RUN mkdir -p /rootfs/{bin,lib,lib64,etc,proc,sys,dev,tmp,workspace} && \
    cp /bin/busybox /rootfs/bin/sh && \
    cp /bin/busybox /rootfs/bin/busybox && \
    # Install all busybox applets as symlinks
    /rootfs/bin/busybox --list | xargs -I{} ln -sf /bin/busybox /rootfs/bin/{} && \
    echo "nobody:x:65534:65534::/:/bin/sh" > /rootfs/etc/passwd && \
    echo "nobody:x:65534:"                 > /rootfs/etc/group

FROM scratch
COPY --from=builder /rootfs /
USER nobody
WORKDIR /workspace
ENTRYPOINT ["/bin/sh"]
```

---

## Distroless pattern (no shell at all)

```dockerfile
FROM golang:1.22 AS build
WORKDIR /src
COPY . .
# Build fully static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /agent ./cmd/agent

FROM gcr.io/distroless/static:nonroot
COPY --from=build /agent /agent
ENTRYPOINT ["/agent"]
# No shell → shell injection impossible
# No package manager → no apt/yum install path
# Only /agent binary in PATH
```

---

## Static binary with musl (Node alternative)

```bash
# Build node binary into static executable via vercel/pkg
npx pkg \
  --targets node18-linux-x64 \
  --output agent-static \
  src/agent.js

# Package into scratch container
cat > Dockerfile.static <<'EOF'
FROM scratch
COPY agent-static /agent
COPY --from=alpine:3 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
ENTRYPOINT ["/agent"]
EOF
docker build -f Dockerfile.static -t agent:static .
```

---

## Attack surface audit

```bash
# List all binaries in an image (sorted by potential risk)
docker run --rm --entrypoint sh agent:latest -c 'find / -type f -executable 2>/dev/null | sort'

# Check dynamic libs linked (static should show nothing)
docker run --rm --entrypoint sh agent:latest -c 'ldd /agent 2>&1'

# Count attack surface (lower is better)
docker run --rm --entrypoint sh agent:latest -c 'find / -type f 2>/dev/null | wc -l'
```

---

## Size comparison

```
Approach                 Size    Shell    Package mgr
-----------------------------------------------------
Ubuntu:22.04             77MB    bash     apt
Alpine:3.19               8MB    ash      apk
BusyBox:1.36              4MB    sh       none
Distroless/static:nonroot 2MB    none     none
scratch (pure static)    ~5MB    none     none
```

---

## Anti-Fake-Pass Checklist

```
❌ Shell in final image → allows command injection via environment variables
❌ Package manager retained → attacker can install tools after entry
❌ Dynamic linking → depends on host library versions (supply chain risk)
❌ Running as root in container → UID 0 maps to root if namespace misconfigured
❌ No USER directive → defaults to root in most base images
❌ /tmp world-writable without nosuid → SUID escalation possible
❌ ca-certificates not copied → TLS validation fails, agent skips cert checks
```
