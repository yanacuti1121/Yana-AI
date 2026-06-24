---
name: filesystem-isolation-chroot
description: Filesystem isolation via chroot and pivot_root. Building minimal rootfs, chroot jail setup, pivot_root for OCI containers, preventing chroot escapes, and read-only bind-mount overlays. Sources: zetamatta/go-chroot, opencontainers/runc.
origin: yana-ai — synthesized from zetamatta/go-chroot, opencontainers/runc
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /filesystem-isolation-chroot

## When to Use

- Prevent Agent from seeing or modifying files outside `/workspaces`
- Building a minimal rootfs for a sandboxed subprocess
- Understanding pivot_root vs chroot security differences
- Constructing read-only overlay mounts over a workspace

## Do NOT use for

- Replacing full namespace isolation (chroot alone is not a security boundary)
- Production container runtimes (use runc / bubblewrap)

---

## Minimal rootfs for chroot

```bash
#!/usr/bin/env bash
# build-rootfs.sh — minimal sandbox rootfs (~5MB)
ROOTFS="${1:-/tmp/sandbox-rootfs}"
mkdir -p "$ROOTFS"/{bin,lib,lib64,lib/x86_64-linux-gnu,proc,sys,dev,tmp,etc}

# Copy busybox as /bin/sh
cp "$(which busybox)" "$ROOTFS/bin/sh"

# Copy required libs for a target binary (e.g. bash)
copy_libs() {
  local bin="$1"
  ldd "$bin" 2>/dev/null | awk '{print $3}' | grep '^/' | while read -r lib; do
    local dest="$ROOTFS${lib}"
    mkdir -p "$(dirname "$dest")"
    cp -n "$lib" "$dest" 2>/dev/null || true
  done
}

copy_libs /bin/bash && cp /bin/bash "$ROOTFS/bin/bash"

# Minimal /etc/passwd so tools don't error
echo "nobody:x:65534:65534:nobody:/:/bin/sh" > "$ROOTFS/etc/passwd"
echo "nobody:x:65534:"                        > "$ROOTFS/etc/group"

echo "[rootfs] built at $ROOTFS"
```

---

## Chroot jail execution

```bash
# Enter chroot as unprivileged user (requires root or user namespace)
enter_chroot() {
  local rootfs="$1"; shift
  local cmd=("$@")

  # Mount pseudo-filesystems inside jail
  mount -t proc  proc  "$rootfs/proc"
  mount -t sysfs sysfs "$rootfs/sys"
  mount -t tmpfs tmpfs "$rootfs/tmp"

  # Chroot and drop to nobody
  chroot "$rootfs" /bin/sh -c "
    exec su -s /bin/sh nobody -c '${cmd[*]}'
  "

  # Cleanup
  umount "$rootfs/proc" "$rootfs/sys" "$rootfs/tmp" 2>/dev/null || true
}

enter_chroot /tmp/sandbox-rootfs "ls -la /workspaces 2>&1 || echo 'no /workspaces — isolated'"
```

---

## pivot_root (stronger than chroot)

```bash
# pivot_root requires a new mount namespace first
# Old root goes to /old-root, new root becomes /
do_pivot_root() {
  local new_root="$1"

  # Bind-mount new root over itself (required for pivot_root)
  mount --bind "$new_root" "$new_root"
  mkdir -p "$new_root/old-root"

  cd "$new_root"
  pivot_root . old-root

  # Unmount old root
  umount -l /old-root
  rmdir /old-root 2>/dev/null || true
}

# Usage inside a new mount namespace:
# unshare --mount bash -c 'do_pivot_root /tmp/sandbox-rootfs; exec /bin/sh'
```

---

## Read-only overlay with overlayfs

```bash
# Source code available read-only inside sandbox
setup_overlay_workspace() {
  local src="$1"   # real workspace (read-only lower)
  local work="/tmp/ovl-work"; local upper="/tmp/ovl-upper"; local merged="/tmp/sandbox-ws"
  mkdir -p "$work" "$upper" "$merged"

  mount -t overlay overlay \
    -o "lowerdir=$src,upperdir=$upper,workdir=$work" \
    "$merged"

  echo "[overlay] workspace mounted at $merged (writes go to $upper)"
}
```

---

## Chroot escape patterns to block

```bash
# Rule: always pair chroot with one of:
#   1. Dropping CAP_SYS_CHROOT (prevents re-chroot to escape)
#   2. Using pivot_root (cannot escape via open-fds trick)
#   3. Full namespace isolation (separate mount namespace)

# Classic chroot escape (requires open fd to old root or CAP_SYS_CHROOT):
# chdir("..") repeatedly past the jail — BLOCKED by mount namespace
# open("/") before chroot, fchdir after — BLOCKED by dropping CAP_SYS_CHROOT
```

---

## Anti-Fake-Pass Checklist

```
❌ chroot without dropping CAP_SYS_CHROOT → classic chroot escape possible
❌ No mount namespace → host /proc visible inside jail via bind mounts
❌ /proc mounted but not masked → information leak of host kernel state
❌ rootfs writable by sandboxed user → can replace binaries, escape
❌ pivot_root without --bind mount of new_root → EINVAL at runtime
❌ Overlay upper dir not on same filesystem type as workdir → EXDEV error
❌ tmpfs /tmp without size limit → sandbox can fill host disk
```
