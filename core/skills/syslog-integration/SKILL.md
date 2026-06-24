---
name: syslog-integration
description: Linux syslog integration for agent audit logging. Write structured events to /dev/log via UDP syslog, severity levels (EMERG→DEBUG), facility codes, RFC5424 format, and forwarding to centralized log aggregators. Sources: bnoordhuis/node-syslog.
origin: yana-ai — synthesized from bnoordhuis/node-syslog (MIT), RFC 3164/5424
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /syslog-integration

## When to Use

- Forward agent audit events to system syslog (journald, rsyslog, syslog-ng)
- Integrate yamtam audit trail with centralized SIEM (Splunk, Datadog)
- Append-only audit log that agent cannot tamper with (syslog is external)
- Pairs with [[append-only-event-log]] for dual-write audit strategy

## Do NOT use for

- High-frequency debug logs (syslog has overhead — use structured file logging)
- Environments without syslog daemon (container scratch images)

---

## Node.js syslog client

```javascript
import syslog from 'node-syslog'

// Initialize once at startup
syslog.init('yamtam-agent', syslog.LOG_PID | syslog.LOG_ODELAY, syslog.LOG_DAEMON)

// Severity levels
// LOG_EMERG=0, LOG_ALERT=1, LOG_CRIT=2, LOG_ERR=3
// LOG_WARNING=4, LOG_NOTICE=5, LOG_INFO=6, LOG_DEBUG=7

export function auditLog(level: 'info' | 'warn' | 'error' | 'crit', msg: string, meta?: object) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), msg, ...meta })
  const sev = {
    info:  syslog.LOG_INFO,
    warn:  syslog.LOG_WARNING,
    error: syslog.LOG_ERR,
    crit:  syslog.LOG_CRIT,
  }[level]

  syslog.log(sev, entry)
}

// Cleanup on exit
process.on('exit', () => syslog.close())
```

---

## RFC5424 format over UDP (no native binding)

```javascript
import dgram from 'dgram'

const SYSLOG_HOST = process.env.SYSLOG_HOST ?? '127.0.0.1'
const SYSLOG_PORT = parseInt(process.env.SYSLOG_PORT ?? '514')
const FACILITY    = 1   // USER
const SEVERITY    = 6   // INFO

function sendSyslog(msg: string): void {
  const pri     = (FACILITY * 8) + SEVERITY
  const ts      = new Date().toISOString()
  const host    = 'yamtam'
  const app     = 'agent'
  const msgid   = '-'
  const structured = '-'
  const packet  = `<${pri}>1 ${ts} ${host} ${app} ${process.pid} ${msgid} ${structured} ${msg}`

  const client  = dgram.createSocket('udp4')
  const buf     = Buffer.from(packet)
  client.send(buf, 0, buf.length, SYSLOG_PORT, SYSLOG_HOST, () => client.close())
}
```

---

## Bash syslog via logger(1)

```bash
# logger is available on all Linux systems
agent_log() {
  local level="$1"; local msg="$2"
  logger -t "yamtam-agent" -p "daemon.${level}" -- "$msg"
}

agent_log info  "session started: $YAMTAM_SESSION_ID"
agent_log warn  "rate limit triggered"
agent_log err   "sandbox exec failed: exit $?"
```

---

## Anti-Fake-Pass Checklist

```
❌ syslog.init() not called → all log() calls silently dropped
❌ syslog.close() missing on exit → socket fd leak
❌ Unstructured string → syslog message not parseable by SIEM
❌ LOG_DEBUG in production → syslog flooded with noise, rate-limited
❌ UDP syslog → fire-and-forget, no delivery guarantee (use TCP/TLS for critical)
❌ PII in syslog message → syslog stored on shared system, visible to admins
```
