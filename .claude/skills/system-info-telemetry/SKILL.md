---
name: system-info-telemetry
description: Hardware and OS telemetry collection for agent resource monitoring. CPU temperature, memory usage, disk I/O, network interfaces, battery, and process-level resource extraction. Sources: sebhildebrandt/systeminformation.
origin: yamtam-engine — synthesized from sebhildebrandt/systeminformation (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /system-info-telemetry

## When to Use

- Monitor Codespaces resource usage before launching sandbox workloads
- Detect resource contention (CPU steal, memory pressure) and trigger circuit breaker
- Build health-check endpoint reporting real hardware metrics
- Pair with [[statsd-metrics-streaming]] to push metrics to Datadog

## Do NOT use for

- Container resource limits (query cgroup v2 files directly for accuracy inside containers)
- Real-time per-process profiling (use [[process-list-monitoring]])

---

## Core metrics snapshot

```javascript
import si from 'systeminformation'

async function resourceSnapshot() {
  const [cpu, mem, disk, net] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsStats(),
    si.networkStats(),
  ])

  return {
    cpu: {
      loadPercent:  parseFloat(cpu.currentLoad.toFixed(1)),
      coresLoaded:  cpu.cpus.filter(c => c.load > 80).length,
    },
    memory: {
      totalGb:  (mem.total    / 1024**3).toFixed(2),
      usedGb:   (mem.used     / 1024**3).toFixed(2),
      freeGb:   (mem.free     / 1024**3).toFixed(2),
      swapUsed: (mem.swapused / 1024**3).toFixed(2),
    },
    disk: {
      readMbps:  (disk.rx_sec / 1024**2).toFixed(1),
      writeMbps: (disk.wx_sec / 1024**2).toFixed(1),
    },
    net: net[0] ? {
      rxMbps: (net[0].rx_sec / 1024**2).toFixed(1),
      txMbps: (net[0].tx_sec / 1024**2).toFixed(1),
    } : null,
  }
}
```

---

## Pre-flight check before heavy workloads

```javascript
async function preflightCheck(): Promise<{ ok: boolean; reason?: string }> {
  const mem  = await si.mem()
  const load = await si.currentLoad()

  const freeMemMb = mem.available / 1024**2
  if (freeMemMb < 256) {
    return { ok: false, reason: `low memory: ${freeMemMb.toFixed(0)}MB free` }
  }

  if (load.currentLoad > 90) {
    return { ok: false, reason: `high CPU: ${load.currentLoad.toFixed(0)}%` }
  }

  return { ok: true }
}
```

---

## Periodic metrics push to StatsD

```javascript
import StatsD from 'node-statsd'
const stats = new StatsD({ prefix: 'yamtam.host.' })

async function startMetricsLoop(intervalMs = 15_000): Promise<void> {
  setInterval(async () => {
    const snap = await resourceSnapshot()
    stats.gauge('cpu.load_pct',     snap.cpu.loadPercent)
    stats.gauge('memory.used_gb',   parseFloat(snap.memory.usedGb))
    stats.gauge('memory.free_gb',   parseFloat(snap.memory.freeGb))
  }, intervalMs)
}
```

---

## Anti-Fake-Pass Checklist

```
❌ si.cpu() vs si.currentLoad() — cpu() is static info; currentLoad() is live
❌ mem.available != mem.free — available includes reclaimable cache (use available)
❌ fsStats() averages since boot — call twice with interval for delta
❌ Inside Docker: host CPU/memory, not container limits (query /sys/fs/cgroup)
❌ Calling si.* in tight loop — each call spawns child process, blocks event loop
❌ No platform check — some metrics (battery, temperature) crash on server VMs
```
