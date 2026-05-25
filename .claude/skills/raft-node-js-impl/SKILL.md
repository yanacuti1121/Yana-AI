---
name: raft-node-js-impl
description: Node.js-native Raft consensus implementation for embedding distributed consensus directly into agent processes. In-process leader election, log replication via TCP, and state machine callbacks without external services. Sources: skiff-project/skiff (MIT).
origin: yamtam-engine — synthesized from skiff-project/skiff (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /raft-node-js-impl

## When to Use

- Embed Raft consensus inside the Node.js agent process — no external etcd/ZooKeeper
- Yamtam Swarm: elect a coordinator agent from a cluster of 3+ agents in-process
- Lightweight: no JVM, no separate binary — pure Node.js TCP-based Raft
- Prototype consensus behavior before committing to a full distributed database

## Do NOT use for

- Production clusters requiring battle-tested Raft (use [[etcd-distributed-config]])
- Cross-language clusters (this is Node.js only)

---

## Skiff node setup

```javascript
import Skiff from 'skiff'

// Each agent runs one Skiff node
const node = Skiff('agent-1', {
  // Persistent storage path for this node's log
  location: './data/raft/agent-1',

  // Cluster members (must be same across all nodes)
  peers: [
    { id: 'agent-2', hostname: '10.0.0.2', port: 9001 },
    { id: 'agent-3', hostname: '10.0.0.3', port: 9001 },
  ],

  // TCP transport settings
  transport: {
    connections: {
      hostname: '0.0.0.0',
      port:     9001,
    },
  },

  // Election timeout (ms) — randomize to avoid split votes
  electionTimeout:   { from: 150, to: 300 },
  heartbeatInterval: 50,
})
```

---

## State machine: apply committed commands

```javascript
// Commands applied to the state machine after Raft commits them
node.on('applied', (entry) => {
  const cmd = JSON.parse(entry.toString())
  console.log('[raft-node] applied:', cmd)

  switch (cmd.type) {
    case 'SET':
      stateStore.set(cmd.key, cmd.value)
      break
    case 'DELETE':
      stateStore.delete(cmd.key)
      break
  }
})

node.on('leader', ()   => console.log('[raft-node] became leader'))
node.on('follower', () => console.log('[raft-node] became follower'))
node.on('candidate', () => console.log('[raft-node] election in progress'))
```

---

## Write through the cluster

```javascript
// Only the leader can commit writes
async function clusterWrite(key: string, value: unknown) {
  if (!node.is('leader')) {
    // Forward to leader or wait for election
    throw new Error(`[raft-node] not leader — current leader: ${node.leader()}`)
  }

  await new Promise<void>((resolve, reject) => {
    const cmd = JSON.stringify({ type: 'SET', key, value })
    node.command(Buffer.from(cmd), (err) => {
      if (err) reject(err)
      else     resolve()
    })
  })
}

// Write (safe even across leader changes via retry)
async function safeWrite(key: string, value: unknown, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await clusterWrite(key, value)
      return
    } catch (err: any) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 200))  // wait for election
    }
  }
}
```

---

## Cluster startup sequence

```javascript
// Start the node (begins listening for peers)
await node.start()

// Wait for cluster to stabilize (leader elected)
await new Promise<void>((resolve) => {
  const check = () => {
    if (node.leader()) { resolve(); return }
    setTimeout(check, 100)
  }
  check()
})

console.log('[raft-node] cluster ready, leader:', node.leader())
```

---

## Anti-Fake-Pass Checklist

```
❌ Only 2 nodes → majority = 2, one failure = cluster halted; always use odd N ≥ 3
❌ Same port on all nodes on one machine → bind conflict; use distinct ports per node
❌ node.command() before node.start() → commands silently dropped
❌ No retry on write → leader election mid-write returns error; must retry after election
❌ Not handling 'leader' event to update routing table → clients still writing to old leader
❌ location path not persisted → node restarts with empty log, rejoins as fresh peer, replays from peers
```
