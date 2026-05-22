**Rule:** resource-quota-law
**Status:** REVIEWED
**Gate:** L1 — agent tier enforcement
**Source:** Linux cgroups v2, docker/cli resource flags, kubernetes.io resource quotas, systemd resource control

---

# Resource Quota Law

## Principle

Every agent and every sandboxed tool call MUST have a hard resource ceiling enforced by the OS (cgroups v2 or Docker resource flags). Soft limits are advisory. Hard limits are mandatory. An agent that exhausts its quota MUST be killed, not throttled.

## Per-Agent Quotas

```
Tier R (read-only agents):
  CPU:      0.25 vCPU
  RAM:      64 MB
  Disk I/O: 5 MB/s read, 0 write
  PIDs:     16
  Timeout:  15s per tool call

Tier W (write agents):
  CPU:      0.5 vCPU
  RAM:      128 MB
  Disk I/O: 10 MB/s read, 5 MB/s write
  PIDs:     32
  Timeout:  30s per tool call

Tier X (exec/deploy agents):
  CPU:      1.0 vCPU
  RAM:      256 MB
  Disk I/O: 20 MB/s read, 10 MB/s write
  PIDs:     64
  Timeout:  120s per tool call

Tier P (privileged — human-gated):
  CPU:      2.0 vCPU
  RAM:      512 MB
  Disk I/O: unlimited (audited)
  PIDs:     128
  Timeout:  300s per tool call
  Requires: YAMTAM_IRREVERSIBLE_OK=1 + human approval
```

## Enforcement Mechanisms

```bash
# cgroups v2 (systemd slice — host-level hard limits)
systemd-run --scope \
  --property CPUQuota=50% \
  --property MemoryMax=128M \
  --property IOReadBandwidthMax="/ 10M" \
  --property IOWriteBandwidthMax="/ 5M" \
  --property TasksMax=32 \
  -- bash core/scripts/sandbox-exec.sh "$TOOL" "$@"

# Docker resource flags (container-level)
docker run \
  --cpus=0.5 \
  --memory=128m \
  --memory-swap=128m \
  --pids-limit=32 \
  --blkio-weight=100 \
  ...

# ulimit fallback (process-level, no I/O control)
ulimit -v 131072   # virtual memory: 128MB
ulimit -t 30       # CPU time: 30s
ulimit -n 32       # file descriptors
ulimit -f 65536    # file size: 64MB (512B blocks)
ulimit -u 16       # max user processes
```

## OOM Kill Policy

```
When an agent hits the RAM cap:
  1. OS sends SIGKILL immediately (no SIGTERM grace period for untrusted code)
  2. sandbox-exec.sh exit code: 3
  3. Diagnostic written to releases/logs/sandbox.log with:
     - agent ID, tier, peak RSS before kill
     - last tool call
     - timestamp
  4. Agent is NOT restarted automatically (human review required)
  5. If OOM occurs 3× in one session → agent quarantined until review

When an agent hits the CPU timeout:
  1. SIGKILL at timeout boundary
  2. Exit code: 3
  3. Same diagnostic written
  4. Alert if timeout hit > 2× on same tool pattern
```

## Quota Violation Signals

```
exit 3         → resource limit exceeded (sandbox-exec.sh contract)
exit 137       → SIGKILL from OOM killer (docker / cgroups)
"OOMKilled":   → Docker container status field
/proc/1/oom_score_adj → check before exec (higher = more likely to be killed)
```

## Anti-Pattern Checklist

```
❌ --memory-swap > --memory (enables swap, bypasses RAM cap)
❌ --pids-limit absent (fork bomb exhausts kernel PID table)
❌ Soft limit only (ulimit -S) instead of hard limit (-H) for untrusted code
❌ Agent restarted automatically after OOM (may indicate unbounded loop)
❌ CPUQuota missing on cgroups slice (runaway CPU not detected)
❌ Quota not logged on breach (can't diagnose without metrics)
❌ All agents run at Tier X quota (principle of least privilege violated)
```
