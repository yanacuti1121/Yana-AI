---
name: etcd-distributed-config
description: etcd distributed key-value store for centralized agent config and distributed locking. Watch API for live config reload, lease-based TTL keys, transactions, and distributed mutex patterns. Sources: etcd-io/etcd (Apache-2.0).
origin: yamtam-engine — synthesized from etcd-io/etcd (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /etcd-distributed-config

## When to Use

- Centralized config for all agents: one write, all agents reload automatically
- Distributed mutex: only one agent executes a critical section at a time
- Service registry: agents register presence with TTL lease; expired = offline
- Consistent read: strong consistency required (vs eventual consistency of [[yjs-crdt-sync]])

## Do NOT use for

- Local config (use [[cli-config-persistence]])
- High-frequency writes (etcd is optimized for reads; write throughput ~10k/s)

---

## Connect and basic CRUD

```javascript
import { Etcd3 } from 'etcd3'

const client = new Etcd3({
  hosts: ['http://etcd-1:2379', 'http://etcd-2:2379', 'http://etcd-3:2379'],
  auth:  { username: 'yamtam', password: process.env.ETCD_PASSWORD! },
})

// Put
await client.put('/yamtam/config/model-tier').value('power')

// Get
const tier = await client.get('/yamtam/config/model-tier').string()
console.log('[etcd] tier:', tier)

// Delete
await client.delete().key('/yamtam/config/deprecated').exec()

// Get all under prefix
const entries = await client.getAll().prefix('/yamtam/config/').strings()
console.log('[etcd] config:', entries)
```

---

## Watch API (live config reload)

```javascript
const watcher = await client.watch()
  .prefix('/yamtam/config/')
  .create()

watcher
  .on('put', (kv) => {
    const key   = kv.key.toString()
    const value = kv.value.toString()
    console.log(`[etcd] config changed: ${key} = ${value}`)
    configCache.set(key, value)
  })
  .on('delete', (kv) => {
    configCache.delete(kv.key.toString())
  })
  .on('error', (err) => {
    console.error('[etcd] watch error:', err)
  })

// Cleanup on shutdown
process.on('SIGTERM', () => watcher.cancel())
```

---

## Lease-based TTL key (agent heartbeat / service registry)

```javascript
const lease = client.lease(10)  // 10-second TTL

// Register agent presence
await lease.put('/yamtam/agents/agent-1').value(JSON.stringify({
  id:      'agent-1',
  address: 'ws://agent-1:8080',
  ts:      Date.now(),
}))

// Renew automatically (etcd3 keeps-alive internally)
lease.on('lost', async (err) => {
  console.error('[etcd] lease lost:', err)
  // Re-register
  await lease.put('/yamtam/agents/agent-1').value(...)
})
```

---

## Distributed mutex (only one agent at a time)

```javascript
async function withLock(name: string, fn: () => Promise<void>) {
  const lock = client.lock(name).ttl(15)  // lock TTL 15s
  await lock.acquire()
  try {
    await fn()
  } finally {
    await lock.release()
  }
}

// Usage: only one agent runs the migration at a time
await withLock('/yamtam/locks/schema-migration', async () => {
  console.log('[etcd] running migration...')
  await runMigration()
})
```

---

## Anti-Fake-Pass Checklist

```
❌ TTL too short on lease → agent under load misses renewal, key deleted, false offline detection
❌ No watcher reconnect on error → stale config after etcd leader re-election
❌ Distributed lock without finally → lock never released if fn() throws
❌ Single etcd host → no HA; cluster needs ≥ 3 nodes for majority quorum
❌ Plain HTTP (not HTTPS) for etcd → credentials and config in cleartext
❌ getAll() without prefix on large cluster → returns all keys, unbounded memory
```
