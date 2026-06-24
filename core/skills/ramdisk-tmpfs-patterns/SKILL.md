---
name: ramdisk-tmpfs-patterns
description: RAM-backed virtual disk patterns for zero-latency sandbox scratch space. Linux tmpfs mounts, Node.js ramdisk creation, size-capped temp volumes, auto-cleanup on process exit, and race-condition-free temp directory isolation. Sources: mafintosh/ramdisk, Linux tmpfs docs.
origin: yana-ai — synthesized from mafintosh/ramdisk (MIT), Linux kernel tmpfs documentation
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /ramdisk-tmpfs-patterns

## When to Use

- Sandbox needs a fast scratch area that auto-destructs when session ends
- Multiple agents writing temporary files simultaneously (avoid disk I/O bottleneck)
- Creating ephemeral workspace for untrusted code execution
- Log staging before flush to persistent append-only store

## Do NOT use for

- Storing data that must survive process restart
- Large data (> available RAM) — falls back to swap, defeating the purpose

---

## Linux tmpfs mount (bash)

```bash
create_ramdisk() {
  local mount_point="$1"
  local size="${2:-64m}"   # default 64MB

  mkdir -p "$mount_point"
  mount -t tmpfs -o "size=${size},mode=1777,nosuid,nodev,noexec" \
    tmpfs "$mount_point"

  echo "[ramdisk] mounted ${size} at ${mount_point}"
  trap "umount -l '$mount_point' && rm -rf '$mount_point'" EXIT
}

# Usage
create_ramdisk /tmp/agent-scratch 128m
# → writes here never touch disk, auto-unmounted on script exit
```

---

## Per-session ramdisk (no root via user namespace + tmpfs)

```bash
# Rootless: bwrap already puts a tmpfs at /tmp — just use it
# Or bind a tmpfs into an existing user namespace:
unshare --mount bash -c "
  mount -t tmpfs -o size=64m,nosuid,nodev tmpfs /tmp/agent-\$\$
  export AGENT_TMP=/tmp/agent-\$\$
  exec '$@'
"
```

---

## Node.js ramdisk (mafintosh/ramdisk pattern)

```javascript
import { execSync } from 'child_process'
import { mkdtempSync, rmdirSync, rmSync, existsSync } from 'fs'
import { tmpdir }   from 'os'
import { join }     from 'path'

/**
 * Creates a tmpfs-backed directory (Linux only).
 * Falls back to OS tmpdir on other platforms.
 */
export function createRamdisk(sizeMb = 64): { path: string; cleanup: () => void } {
  const base   = join(tmpdir(), 'ramdisk-')
  const dir    = mkdtempSync(base)

  if (process.platform === 'linux') {
    execSync(`mount -t tmpfs -o size=${sizeMb}m,nosuid,nodev,mode=700 tmpfs "${dir}"`)
  }

  const cleanup = () => {
    if (process.platform === 'linux') {
      try { execSync(`umount -l "${dir}"`) } catch { /* already unmounted */ }
    }
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* already removed */ }
  }

  process.on('exit',    cleanup)
  process.on('SIGTERM', cleanup)
  process.on('SIGINT',  cleanup)

  return { path: dir, cleanup }
}
```

---

## Race-condition-free temp directory

```bash
# Use mktemp -d for unique per-agent directories
AGENT_TMP="$(mktemp -d /tmp/agent-XXXXXXXX)"
trap 'rm -rf "$AGENT_TMP"' EXIT

# Verify it's on tmpfs (optional — still safe if not)
df -T "$AGENT_TMP" | grep -q tmpfs && echo "[ramdisk] on tmpfs" || echo "[ramdisk] on disk"
```

---

## Size enforcement

```bash
# Periodically check usage and abort if over 80%
check_ramdisk_usage() {
  local mount="$1"
  local used_pct; used_pct=$(df "$mount" | awk 'NR==2{print $5}' | tr -d '%')
  if [[ "$used_pct" -gt 80 ]]; then
    echo "[ramdisk] WARNING: ${used_pct}% used at ${mount}" >&2
    return 1
  fi
}
```

---

## Anti-Fake-Pass Checklist

```
❌ tmpfs without size limit → sandbox fills all available RAM
❌ nosuid/nodev/noexec not set → sandbox can run SUID binaries from tmpfs
❌ No cleanup trap → tmpfs mounts accumulate across sessions
❌ mktemp not used for unique dirs → concurrent agents collide on same path
❌ Ramdisk created as root on multi-user system → other users can read scratch
❌ mode not set → tmpfs world-writable, any process can read agent scratch
❌ swap not disabled → tmpfs data can land on swap → defeats ephemeral goal
```
