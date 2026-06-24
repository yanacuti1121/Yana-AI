---
name: yjs-crdt-sync
description: Yjs CRDT shared types for conflict-free real-time multi-agent data sync. Y.Map/Y.Array/Y.Text operations, awareness protocol, WebSocket provider, and offline-first merge semantics. Sources: yjs/yjs (MIT).
origin: yana-ai — synthesized from yjs/yjs (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.50
---

# /yjs-crdt-sync

## When to Use

- Multiple agents write to a shared config/state simultaneously without conflicts
- Real-time collaborative agent task queues: any agent can push/pop, merges automatically
- Offline-first: agent works disconnected, sync resumes on reconnect without data loss
- Shared Y.Text: agents collaboratively edit a document (e.g., shared code review)

## Do NOT use for

- Strong consistency (use [[etcd-distributed-config]])
- Append-only audit logs (use [[append-only-hypercore]])

---

## Shared Y.Map (config sync)

```javascript
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const doc      = new Y.Doc()
const config   = doc.getMap('agent-config')

// Connect to sync server
const provider = new WebsocketProvider('ws://localhost:1234', 'yamtam-swarm', doc)

provider.on('status', ({ status }) => console.log('[yjs]', status))

// Write (merges automatically with concurrent writes from other agents)
config.set('model-tier', 'power')
config.set('max-tokens',  8000)

// Read
console.log('[yjs] tier:', config.get('model-tier'))

// Observe changes (from any agent, including remote)
config.observe((event) => {
  event.changes.keys.forEach((change, key) => {
    if (change.action === 'add' || change.action === 'update') {
      console.log(`[yjs] ${key} →`, config.get(key))
    }
  })
})
```

---

## Shared Y.Array (task queue)

```javascript
const taskQueue = doc.getArray('task-queue')

// Any agent can push without conflict
taskQueue.push([{ id: 'task-1', tool: 'bash', priority: 2 }])

// Pop from front (claim a task)
doc.transact(() => {
  if (taskQueue.length > 0) {
    const task = taskQueue.get(0)
    taskQueue.delete(0, 1)
    console.log('[yjs] claimed task:', task)
  }
})

// Observe additions from other agents
taskQueue.observe((event) => {
  event.changes.added.forEach(item => {
    console.log('[yjs] new task:', item.content.getContent())
  })
})
```

---

## Offline sync (encode/decode state vector)

```javascript
// Agent A: encode current state to share with Agent B
const stateVector  = Y.encodeStateVector(doc)
const stateAsBytes = Y.encodeStateAsUpdate(doc)

// Agent B: apply missing updates
const update = Y.encodeStateAsUpdate(docA, Y.decodeStateVector(docB))
Y.applyUpdate(docB, update)

// Both docs are now identical — order of apply doesn't matter (CRDT)
```

---

## Awareness (presence: which agents are online)

```javascript
import { Awareness } from 'y-protocols/awareness'

const awareness = provider.awareness

// Set local agent state
awareness.setLocalState({
  agentId: process.env.YAMTAM_AGENT_ID,
  status:  'running',
  tier:    'power',
})

// Get all online agents
awareness.on('change', () => {
  const states = [...awareness.getStates().values()]
  console.log('[yjs] online agents:', states.map(s => s.agentId))
})
```

---

## Anti-Fake-Pass Checklist

```
❌ Not wrapping concurrent mutations in doc.transact() → multiple observers fire per sub-change
❌ Y.Array.delete() outside transaction → partial delete visible to observers mid-operation
❌ Y.Doc without unique clientID per agent → two agents collide on same clientID, merge broken
❌ WebsocketProvider without reconnect handling → disconnects silently, sync stops
❌ Comparing Y.Map values with === → values are shared types; use .toJSON() for comparison
❌ applyUpdate() without try/catch → malformed update (from untrusted peer) throws and crashes
```
