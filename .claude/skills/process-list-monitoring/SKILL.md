---
name: process-list-monitoring
description: System process list monitoring and PID management for agent sandboxes. Cross-platform process enumeration, CPU/memory per-process metrics, filtering by name/PID, and detecting unexpected child spawns. Sources: sindresorhus/ps-list.
origin: yamtam-engine — synthesized from sindresorhus/ps-list (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /process-list-monitoring

## When to Use

- Audit which processes an agent spawned during a session
- Detect unexpected child processes (cryptominers, reverse shells)
- Monitor CPU/RAM per process before triggering circuit breakers
- Build zombie-process detectors (see [[zombie-process-cleanup]])

## Do NOT use for

- Real-time kernel-level tracing (use [[ebpf-runtime-tracing]] instead)
- Windows process management (API differs significantly)

---

## Process snapshot

```javascript
import psList from 'ps-list'

// Full snapshot
const procs = await psList()
// [{ pid, name, cmd, ppid, uid, cpu, memory }, ...]

// Filter by parent PID (find all children of current agent)
const agentPid = process.pid
const children = procs.filter(p => p.ppid === agentPid)

// High-CPU processes (> 80%)
const hotProcs = procs.filter(p => (p.cpu ?? 0) > 80)
if (hotProcs.length) {
  console.error('[monitor] high-CPU:', hotProcs.map(p => `${p.name}(${p.pid})`))
}
```

---

## Baseline + diff (detect unexpected spawns)

```javascript
async function detectNewProcesses(
  baselineMs = 0,
  intervalMs = 2000
): Promise<void> {
  const baseline = new Set((await psList()).map(p => p.pid))

  setTimeout(async () => {
    const current = await psList()
    const newProcs = current.filter(p => !baseline.has(p.pid))

    for (const p of newProcs) {
      console.warn(`[monitor] NEW PROCESS: ${p.name} pid=${p.pid} cmd=${p.cmd}`)
    }
  }, intervalMs)
}
```

---

## Bash equivalent (no Node dependency)

```bash
snapshot_pids() {
  ps -eo pid,ppid,comm,pcpu,pmem --no-headers | sort -k4 -rn
}

# Find all descendants of a PID
descendants_of() {
  local parent="$1"
  ps -eo pid,ppid --no-headers | awk -v p="$parent" '$2==p{print $1}' \
    | xargs -I{} bash -c "echo {}; descendants_of {}" 2>/dev/null
}

# Detect zombie processes (state=Z)
ps -eo pid,stat,comm | awk '$2~/^Z/{print "ZOMBIE:", $0}'
```

---

## Anti-Fake-Pass Checklist

```
❌ ps-list called once at startup → misses processes spawned mid-session
❌ No ppid filtering → noisy list includes unrelated system processes
❌ cpu field not available on all platforms (macOS only with all:true option)
❌ No threshold check → monitoring loop itself consumes CPU
❌ Snapshot not taken before agent starts → no baseline for diff
```
