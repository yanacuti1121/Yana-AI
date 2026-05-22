**Rule:** 04-sandbox-isolation-law
**Status:** REVIEWED
**Gate:** L3 — wraps tool-proxy.sh execution
**Source:** moby/moby (Docker isolation), google/nsjail (Linux namespaces), firecracker-microvm/firecracker (micro-VM), CIS Docker Benchmark, NIST SP 800-190

---

# Sandbox Isolation Law

## Principle

Every command that exits the YAMTAM process boundary MUST execute inside an isolated sandbox. The sandbox enforces hard resource limits and prevents a compromised tool call from reaching the host filesystem, network, or other processes.

```
Agent intent
    │
    ▼
[tool-proxy.sh]       ← sanitize + mutate (L2/L1)
    │
    ▼
[sandbox-exec.sh]     ← THIS LAW — runtime isolation boundary
    │
    ├── Docker (preferred)   — container + read-only FS + --network=none
    ├── nsjail               — Linux namespace jail (no daemon required)
    └── ulimit (fallback)    — resource limits only (dev/CI environments)
    │
    ▼
[isolated execution]
    │
    ▼
[result → tool-proxy post-middleware]
```

## Mandatory Sandbox Properties

```
□ Network:    --network=none (no outbound or inbound connections from sandbox)
□ Filesystem: read-only root; /tmp tmpfs (memory-only, max 64MB, noexec)
□ User:       non-root (nobody, uid ≥ 1000) — never run as uid 0
□ Capabilities: --cap-drop ALL — no Linux capabilities granted
□ no-new-privileges: set — prevents setuid/setgid escalation
□ PIDs: --pids-limit 64 — prevents fork bomb
□ Ephemeral: --rm — container deleted immediately on exit
□ Timeout: 30s hard limit — SIGKILL after timeout
```

## Resource Limits (per sandbox instance)

```
CPU:      0.5 vCPU   (Docker --cpus=0.5 / ulimit -t 30)
RAM:      128 MB     (Docker --memory=128m / ulimit -v 131072)
Disk:     64 MB tmpfs (no host disk writes)
FDs:      32 open files max (ulimit -n 32)
PIDs:     64 max (--pids-limit 64)
Runtime:  30 seconds (SIGKILL at timeout → exit 3)
Output:   16 KB cap  (piped through tool-proxy size-cap middleware)
```

## Bypass Rules (Tier A — never allowed)

```
- YAMTAM_SKIP_SANDBOX=1 is BLOCKED (exit 1, logged to audit trail)
- Sandbox mode cannot be lowered by a sub-agent
- ulimit-only mode permitted ONLY in CI environments (YAMTAM_ENV=ci)
- Any tool call that exits to shell without going through sandbox-exec.sh
  is flagged as a Gate L3 violation
```

## Sandbox Mode Selection

```
Production (YAMTAM_ENV=prod):
  Required: docker or firecracker
  Forbidden: ulimit-only mode

CI/CD (YAMTAM_ENV=ci):
  Allowed: docker, nsjail, ulimit
  Recommended: docker for reproducibility

Development (YAMTAM_ENV=dev):
  Allowed: all modes
  Warning logged when using ulimit fallback
```

## Exit Code Contract

```
0  — executed successfully within limits
1  — sandbox setup failure (misconfiguration)
2  — command failed inside sandbox (propagated exit code)
3  — resource limit exceeded (OOM, timeout, disk cap)
4  — requested sandbox mode not available on host
```

## Anti-Pattern Checklist

```
❌ Tool call runs directly via exec without passing through sandbox-exec.sh
❌ Container runs as root user (UID 0)
❌ --network=none omitted (agent can make outbound calls from sandbox)
❌ Read-write bind-mount of host filesystem into sandbox
❌ --pids-limit absent (fork bomb exhausts system PIDs)
❌ No timeout set (infinite-loop agent hangs the host forever)
❌ Sandbox reused across tool calls (state leaks between executions)
❌ MMDS/metadata endpoint accessible from micro-VM (SSRF via VM)
```
