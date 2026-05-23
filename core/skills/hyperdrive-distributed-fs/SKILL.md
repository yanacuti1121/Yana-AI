---
name: hyperdrive-distributed-fs
description: Hyperdrive P2P distributed filesystem for sharing agent sandboxes and source code. Content-addressed files, sparse sync, versioned snapshots, and P2P replication via Hyperswarm. Sources: holepunchto/hyperdrive (MIT).
origin: yamtam-engine — synthesized from holepunchto/hyperdrive (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /hyperdrive-distributed-fs

## When to Use

- Share agent sandbox filesystem state between nodes without a central file server
- Snapshot agent workspace: version and replicate `core/skills/` to peer nodes
- Sparse sync: agent B downloads only the files it needs from agent A's drive
- Immutable releases: pin a specific drive version for reproducible agent environments

## Do NOT use for

- Random-access mutable databases (use [[etcd-distributed-config]])
- Simple file copy between known hosts (use rsync/scp)

---

## Create and write to a Hyperdrive

```javascript
import Hyperdrive from 'hyperdrive'
import Corestore  from 'corestore'

const store = new Corestore('./data/corestore')
const drive = new Hyperdrive(store)

await drive.ready()
console.log('[hyperdrive] key:', drive.key.toString('hex'))
console.log('[hyperdrive] version:', drive.version)

// Write files
await drive.put('/skills/ecc-key-management/SKILL.md', Buffer.from(skillContent))
await drive.put('/config/agent.json', Buffer.from(JSON.stringify({ tier: 'power' })))

// Read files
const content = await drive.get('/config/agent.json')
console.log('[hyperdrive] config:', content.toString())

// List directory
for await (const entry of drive.list('/skills/')) {
  console.log('[hyperdrive]', entry.key)
}
```

---

## Snapshot versioning

```javascript
// Checkout a previous version (immutable snapshot)
const snapshot = drive.checkout(drive.version - 1)
const oldConfig = await snapshot.get('/config/agent.json')
console.log('[hyperdrive] previous config:', oldConfig?.toString())

// Diff between versions
for await (const diff of drive.diff(drive.version - 1, drive.version)) {
  console.log('[hyperdrive] changed:', diff.left?.key ?? diff.right?.key)
}
```

---

## P2P replication

```javascript
import Hyperswarm from 'hyperswarm'

const swarm = new Hyperswarm()
swarm.join(drive.discoveryKey)

swarm.on('connection', (socket) => {
  const replication = store.replicate(socket)
  socket.pipe(replication).pipe(socket)

  socket.on('error', err => console.error('[hyperdrive] peer error:', err.message))
})

// After replication, remote drive is accessible on the peer via key
const remoteDrive = new Hyperdrive(store, remoteKey)
await remoteDrive.ready()

// Sparse download: get only what you need
const remoteSkill = await remoteDrive.get('/skills/ecc-key-management/SKILL.md')
```

---

## Mirror drive to local filesystem

```javascript
import mirror from 'mirror-folder'

// Sync hyperdrive → local directory
mirror(
  { name: '/', fs: drive },
  { name: './local-mirror' },
  { watch: true },
  (err) => {
    if (err) console.error('[hyperdrive] mirror error:', err)
    else     console.log('[hyperdrive] mirror complete')
  }
)
```

---

## Anti-Fake-Pass Checklist

```
❌ Multiple Hyperdrive instances on same Corestore path → lock contention, data corruption
❌ drive.put() without awaiting → write not flushed before replication starts
❌ drive.key not persisted → new Corestore on restart generates a new key, new identity
❌ No error handler on replication socket → network errors crash the process
❌ discoveryKey shared publicly → any peer can replicate the drive (no access control by default)
❌ drive.checkout() on version 0 → empty drive, not an error; check version > 0 first
```
