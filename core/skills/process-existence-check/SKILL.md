---
name: process-existence-check
description: Nanosecond-speed process existence check by PID. sindresorhus/process-exists patterns, cross-platform PID validation, zombie detection, and watchdog loop for monitoring long-running agent sandboxes. Sources: sindresorhus/process-exists.
origin: yana-ai — synthesized from sindresorhus/process-exists (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /process-existence-check

## When to Use

- Watchdog: poll whether a sandbox subprocess is still alive
- Validate PID before sending signals (SIGTERM/SIGKILL)
- Race-condition-safe check: is PID still running before cleanup?
- Detecting zombie processes (exists = true but state = Z)

## Do NOT use for

- Reliable process tracking over time (use [[process-list-monitoring]])
- Cross-PID-namespace checks (must be in same namespace)

---

## Basic check

```javascript
import processExists from 'process-exists'

// Single PID
const alive = await processExists(1234)

// Multiple PIDs
const results = await processExists.all([1234, 5678, 9012])
// → Map { 1234 => true, 5678 => false, 9012 => true }
```

---

## Watchdog for sandbox process

```javascript
async function watchdogLoop(pid: number, intervalMs = 1000, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const alive = await processExists(pid)
    if (!alive) {
      console.log(`[watchdog] process ${pid} exited`)
      return
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }

  // Timeout: kill sandbox
  console.warn(`[watchdog] timeout — killing sandbox PID ${pid}`)
  process.kill(pid, 'SIGKILL')
}
```

---

## Safe signal send (check before kill)

```bash
# Bash: check PID exists before sending signal
safe_kill() {
  local pid="$1"
  local sig="${2:-SIGTERM}"
  if kill -0 "$pid" 2>/dev/null; then
    kill -s "$sig" "$pid"
    echo "[kill] sent $sig to PID $pid"
  else
    echo "[kill] PID $pid not found — skipping"
  fi
}
```

---

## Detect zombie (exists but defunct)

```bash
is_zombie() {
  local pid="$1"
  local state
  state=$(awk '/State:/{print $2}' "/proc/$pid/status" 2>/dev/null)
  [[ "$state" == "Z" ]]
}

if processExists $PID && is_zombie $PID; then
  echo "[watch] PID $PID is a zombie — waiting for parent to reap"
fi
```

---

## Anti-Fake-Pass Checklist

```
❌ kill -0 on Linux doesn't check zombie state — process "exists" as zombie
❌ PID reuse: after check, PID may be reused by new process — not atomic
❌ processExists inside container may not see host PIDs (different PID namespace)
❌ EPERM on kill -0 → process exists but you don't have permission (still exists)
❌ Polling interval too short → CPU overhead from frequent /proc reads
```
