---
name: caching-memory-efficiency
description: Production caching patterns and memory efficiency laws from 5 repos. In-memory TTL caches, unified KV interfaces, LRU eviction math, consistent hashing for distributed load, and GC thrash prevention via object pooling. Sources: node-cache/node-cache, jaredwray/keyv, isaacs/node-lru-cache, memcached/memcached, tweenjs/tween.js.
origin: yana-ai — synthesized from node-cache/node-cache, jaredwray/keyv, isaacs/node-lru-cache, memcached/memcached, tweenjs/tween.js
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.38
---

# /caching-memory-efficiency

## When to Use

- Data pipeline code that hits the same DB/API keys repeatedly
- Choosing between in-process, distributed, or tiered cache
- Object allocation hot paths causing GC pause spikes
- "This service is slow but CPU is idle" — usually a cache miss pattern

## Do NOT use for

- Single-request scripts (no repeated access)
- Data that must never be stale (financial ledgers, auth tokens)

---

## Cache Strategy Decision Tree

```
Same process?           → node-cache (in-memory, TTL)
Multi-process, 1 node?  → keyv + sqlite/redis adapter
Multi-node?             → keyv + Redis adapter OR memcached
Hot loop objects?       → object pool (tween.js pattern)
Unbounded size risk?    → lru-cache (auto-evict LRU entries)
```

---

## In-Memory TTL Cache (node-cache)

```javascript
import NodeCache from 'node-cache'

// stdTTL=60: default 60s expiry; checkperiod=120: GC every 2min
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120, useClones: false })

async function getUser(id) {
  const cached = cache.get(`user:${id}`)
  if (cached) return cached

  const user = await db.users.findById(id)
  cache.set(`user:${id}`, user, 300)  // 5min TTL for this entry
  return user
}

// useClones: false — skip deep clone on get/set (2-3× faster, objects are shared)
// Only set useClones: true if callers mutate the returned object
```

---

## Unified KV Interface (keyv)

```javascript
import Keyv from 'keyv'
import KeyvRedis from '@keyv/redis'

// Swap storage backend without changing app code
const cache = process.env.REDIS_URL
  ? new Keyv({ store: new KeyvRedis(process.env.REDIS_URL), ttl: 300_000 })
  : new Keyv({ ttl: 300_000 })  // falls back to in-memory Map

await cache.set('session:abc', { userId: 42 })
const session = await cache.get('session:abc')  // → { userId: 42 }
await cache.delete('session:abc')

// Namespace to prevent key collision
const userCache = new Keyv({ namespace: 'user', ttl: 60_000 })
```

---

## LRU Eviction (lru-cache)

```javascript
import { LRUCache } from 'lru-cache'

// max: 500 items OR 50MB — whichever is hit first
const cache = new LRUCache({
  max: 500,
  maxSize: 50 * 1024 * 1024,     // 50MB
  sizeCalculation: (value) => Buffer.byteLength(JSON.stringify(value)),
  ttl: 1000 * 60 * 5,            // 5 minute TTL
  allowStale: false,             // never return expired entry
})

// Memoize expensive compute
function memoize(fn, keyFn) {
  return (...args) => {
    const key = keyFn(...args)
    if (cache.has(key)) return cache.get(key)
    const result = fn(...args)
    cache.set(key, result)
    return result
  }
}
```

---

## Consistent Hashing (memcached distribution principle)

```javascript
// Consistent hashing: adding/removing nodes shifts only K/n keys
// (K = total keys, n = number of nodes) — not all keys

class ConsistentHashRing {
  constructor(nodes, replicas = 150) {
    this.ring = new Map()
    for (const node of nodes) {
      for (let i = 0; i < replicas; i++) {
        const hash = this.#hash(`${node}:${i}`)
        this.ring.set(hash, node)
      }
    }
    this.sortedKeys = [...this.ring.keys()].sort((a, b) => a - b)
  }

  getNode(key) {
    const h = this.#hash(key)
    const idx = this.sortedKeys.findIndex(k => k >= h) ?? 0
    return this.ring.get(this.sortedKeys[idx % this.sortedKeys.length])
  }

  #hash(key) { /* djb2 or murmurhash */ }
}
// Rule: ≥ 150 virtual nodes per real node for even distribution
```

---

## GC Thrash Prevention — Object Pool (tween.js pattern)

```javascript
// Problem: allocating thousands of small objects per frame → GC pause
// Solution: pool pattern — reuse objects instead of allocating

class ObjectPool {
  #free = []
  #factory

  constructor(factory, prewarm = 100) {
    this.#factory = factory
    for (let i = 0; i < prewarm; i++) this.#free.push(factory())
  }

  acquire() {
    return this.#free.length ? this.#free.pop() : this.#factory()
  }

  release(obj) {
    // Reset state before returning to pool
    Object.keys(obj).forEach(k => { obj[k] = null })
    this.#free.push(obj)
  }
}

// tween.js: all Tween instances come from a pool — zero new() in hot loop
const tweenPool = new ObjectPool(() => ({ start: 0, end: 0, duration: 0 }), 200)
```

---

## Anti-Fake-Pass Checklist

```
❌ Cache key without namespace (collision between modules)
❌ In-memory cache without max size / TTL (unbounded growth → OOM)
❌ useClones: true on high-frequency hot path (silent 2-3× slowdown)
❌ Distributing across nodes without consistent hashing (thundering herd on node add)
❌ Object pool that forgets to reset state on release (stale data leak)
❌ LRU cache with sizeCalculation absent (max: 500 = item count, ignores item size)
```
