---
name: pouchdb-sync-patterns
description: CouchDB-compatible bidirectional sync for agent memory. PouchDB local-first patterns, live replication, conflict resolution, change feeds, and filtered sync for multi-device agent state. Sources: pouchdb/pouchdb.
origin: yana-ai — synthesized from pouchdb/pouchdb (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /pouchdb-sync-patterns

## When to Use

- Agent memory must sync across multiple Codespaces instances
- Offline-first: agent works locally, pushes changes when network available
- Real-time change feeds to trigger agent re-evaluation when memory updates
- Multi-agent shared knowledge base with conflict resolution

## Do NOT use for

- High-frequency write workloads (> 100 writes/sec — use Redis)
- Append-only audit logs (PouchDB allows document updates; use [[append-only-event-log]])

---

## Local-first document store

```javascript
import PouchDB from 'pouchdb'

const db = new PouchDB('yamtam-memory')

// Create/update
async function upsertFact(id: string, data: object): Promise<void> {
  try {
    const existing = await db.get(id)
    await db.put({ ...data, _id: id, _rev: existing._rev })
  } catch (err: any) {
    if (err.status === 404) {
      await db.put({ ...data, _id: id })
    } else throw err
  }
}

// Read
const fact = await db.get('rule:anti-evasion')

// Delete (soft — mark deleted)
await db.remove(fact._id, fact._rev)
```

---

## Bidirectional sync with CouchDB

```javascript
const remote = new PouchDB('https://couchdb.internal/yamtam-memory', {
  auth: { username: 'agent', password: process.env.COUCHDB_PASS },
})

// One-time sync
await PouchDB.sync(db, remote)

// Live sync (continuous)
const syncHandler = PouchDB.sync(db, remote, {
  live:   true,
  retry:  true,
}).on('change',   (info)  => console.log('[sync] change:', info.direction))
  .on('error',    (err)   => console.error('[sync] error:', err))
  .on('paused',   ()      => console.log('[sync] paused (offline)'))
  .on('active',   ()      => console.log('[sync] active (online)'))

// Stop sync on shutdown
process.on('exit', () => syncHandler.cancel())
```

---

## Change feed (react to memory updates)

```javascript
db.changes({
  since:       'now',
  live:        true,
  include_docs: true,
  filter:      (doc) => doc._id.startsWith('skill:'),
}).on('change', (change) => {
  console.log('[memory] skill updated:', change.id)
  // Trigger re-index
})
```

---

## Conflict resolution

```javascript
async function resolveConflicts(docId: string): Promise<void> {
  const doc = await db.get(docId, { conflicts: true })

  if (!doc._conflicts?.length) return

  // Keep latest (highest rev wins), delete losing revisions
  for (const rev of doc._conflicts) {
    const loser = await db.get(docId, { rev })
    await db.remove(docId, loser._rev)
  }
}
```

---

## Anti-Fake-Pass Checklist

```
❌ No _rev on put → 409 Conflict on every update after first write
❌ Live sync without retry:true → stops on first network error
❌ No conflict resolution → diverged replicas both appear as valid (split brain)
❌ Remote URL without auth → open CouchDB accessible to anyone
❌ Sync without filter → entire database syncs including deleted/tombstone docs
❌ Change feed without filter → every document change fires handler (high CPU)
```
