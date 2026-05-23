---
name: uid-gid-privilege-drop
description: UID/GID privilege dropping for safe agent subprocess execution. setuid/setgid before exec, running commands as nobody/unprivileged user, Node.js uid/gid options on spawn, and preventing privilege re-escalation. Sources: stephenmathieson/node-uid, Linux credentials(7).
origin: yamtam-engine — synthesized from stephenmathieson/node-uid (MIT), Linux setuid(2) man page
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /uid-gid-privilege-drop

## When to Use

- Running untrusted agent commands as `nobody` (uid 65534) instead of current user
- Subprocess must not inherit root's filesystem permissions
- Pair with [[capability-dropping-linux]] for defense in depth
- Codespaces: drop to dedicated agent UID before running sandbox workloads

## Do NOT use for

- Replacing capability dropping (UID change alone doesn't drop capabilities)
- Multi-user auth (use proper session management)

---

## Node.js spawn with UID/GID drop

```javascript
import { spawn } from 'child_process'

const NOBODY_UID = 65534
const NOBODY_GID = 65534

function spawnAsNobody(cmd: string, args: string[], cwd: string) {
  return spawn(cmd, args, {
    cwd,
    uid: NOBODY_UID,
    gid: NOBODY_GID,
    stdio: 'pipe',
    env: {
      PATH:    '/usr/local/bin:/usr/bin:/bin',
      HOME:    '/tmp',
      TMPDIR:  '/tmp',
      // Explicitly exclude sensitive env vars
    },
  })
}
```

---

## Bash privilege drop

```bash
drop_to_nobody() {
  local cmd=("$@")

  # Verify we're root (required to setuid)
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "[uid] Not root — cannot drop to nobody" >&2
    return 1
  fi

  # Drop supplemental groups, then gid, then uid (order matters)
  exec su -s /bin/sh -c "${cmd[*]}" nobody
}

# Or with capsh for finer control:
capsh --user=nobody --inh='' --addamb='' -- -c "${cmd[*]}"
```

---

## Verify effective UID in subprocess

```bash
verify_uid_drop() {
  local expected_uid="${1:-65534}"
  local actual_uid; actual_uid="$(id -u)"
  if [[ "$actual_uid" -ne "$expected_uid" ]]; then
    echo "[uid] FAIL: running as UID $actual_uid, expected $expected_uid" >&2
    exit 1
  fi
  echo "[uid] OK: running as UID $actual_uid"
}
```

---

## Runuser / su patterns

```bash
# runuser (systemd): drop to specific user, retain PAM session
runuser -u agent-sandbox -- /bin/bash agent-script.sh

# sudo nopasswd for specific commands only
# /etc/sudoers.d/agent:
# yamtam-runner ALL=(nobody) NOPASSWD: /usr/local/bin/agent-runner
```

---

## Anti-Fake-Pass Checklist

```
❌ uid set but gid not set → process still in root group, can read group-root files
```

```
❌ Supplemental groups not cleared → inherited group memberships bypass drop
❌ setuid without noNewPrivileges → SUID binaries restore root via exec
❌ HOME not set to /tmp → process reads/writes to root's home directory
❌ PATH includes /root/bin → privilege escalation via PATH hijack
❌ spawn uid option requires Node.js to be running as root first
❌ /etc/passwd entry for nobody must exist — missing entry causes auth failure
```
