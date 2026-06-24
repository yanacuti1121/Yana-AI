---
name: storage-fallback-patterns
description: Cross-environment storage with automatic driver fallback. store.js patterns for browser/Node/Electron environments, storage backend selection, JSON serialization, namespace isolation, and graceful degradation. Sources: marcuswestin/store.js.
origin: yana-ai — synthesized from marcuswestin/store.js (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /storage-fallback-patterns

## When to Use

- Agent runs in multiple environments (browser extension + Node CLI + Electron)
- Need single storage API that works everywhere without environment detection
- Fallback from IndexedDB → WebSQL → localStorage → memory on quota/permission errors
- Simple synchronous key-value storage for non-critical config

## Do NOT use for

- Binary data storage (use [[async-storage-patterns]] with ArrayBuffer)
- Sensitive credentials (any accessible-to-JS storage is insecure)
- Server-side persistent storage (use [[cli-config-persistence]] or fs)

---

## Basic store.js usage

```javascript
import store from 'store'

// Set (auto-serialized to JSON)
store.set('yamtam.session', { id: 'abc123', startedAt: Date.now() })

// Get
const session = store.get('yamtam.session')  // or defaultValue
const session2 = store.get('yamtam.session', { id: null, startedAt: 0 })

// Remove
store.remove('yamtam.session')

// Iterate
store.each((value, key) => {
  if (key.startsWith('yamtam.')) console.log(key, value)
})

// Clear all store.js entries
store.clearAll()
```

---

## Namespaced store (avoid key collisions)

```javascript
import store from 'store'
import 'store/plugins/prefix'
import 'store/plugins/expire'

// Per-session namespace
const sessionStore = store.namespace(`yamtam.session.${sessionId}`)
sessionStore.set('lastTool', 'fetch')
sessionStore.get('lastTool')  // 'fetch'

// With expiry (via expire plugin)
store.set('cache.response', data, new Date().getTime() + 5 * 60 * 1000)  // 5min TTL
```

---

## Graceful degradation check

```javascript
function isStorageAvailable(): boolean {
  try {
    const key = '__storage_test__'
    store.set(key, 1)
    store.remove(key)
    return true
  } catch {
    return false
  }
}

const storage = isStorageAvailable()
  ? store
  : { set: () => {}, get: () => null, remove: () => {} }  // no-op fallback
```

---

## Node.js polyfill setup

```javascript
// In Node.js: store.js requires node-localstorage or memory-store
import MemoryStore from 'store/storages/memoryStorage'
store.createStore([MemoryStore])  // memory-only in Node
```

---

## Anti-Fake-Pass Checklist

```
❌ store.clearAll() clears all keys from all libraries sharing localStorage
❌ Synchronous API blocks on large objects → use async localForage for > 100KB
❌ No namespace → key collision with other libraries using store.js
❌ In private browsing → localStorage quota = 0, throws SecurityError on set
❌ store.js in Node.js without explicit storage driver → uses in-memory (no persistence)
❌ expire plugin must be explicitly imported — not bundled by default
```
