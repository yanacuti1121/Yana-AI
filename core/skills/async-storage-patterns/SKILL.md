---
name: async-storage-patterns
description: Async key-value storage with automatic driver selection. localForage API patterns, IndexedDB/WebSQL/localStorage fallback chain, binary data storage, expiry patterns, and offline-first agent state persistence. Sources: localForage/localForage.
origin: yana-ai — synthesized from localForage/localForage (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /async-storage-patterns

## When to Use

- Persist agent session state in browser-based deployments (Claude web UI extensions)
- Offline-first agent memory: queue actions while offline, sync on reconnect
- Store binary embeddings (ArrayBuffer) without JSON encoding overhead
- Auto-fallback when primary storage is quota-exceeded or unavailable

## Do NOT use for

- Node.js server-side storage (localForage is browser-oriented; use conf or fs)
- Sensitive credentials (any browser storage is accessible to JS)

---

## Basic CRUD

```javascript
import localforage from 'localforage'

// Configure once
localforage.config({
  driver:    [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
  name:      'yamtam-agent',
  storeName: 'session-state',
  version:   1.0,
})

// Set
await localforage.setItem('session:abc', {
  startedAt:  Date.now(),
  skillsUsed: ['vector-store-patterns', 'yaml-safe-parsing'],
})

// Get (returns null if not found)
const session = await localforage.getItem<{ startedAt: number }>('session:abc')

// Remove
await localforage.removeItem('session:abc')

// Clear all
await localforage.clear()
```

---

## Store binary embeddings

```javascript
// Float32Array stored as ArrayBuffer — no JSON serialization overhead
const embedding = new Float32Array([0.1, 0.3, 0.8, 0.2])
await localforage.setItem('embed:chunk-001', embedding.buffer)

// Retrieve
const buf = await localforage.getItem<ArrayBuffer>('embed:chunk-001')
const vec = buf ? new Float32Array(buf) : null
```

---

## Expiry pattern (TTL on top of localForage)

```typescript
interface Cached<T> { value: T; expiresAt: number }

async function setWithTTL<T>(key: string, value: T, ttlMs: number): Promise<void> {
  await localforage.setItem<Cached<T>>(key, { value, expiresAt: Date.now() + ttlMs })
}

async function getWithTTL<T>(key: string): Promise<T | null> {
  const entry = await localforage.getItem<Cached<T>>(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    await localforage.removeItem(key)
    return null
  }
  return entry.value
}
```

---

## Iterate all keys

```javascript
// Collect all session keys for audit
const sessionKeys: string[] = []
await localforage.iterate((_, key) => {
  if (key.startsWith('session:')) sessionKeys.push(key)
})
console.log('Active sessions:', sessionKeys.length)
```

---

## Anti-Fake-Pass Checklist

```
❌ No driver config → falls back to localStorage (5MB limit, synchronous writes)
❌ Storing secrets in browser storage → accessible to XSS attacks
❌ ArrayBuffer not used for embeddings → JSON serialization bloats storage 4×
❌ No expiry → stale session data accumulates, hits quota
❌ localforage.clear() clears ALL stores including other app data in same origin
❌ Not available in Node.js without a polyfill (node-localstorage)
```
