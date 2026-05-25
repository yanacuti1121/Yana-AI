---
name: append-only-hypercore
description: Merkle-tree-backed append-only log for distributed audit trails. Hypercore feed creation, append entries, replicate over network, sparse access, and integration with L0 audit hash-chain. Sources: holepunchto/hypercore.
origin: yamtam-engine — synthesized from holepunchto/hypercore (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.49
---

# /append-only-hypercore

## When to Use

- L0 audit log that no agent (including a compromised one) can modify or delete
- Distributed log replicated across multiple Codespaces instances
- Sparse access: verify a single entry without downloading the whole log
- Cryptographic proof that entry N existed at time T

## Do NOT use for

- Random-access read/write storage (append-only only — no delete/update)
- Environments without Node.js native bindings support

---

## Create and append to feed

```javascript
import Hypercore from 'hypercore'
import { join }  from 'path'

const AUDIT_DIR = './releases/logs/hypercore-audit'

// Writer feed (local audit log)
const feed = new Hypercore(join(AUDIT_DIR, 'feed'), {
  valueEncoding: 'json',
})

await feed.ready()
console.log('[hypercore] public key:', feed.key.toString('hex'))
console.log('[hypercore] length:', feed.length)

// Append audit entry (returns sequence number)
async function appendAuditEntry(entry: object): Promise<number> {
  const seq = await feed.append(entry)
  console.log(`[hypercore] appended seq=${seq}`)
  return seq
}

await appendAuditEntry({
  ts:      new Date().toISOString(),
  level:   'info',
  action:  'tool-call',
  cmd:     'sandbox-exec',
  session: process.env.YAMTAM_SESSION_ID,
})
```

---

## Read entries

```javascript
// Read single entry by sequence number
const entry = await feed.get(0)  // first entry

// Read range
for (let i = 0; i < feed.length; i++) {
  const e = await feed.get(i)
  console.log(`[${i}]`, e)
}

// Create readable stream
const stream = feed.createReadStream({ start: 0, end: feed.length, live: false })
stream.on('data', (entry) => console.log(entry))
```

---

## Replicate to remote (peer sync)

```javascript
import net from 'net'

// Server: expose feed for replication
const server = net.createServer((socket) => {
  const replicationStream = feed.replicate(false, { live: true })
  replicationStream.pipe(socket).pipe(replicationStream)
})
server.listen(9000, '127.0.0.1')

// Client: connect and sync
const socket     = net.connect(9000, '127.0.0.1')
const remoteFeed = new Hypercore(join(AUDIT_DIR, 'remote'), feed.key, {
  valueEncoding: 'json',
})
await remoteFeed.ready()
const replStream = remoteFeed.replicate(true, { live: true })
replStream.pipe(socket).pipe(replStream)
```

---

## Verify entry integrity (Merkle proof)

```javascript
// Hypercore has built-in Merkle tree — every get() verifies the proof automatically
// To explicitly check integrity:
async function verifyEntry(seq: number): Promise<boolean> {
  try {
    await feed.get(seq)  // throws if Merkle proof fails
    return true
  } catch {
    return false
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ feed not await ready() before operations → operations fail silently
❌ Writable feed without key backup → feed is unrecoverable if storage deleted
❌ No replication → single point of failure for audit log
❌ valueEncoding not set → raw Buffer returned, not parsed JSON
❌ live:true replication without auth → any peer can replicate private audit data
❌ feed.close() not called on exit → storage corruption possible on crash
```
