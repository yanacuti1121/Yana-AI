---
name: zombie-process-cleanup
description: Detecting and reaping zombie/orphan processes in agent sandboxes. SIGCHLD handling, waitpid reaping, subreaper patterns, and Node.js child_process cleanup. Sources: node-modules/zombie, Linux waitpid(2) man page.
origin: yamtam-engine — synthesized from node-modules/zombie (MIT), Linux process lifecycle docs
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /zombie-process-cleanup

## When to Use

- Agent spawns many short-lived subprocesses that become zombies
- Sandbox PID namespace filling up with defunct processes
- Long-running agent sessions accumulating dead children
- Implementing a sub-reaper for an isolated PID namespace

## Do NOT use for

- Processes still running (zombies are already dead, just not reaped)
- Kernel threads (not reapable from userspace)

---

## Node.js child_process cleanup

```javascript
import { spawn } from 'child_process'

// Always attach handlers — unhandled children become zombies
function spawnSafe(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      detached: false,    // stay in process group
      stdio: 'pipe',
    })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      // close fires after all stdio closed + process exited → fully reaped
      resolve(code ?? (signal ? 128 : 0))
    })

    // Kill child if parent exits unexpectedly
    process.on('exit', () => { try { child.kill('SIGTERM') } catch {} })
  })
}
```

---

## Bash sub-reaper (PID namespace)

```bash
#!/usr/bin/env bash
# reaper.sh — act as init inside a PID namespace
# Linux: set subreaper flag via prctl PR_SET_CHILD_SUBREAPER

# Trap SIGCHLD and reap all terminated children
reap_children() {
  while true; do
    # waitpid -1 = any child; WNOHANG = don't block
    wait -n 2>/dev/null || break
  done
}
trap reap_children SIGCHLD

# Run the actual payload
"$@" &
MAIN_PID=$!

# Wait for main process
wait "$MAIN_PID"
MAIN_EXIT=$?

# Final reap pass
reap_children

exit "$MAIN_EXIT"
```

---

## Detect zombies

```bash
# List all zombie processes in current namespace
detect_zombies() {
  local zombies
  zombies=$(ps -eo pid,ppid,stat,comm | awk '$3~/^Z/{print}')
  if [[ -n "$zombies" ]]; then
    echo "[zombie] Detected defunct processes:" >&2
    echo "$zombies" >&2
    return 1
  fi
  return 0
}

# Reap zombies owned by current process tree
reap_my_children() {
  while IFS= read -r pid; do
    wait "$pid" 2>/dev/null && echo "[reap] reaped PID $pid"
  done < <(ps -eo pid,ppid,stat | awk -v me="$$" '$2==me && $3~/^Z/{print $1}')
}
```

---

## Anti-Fake-Pass Checklist

```
❌ spawn() with detached:true but no unref() → child still prevents parent exit
❌ No close handler → process reaped by OS eventually but leak accumulates
❌ exec() without fork → replaces parent, no child to reap
❌ Zombie reaping requires the parent (not grandparent) to call wait()
❌ PID namespace without subreaper → orphans reparent to PID 1 (container init)
❌ SIGCHLD ignored (SIG_IGN) on Linux auto-reaps but breaks wait() return codes
```
