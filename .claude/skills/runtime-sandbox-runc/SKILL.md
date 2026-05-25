---
name: runtime-sandbox-runc
description: Low-level OCI container runtime patterns using Linux namespaces and cgroups. Namespace isolation (pid/net/mnt/uts/ipc), cgroup resource caps, rootless execution, OCI bundle structure, and runc lifecycle (create/start/kill/delete). Sources: opencontainers/runc.
origin: yamtam-engine — synthesized from opencontainers/runc (Linux Foundation OCI standard)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /runtime-sandbox-runc

## When to Use

- Agent needs hard process isolation (separate PID/net/mount namespaces)
- Enforcing CPU/memory caps on untrusted subprocesses
- Building OCI-compatible container runtimes or wrappers
- Auditing how containers escape kernel-level boundaries

## Do NOT use for

- Simple shell isolation (use bubblewrap or sandbox-exec.sh instead)
- Language-level sandboxing (JS `vm`, Python `restricted exec`)

---

## OCI Bundle Structure

```
/tmp/oci-bundle/
├── config.json        # runtime spec
└── rootfs/            # pivoted root filesystem
    ├── bin/
    ├── lib/
    └── ...
```

```bash
# Minimal config.json for a rootless sandbox
cat > /tmp/oci-bundle/config.json <<'EOF'
{
  "ociVersion": "1.0.2",
  "process": {
    "terminal": false,
    "user": { "uid": 1000, "gid": 1000 },
    "args": ["/bin/sh", "-c", "echo sandbox-ok"],
    "env": ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
    "cwd": "/",
    "capabilities": {
      "bounding":  [],
      "effective": [],
      "permitted": []
    },
    "noNewPrivileges": true
  },
  "root": { "path": "rootfs", "readonly": true },
  "hostname": "sandbox",
  "mounts": [
    { "destination": "/proc", "type": "proc",    "source": "proc" },
    { "destination": "/tmp",  "type": "tmpfs",   "source": "tmpfs",
      "options": ["nosuid","nodev","size=64m"] }
  ],
  "linux": {
    "namespaces": [
      { "type": "pid"     },
      { "type": "network" },
      { "type": "mount"   },
      { "type": "uts"     },
      { "type": "ipc"     },
      { "type": "user",
        "uidMappings": [{"containerID":1000,"hostID":100000,"size":65536}],
        "gidMappings": [{"containerID":1000,"hostID":100000,"size":65536}]
      }
    ],
    "resources": {
      "memory": { "limit": 134217728 },
      "cpu":    { "shares": 512, "quota": 50000, "period": 100000 }
    },
    "maskedPaths": ["/proc/kcore","/proc/keys","/proc/latency_stats"],
    "readonlyPaths": ["/proc/asound","/proc/bus","/proc/fs","/proc/irq","/proc/sys","/proc/sysrq-trigger"]
  }
}
EOF
```

---

## runc Lifecycle

```bash
# Create + start (two-phase allows pre-start hooks)
runc create --bundle /tmp/oci-bundle sandbox-1
runc start sandbox-1

# One-shot run
runc run --bundle /tmp/oci-bundle sandbox-$(date +%s)

# Inspect state
runc state sandbox-1   # → {"status":"running","pid":1234,...}
runc list              # all containers

# Cleanup
runc kill sandbox-1 SIGTERM
runc delete sandbox-1
```

---

## cgroup v2 Resource Caps (without runc)

```bash
# Create cgroup
mkdir /sys/fs/cgroup/agent-sandbox
echo "100M"  > /sys/fs/cgroup/agent-sandbox/memory.max
echo "50000 100000" > /sys/fs/cgroup/agent-sandbox/cpu.max  # 50% of 1 core

# Run process in cgroup
echo $$ > /sys/fs/cgroup/agent-sandbox/cgroup.procs
exec "$@"   # replace shell with target process
```

---

## Namespace Isolation (manual, no runc)

```bash
# Unshare pid + mount + network in a subshell
unshare --pid --fork --mount --net --uts \
  --map-root-user \
  /bin/sh -c '
    mount -t proc proc /proc
    hostname sandbox
    exec "$@"
  ' -- "$TARGET_CMD"
```

---

## Anti-Fake-Pass Checklist

```
❌ noNewPrivileges not set → SUID binaries can escalate inside container
❌ capabilities.bounding not empty → drop all caps for untrusted workloads
❌ /proc not masked → /proc/kcore leaks host memory addresses
❌ tmpfs without size limit → guest can exhaust host RAM
❌ UID mapping missing → rootless container runs as real root on host
❌ cgroup limits not set → no CPU/memory enforcement
❌ Network namespace missing → container can reach host services
❌ readonly rootfs not set → container can modify base image files
```
