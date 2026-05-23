---
name: raw-socket-diagnostics
description: Raw IP packet analysis for agent network diagnostics. ICMP ping, TCP port probing, packet crafting, and network path tracing using raw sockets — for Sandbox network isolation validation. Sources: indutny/raw-socket.
origin: yamtam-engine — synthesized from indutny/raw-socket (MIT), RFC 792 ICMP
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /raw-socket-diagnostics

## When to Use

- Verify sandbox network isolation: confirm agent CANNOT reach internal IPs
- ICMP ping without spawning subprocess (`ping` command)
- TCP SYN probe to check port reachability for egress auditing
- Validate that network namespace isolation is working correctly

## Do NOT use for

- Production agent traffic (use standard HTTP clients)
- Environments without CAP_NET_RAW (most container environments)

---

## ICMP ping (verify isolation)

```javascript
import raw from 'raw-socket'

function icmpPing(host: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    // Protocol 1 = ICMP
    const socket = raw.createSocket({ protocol: raw.Protocol.ICMP })

    const timer = setTimeout(() => {
      socket.close()
      resolve(false)  // timeout = not reachable
    }, timeoutMs)

    socket.on('message', () => {
      clearTimeout(timer)
      socket.close()
      resolve(true)   // received ICMP reply = reachable
    })

    socket.on('error', () => {
      clearTimeout(timer)
      socket.close()
      resolve(false)
    })

    // Send ICMP echo request
    const buf = Buffer.alloc(8)
    buf.writeUInt8(8, 0)   // type = echo request
    buf.writeUInt8(0, 1)   // code = 0
    buf.writeUInt16BE(1234, 4)  // identifier
    buf.writeUInt16BE(1, 6)     // sequence

    socket.send(buf, 0, buf.length, host, () => {})
  })
}
```

---

## Sandbox isolation test

```bash
#!/usr/bin/env bash
# validate-sandbox-isolation.sh — verify network isolation from inside sandbox
set -euo pipefail

ISOLATED=true

# These should all FAIL if sandbox network isolation is working
for target in "169.254.169.254" "10.0.0.1" "192.168.1.1" "172.17.0.1"; do
  if ping -c1 -W1 "$target" &>/dev/null; then
    echo "[FAIL] Can reach $target — isolation broken!" >&2
    ISOLATED=false
  else
    echo "[OK]   Cannot reach $target"
  fi
done

$ISOLATED && echo "[PASS] Network isolation verified"
```

---

## TCP port probe

```javascript
import net from 'net'

function tcpProbe(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()

    socket.setTimeout(timeoutMs)
    socket.connect(port, host, () => { socket.destroy(); resolve(true) })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
  })
}

// Verify agent cannot reach internal Kubernetes API
const k8sReachable = await tcpProbe('10.96.0.1', 443, 1000)
if (k8sReachable) throw new Error('[security] sandbox can reach k8s API — isolation broken!')
```

---

## Anti-Fake-Pass Checklist

```
❌ CAP_NET_RAW required — raw sockets fail silently in containers without this cap
❌ ICMP blocked by firewall → false negative (host exists but no ICMP reply)
❌ DNS resolution before raw socket → DNS may succeed even when ICMP is blocked
❌ raw-socket platform support: Linux/macOS only, not Windows
❌ No timeout → raw socket hangs if host is in black-hole state
❌ Testing isolation from OUTSIDE sandbox → must run the check INSIDE the sandbox
```
