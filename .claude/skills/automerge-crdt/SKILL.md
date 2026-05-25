---
name: automerge-crdt
description: Automerge CRDT for Git-like branching, independent editing, and automatic merge of agent state without a central server. Document fork/merge, change history, and conflict-free concurrent writes. Sources: automerge/automerge (MIT).
origin: yamtam-engine — synthesized from automerge/automerge (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /automerge-crdt

## When to Use

- Agents independently modify a shared document offline and merge later (Git-like workflow)
- Config or state that multiple agents can modify simultaneously with automatic conflict resolution
- History/audit: inspect every change ever made to a document, who made it, when
- Rollback: revert a document to any prior state via change log

## Do NOT use for

- Real-time sync (Yjs [[yjs-crdt-sync]] is lower-latency for live collaborative editing)
- Large binary blobs (Automerge excels at structured data, not raw bytes)

---

## Create and modify a document

```javascript
import * as A from '@automerge/automerge'

// Create initial document
let doc = A.from({
  agentConfig: {
    tier:      'fast',
    maxTokens: 2000,
    rules:     [],
  },
})

// Modify (always returns new doc — immutable)
doc = A.change(doc, 'upgrade tier', d => {
  d.agentConfig.tier      = 'power'
  d.agentConfig.maxTokens = 8000
  d.agentConfig.rules.push('token-budget-policy')
})

console.log(doc.agentConfig.tier)  // 'power'
```

---

## Fork and merge (concurrent changes)

```javascript
// Two agents start from the same base
let agentA = A.clone(doc)
let agentB = A.clone(doc)

// Agent A modifies tier
agentA = A.change(agentA, 'agent-A: set tier', d => {
  d.agentConfig.tier = 'power'
})

// Agent B concurrently adds a rule
agentB = A.change(agentB, 'agent-B: add rule', d => {
  d.agentConfig.rules.push('rate-limit-gate')
})

// Merge: both changes survive (CRDT — no data loss)
const merged = A.merge(A.clone(agentA), agentB)
console.log(merged.agentConfig.tier)    // 'power'     (from A)
console.log(merged.agentConfig.rules)   // ['token-budget-policy', 'rate-limit-gate'] (both)
```

---

## Sync protocol (incremental updates)

```javascript
// Encode changes to send to a peer
const [syncState, syncMessage] = A.generateSyncMessage(doc, A.initSyncState())

// Peer applies the message
let peerDoc = A.receiveSyncMessage(peerDoc, peerSyncState, syncMessage)

// Compact save/load
const saved  = A.save(doc)      // Uint8Array — full serialized document
const loaded = A.load(saved)    // restore from bytes
```

---

## Inspect history

```javascript
// All changes ever made to the document
const history = A.getHistory(doc)
history.forEach(({ change, snapshot }) => {
  console.log(`[automerge] ${change.message} at ${new Date(change.timestamp * 1000).toISOString()}`)
})

// Diff between two versions
const changes = A.getChanges(docBefore, docAfter)
console.log('[automerge] changes since fork:', changes.length)
```

---

## Anti-Fake-Pass Checklist

```
❌ Mutating doc directly outside A.change() → mutation silently lost; Automerge docs are frozen
❌ A.merge() on docs with no common history → no error but changes may not reconcile as expected
❌ Comparing doc values with === after merge → same logical value, different object reference
❌ Not saving doc after changes → in-memory only; process restart loses all history
❌ Using A.change() for large binary payloads → each byte tracked as a CRDT op; very slow
❌ timestamp in change relies on system clock → use logical clocks if clock skew is a concern
```
