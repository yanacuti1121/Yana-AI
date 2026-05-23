---
name: readonly-bind-mount-patterns
description: Read-only bind mount patterns for safe source code analysis. Mount workspace as ro inside containers, overlayfs for copy-on-write analysis, Docker ro bind mounts, detecting unauthorized writes before they reach source. Sources: docker/cli, OCI spec, overlayfs docs.
origin: yamtam-engine — synthesized from docker/cli (Apache-2.0), Linux overlayfs documentation
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /readonly-bind-mount-patterns

## When to Use

- Agent must read source code but must NOT be able to modify it directly
- Staging writes through an overlay (CoW) before committing to real workspace
- Docker volume mounts in agent containers: `--mount type=bind,readonly`
- Gate L5: path-traversal prevention via filesystem-level enforcement

## Do NOT use for

- Environments where overlayfs is unavailable (some Docker-in-Docker setups)
- Replacing content-based validation (read-only mount + content scan = belt + suspenders)

---

## Linux read-only bind mount

```bash
readonly_bind() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"

  # Bind mount then remount read-only (two-step — single --bind,ro is unreliable)
  mount --bind        "$src"  "$dest"
  mount --remount,ro  "$dest"

  echo "[ro-bind] $src → $dest (read-only)"
  trap "umount -l '$dest'" EXIT
}

readonly_bind /workspaces/yamtam-engine /sandbox/workspace
```

---

## Overlayfs CoW sandbox

```bash
setup_cow_workspace() {
  local real_ws="$1"
  local upper="/tmp/overlay-upper"
  local work="/tmp/overlay-work"
  local merged="/tmp/sandbox-merged"

  mkdir -p "$upper" "$work" "$merged"

  mount -t overlay overlay \
    -o "lowerdir=${real_ws},upperdir=${upper},workdir=${work}" \
    "$merged"

  echo "[overlay] CoW workspace at $merged"
  echo "[overlay] real writes captured in $upper"

  # After agent runs, diff what changed
  find "$upper" -type f | while read -r f; do
    rel="${f#$upper/}"
    echo "[overlay] WRITTEN: $rel"
  done
}

trap 'umount /tmp/sandbox-merged 2>/dev/null || true' EXIT
setup_cow_workspace /workspaces/yamtam-engine
```

---

## Docker read-only bind mount

```bash
# Run agent container with workspace as read-only bind
docker run --rm \
  --mount "type=bind,source=/workspaces,target=/workspace,readonly" \
  --mount "type=tmpfs,target=/tmp,tmpfs-size=128m" \
  --read-only \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  yamtam-agent:latest \
  /bin/sh -c "cd /workspace && analyze-code.sh"
```

---

## Verify mount is truly read-only

```bash
verify_readonly() {
  local mount_point="$1"
  if touch "${mount_point}/.ro-test-$$" 2>/dev/null; then
    rm -f "${mount_point}/.ro-test-$$"
    echo "[verify] FAIL: $mount_point is writable" >&2
    return 1
  else
    echo "[verify] OK: $mount_point is read-only"
  fi
}
```

---

## Write audit: detect attempts to write through ro mount

```bash
# Intercept write attempts in audit log
auditctl -w /workspaces -p w -k workspace_write

# Monitor
ausearch -k workspace_write -ts recent --format csv | \
  awk -F',' '{print $5, $6, $7}' | sort -u
```

---

## OCI config.json bind mount (read-only)

```json
"mounts": [
  {
    "destination": "/workspace",
    "type":        "bind",
    "source":      "/workspaces/yamtam-engine",
    "options":     ["rbind","ro","nosuid","nodev"]
  },
  {
    "destination": "/tmp",
    "type":        "tmpfs",
    "source":      "tmpfs",
    "options":     ["nosuid","nodev","size=128m"]
  }
]
```

---

## Anti-Fake-Pass Checklist

```
❌ Single --bind,ro flag without remount → mount actually writable on some kernels
❌ Overlayfs upper dir inside ro-bound lower → writes fail with EROFS silently
❌ workdir and upperdir on different filesystems → overlayfs EXDEV at mount time
❌ No audit of upper dir after agent run → cannot confirm agent wrote nothing
❌ /tmp not isolated → agent writes temp files that reference real workspace paths
❌ rbind not used → submounts of /workspaces (nested git repos) remain writable
❌ nosuid not set on bind mount → SUID binaries in workspace can escalate
```
