---
name: p2p-chronicle-log
description: P2P append-only action log for distributed agent audit trails. Peer-to-peer replication, content-addressed entries, causal ordering, and tamper-evident chain without central coordinator. Sources: mafintosh/chronicle (MIT).
origin: yamtam-engine — synthesized from mafintosh/chronicle (MIT), hypercore (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /p2p-chronicle-log

## When to Use

- Distribute the yamtam audit log across multiple agent nodes without a central server
- Causal ordering: agent B sees agent A's action before acting on it
- Tamper-evident: Merkle-backed log where any edit breaks all downstream hashes
- Offline-first: agents append locally, sync when peers reconnect

## Do NOT use for

- Strong consistency required (use [[etcd-distributed-config]] with Raft)
- Simple local audit logging (use [[append-only-hypercore]])

---

## Append-only log (hypercore-based P2P)

```javascript
import Hypercore from 'hypercore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'

// Create or reopen an append-only log
const core = new Hypercore('./data/agent-audit-log', {
  valueEncoding: 'json',
})

await core.ready()
console.log('[chronicle] key:', core.key.toString('hex'))
console.log('[chronicle] length:', core.length)

// Append action entry
async function logAction(agentId: string, action: string, meta: object) {
  await core.append({
    agentId,
    action,
    meta,
    ts:    Date.now(),
    seq:   core.length,
  })
}

// Read all entries
for (let i = 0; i < core.length; i++) {
  const entry = await core.get(i)
  console.log('[chronicle]', entry)
}
```

---

## P2P replication via Hyperswarm

```javascript
import Hyperswarm from 'hyperswarm'

const swarm = new Hyperswarm()

// Announce and discover peers by the core's discovery key
const discovery = swarm.join(core.discoveryKey, { server: true, client: true })
await discovery.flushed()

swarm.on('connection', (socket, info) => {
  console.log('[chronicle] peer connected:', info.publicKey.toString('hex').slice(0, 8))
  // Replicate the core with this peer
  const replicationStream = core.replicate(info.client)
  socket.pipe(replicationStream).pipe(socket)

  replicationStream.on('error', (err) => {
    console.error('[chronicle] replication error:', err.message)
  })
})

// Sync signal: fire when all known peers are caught up
core.on('peer-add', () => console.log('[chronicle] peers:', core.peers.length))
```

---

## Causal ordering (multi-writer with Autobase)

```javascript
import Autobase from 'autobase'

// Multi-writer log: merge concurrent appends from N agents into a causal order
const base = new Autobase({
  inputs:  [localCore, ...remoteCores],
  output:  outputCore,
  apply:   async (nodes, view, base) => {
    // nodes: causally-ordered entries from all inputs
    for (const node of nodes) {
      await view.append(node.value)
    }
  },
})

await base.ready()
await base.append({ agentId: 'agent-1', action: 'task.start', ts: Date.now() })
```

---

## Verify entry integrity (Merkle proof)

```javascript
// Request a Merkle proof for entry at index i
const proof = await core.proof(i, { block: { index: i, nodes: 0 }, upgrade: false })

// Verify the proof against the known root hash
const valid = await core.verify(proof)
console.log('[chronicle] entry integrity:', valid ? 'OK' : 'TAMPERED')
```

---

## Anti-Fake-Pass Checklist

```
❌ Multiple processes opening same Hypercore path → lock conflict, data corruption
❌ No error handler on replication stream → network errors crash the process
❌ Reading core.length before core.ready() → always 0; await ready() first
❌ Appending objects without valueEncoding: 'json' → stored as raw Buffer, not parseable
❌ Autobase without deterministic apply function → non-idempotent merges cause divergence
❌ discoveryKey shared publicly → any peer can replicate the log; use authentication layer
```
