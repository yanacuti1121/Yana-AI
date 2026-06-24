---
name: bunyan-syslog-bridge
description: Bridge Bunyan structured JSON logs to syslog and centralized log aggregators. bunyan-syslog stream, log level mapping, RFC5424 structured data, and dual-write (file + syslog) audit patterns. Sources: trentm/node-bunyan-syslog.
origin: yana-ai — synthesized from trentm/node-bunyan-syslog (MIT), bunyan (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /bunyan-syslog-bridge

## When to Use

- Forward yamtam structured JSON audit logs to centralized syslog/SIEM
- Dual-write: local JSON file + syslog for redundant audit trail
- Map bunyan log levels (10-60) to syslog severity (0-7)
- Integrate with journald/rsyslog on Linux Codespaces hosts

## Do NOT use for

- High-frequency debug logs (syslog has rate limits and overhead)
- Browser-based logging (bunyan is Node.js only)

---

## Bunyan logger with syslog stream

```javascript
import bunyan      from 'bunyan'
import bsyslog     from 'bunyan-syslog'

const log = bunyan.createLogger({
  name:     'yamtam-agent',
  hostname: 'codespaces',
  streams: [
    // Stream 1: structured JSON file (append-only audit)
    {
      level: 'info',
      path:  'releases/logs/agent-audit.json',
    },
    // Stream 2: syslog for SIEM integration
    {
      level:  'warn',
      type:   'raw',
      stream: bsyslog.createBunyanStream({
        type:     'sys',
        facility: bsyslog.local0,
        host:     process.env.SYSLOG_HOST ?? '127.0.0.1',
        port:     parseInt(process.env.SYSLOG_PORT ?? '514'),
      }),
    },
  ],
  serializers: bunyan.stdSerializers,
})
```

---

## Level mapping

```
bunyan level → syslog severity
─────────────────────────────
TRACE  (10)  → DEBUG   (7)
DEBUG  (20)  → DEBUG   (7)
INFO   (30)  → INFO    (6)
WARN   (40)  → WARNING (4)
ERROR  (50)  → ERR     (3)
FATAL  (60)  → CRIT    (2)
```

---

## Structured audit logging

```javascript
// Child logger with persistent context
const sessionLog = log.child({
  sessionId: process.env.YAMTAM_SESSION_ID,
  version:   '1.3.48',
})

sessionLog.info({ tool: 'fetch', url: 'https://api.github.com/zen' }, 'tool call')
sessionLog.warn({ rule: 'network-egress-law', blocked: 'ssrf' },     'egress blocked')
sessionLog.error({ err: new Error('sandbox exec failed') },           'sandbox error')
```

---

## Query logs with bunyan CLI

```bash
# Install: npm install -g bunyan
cat releases/logs/agent-audit.json | bunyan

# Filter by level
cat releases/logs/agent-audit.json | bunyan --level warn

# Filter by field
cat releases/logs/agent-audit.json | bunyan -c 'this.tool == "fetch"'
```

---

## Anti-Fake-Pass Checklist

```
❌ bsyslog TCP mode without TLS → log content visible on network
❌ bunyan stream errors not handled → silent drop of log entries
❌ Fatal log not reaching syslog (level filter) → set syslog stream level to 'warn'
❌ Log file not append-only → agent can truncate audit trail
❌ No serializers → Error objects logged as {} (empty)
❌ Child logger not used → session context missing from all log entries
```
