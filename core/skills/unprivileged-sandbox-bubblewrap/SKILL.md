---
name: unprivileged-sandbox-bubblewrap
description: Rootless sandbox via bubblewrap (bwrap). No-root container isolation using user namespaces, read-only bind mounts, tmpfs overlays, seccomp profiles, and capability dropping. Ideal for GitHub Codespaces. Sources: containers/bubblewrap.
origin: yana-ai — synthesized from containers/bubblewrap (Flatpak project, LGPL-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /unprivileged-sandbox-bubblewrap

## When to Use

- Running untrusted agent commands in Codespaces without root
- Isolating file writes: agent sees workspace read-only, writes go to tmpfs
- Blocking network access for local-only operations
- Quick sandbox wrapper around any shell command

## Do NOT use for

- Windows/macOS — bwrap is Linux-only
- Scenarios requiring full Docker daemon (use OCI runc instead)

---

## Basic bwrap sandbox

```bash
#!/usr/bin/env bash
# bwrap-sandbox.sh — wrap any command in an unprivileged sandbox
set -euo pipefail

WORKSPACE="${1:-/workspaces}"
shift
CMD=("$@")

bwrap \
  --ro-bind  /usr          /usr         \
  --ro-bind  /lib          /lib         \
  --ro-bind  /lib64        /lib64       \
  --ro-bind  /bin          /bin         \
  --ro-bind  /etc/resolv.conf /etc/resolv.conf \
  --ro-bind  "$WORKSPACE"  /workspace   \
  --bind     /dev/null     /dev/null    \
  --tmpfs    /tmp                       \
  --tmpfs    /run                       \
  --proc     /proc                      \
  --dev      /dev                       \
  --unshare-pid                         \
  --unshare-net                         \
  --unshare-uts                         \
  --unshare-ipc                         \
  --new-session                         \
  --die-with-parent                     \
  --chdir    /workspace                 \
  --setenv   HOME /tmp                  \
  --setenv   TMPDIR /tmp                \
  -- "${CMD[@]}"
```

---

## With seccomp profile

```bash
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --tmpfs /tmp \
  --proc /proc \
  --dev /dev \
  --unshare-all \
  --seccomp 10 \
  --new-session \
  -- /bin/bash -c "echo safe" \
  10< /etc/yamtam/seccomp-agent.json
# fd 10 passes the seccomp BPF profile
```

---

## Network-isolated code execution

```bash
bwrap_exec_isolated() {
  local code_file="$1"
  bwrap \
    --ro-bind  /usr     /usr    \
    --ro-bind  /lib     /lib    \
    --ro-bind  /lib64   /lib64  \
    --ro-bind  /bin     /bin    \
    --ro-bind  "$code_file" /sandbox/script.sh \
    --tmpfs    /tmp             \
    --proc     /proc            \
    --dev      /dev             \
    --unshare-all               \
    --die-with-parent           \
    -- /bin/sh /sandbox/script.sh
}
```

---

## Yamtam integration (wrapping tool-proxy.sh)

```bash
# In tool-proxy.sh mutate phase — upgrade L2 sandbox to bwrap if available
if command -v bwrap &>/dev/null && [[ "${YAMTAM_BWRAP_SANDBOX:-0}" == "1" ]]; then
  BWRAP_ARGS=(
    bwrap
    --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64
    --ro-bind /bin /bin
    --tmpfs /tmp --proc /proc --dev /dev
    --unshare-pid --unshare-net --unshare-ipc
    --die-with-parent --new-session
  )
  FINAL_CMD="${BWRAP_ARGS[*]} -- $FINAL_CMD"
fi
```

---

## Capability audit in bwrap context

```bash
# Check what caps bwrap subprocess has
bwrap --ro-bind /usr /usr --ro-bind /lib /lib --tmpfs /tmp \
  --proc /proc --dev /dev --unshare-all \
  -- /bin/sh -c "cat /proc/self/status | grep Cap"
# CapPrm/CapEff should be 0000000000000000 in strict mode
```

---

## Anti-Fake-Pass Checklist

```
❌ --share-net left on → sandbox can reach external APIs, host services
❌ No --die-with-parent → zombie sandbox processes outlive the session
❌ --bind (not --ro-bind) on workspace → agent can write to real source files
❌ /tmp not isolated (--tmpfs) → sandbox writes pollute host /tmp
❌ /proc not mounted → many tools fail silently (stat /proc/self)
❌ --new-session missing → signals can escape to host terminal session
❌ No seccomp profile on production use → ptrace/mount still reachable
```
