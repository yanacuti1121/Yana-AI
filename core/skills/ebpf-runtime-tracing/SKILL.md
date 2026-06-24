---
name: ebpf-runtime-tracing
description: eBPF-based runtime behavioral monitoring for detecting sandbox escapes and privilege escalation. Tracee event signatures, file access monitoring, network connection alerts, and process execution tracing. Sources: aquasecurity/tracee.
origin: yana-ai — synthesized from aquasecurity/tracee (Aqua Security, Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /ebpf-runtime-tracing

## When to Use

- Monitor agent subprocess behavior at kernel level without code instrumentation
- Detect sandbox escape attempts (chroot break, namespace escape, ptrace)
- Alert on unexpected file writes, network connections, or exec calls
- Post-incident forensics: reconstruct what a process actually did

## Do NOT use for

- Replacing seccomp (eBPF monitoring observes; seccomp blocks)
- Environments where eBPF is unavailable (kernel < 4.18, no CAP_BPF)

---

## Key Tracee event categories for agent monitoring

```yaml
# tracee-policy.yaml — events that indicate sandbox escape or privilege abuse
apiVersion: aquasecurity.github.io/v1beta1
kind: Policy
metadata:
  name: agent-sandbox-monitor
spec:
  scope:
    - global                         # monitor all processes
  defaultActions: [log]
  rules:
    # Process execution
    - event: execve
      filters:
        - args.pathname!=/bin/sh,/bin/bash,/usr/bin/env,/usr/bin/python3
      actions: [alert]

    # Privilege escalation attempts
    - event: ptrace
      actions: [alert]

    - event: setuid
      filters:
        - args.uid=0
      actions: [alert]

    # Filesystem violations
    - event: open
      filters:
        - args.pathname~/etc/shadow,/etc/passwd,/root/.*,/proc/kcore
      actions: [alert]

    # Network connections from sandboxed process
    - event: connect
      actions: [log]

    # Namespace manipulation
    - event: unshare
      actions: [alert]

    - event: setns
      actions: [alert]
```

---

## Running tracee as a sidecar monitor

```bash
#!/usr/bin/env bash
# monitor-agent.sh — start tracee, run agent command, stop tracee
TRACEE_LOG="/tmp/tracee-$(date +%s).json"

# Start tracee in background
tracee --output json --output file:"$TRACEE_LOG" \
  --scope pid=new \
  --events execve,open,connect,ptrace,setuid,unshare,setns &
TRACEE_PID=$!

# Run agent command
"$@"
AGENT_EXIT=$?

# Stop tracee
kill "$TRACEE_PID" 2>/dev/null
wait "$TRACEE_PID" 2>/dev/null

# Parse alerts
ALERTS=$(jq -c 'select(.level=="alert")' "$TRACEE_LOG" 2>/dev/null | wc -l)
if [[ "$ALERTS" -gt 0 ]]; then
  echo "[tracee] WARNING: $ALERTS suspicious events detected" >&2
  jq -c 'select(.level=="alert")' "$TRACEE_LOG" >&2
fi

exit "$AGENT_EXIT"
```

---

## Parsing tracee JSON output

```bash
# Top executed binaries
jq -r 'select(.eventName=="execve") | .args[] | select(.name=="pathname") | .value' \
  /tmp/tracee.json | sort | uniq -c | sort -rn | head -20

# All outbound connections
jq -r 'select(.eventName=="connect") | "\(.processName) → \(.args[] | select(.name=="addr") | .value)"' \
  /tmp/tracee.json

# Privilege escalation attempts
jq -c 'select(.eventName=="setuid" and (.args[] | select(.name=="uid") | .value==0))' \
  /tmp/tracee.json
```

---

## Lightweight bash-only alternative (no eBPF)

```bash
# audit-agent-exec.sh — use auditd if eBPF not available
auditctl -a always,exit -F arch=b64 -S execve -k agent_exec
auditctl -a always,exit -F arch=b64 -S connect -k agent_net
auditctl -a always,exit -F arch=b64 -S ptrace  -k agent_ptrace

"$@"   # run agent command

# Read audit log
ausearch -k agent_exec -ts recent --format csv | head -50
```

---

## Anti-Fake-Pass Checklist

```
❌ Tracee not running before agent starts → misses early exec/open events
❌ scope: not set → monitoring all PIDs floods log, hides agent events
❌ No connect event monitoring → outbound data exfiltration invisible
❌ JSON output not parsed → alerts accumulate but never trigger response
❌ eBPF requires kernel >= 4.18 and CAP_BPF — check before deploy
❌ tracee as root without seccomp → tracee itself is an attack surface
❌ Log file writable by monitored process → agent can tamper with evidence
```
