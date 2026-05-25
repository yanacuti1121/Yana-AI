---
name: raft-consensus-patterns
description: Raft distributed consensus algorithm patterns. Leader election, log replication, safety invariants, snapshot/compaction, and membership changes for replicated agent state machines. Sources: hashicorp/raft (MPL-2.0).
origin: yamtam-engine — synthesized from hashicorp/raft (MPL-2.0), Raft paper (Ongaro & Ousterhout)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /raft-consensus-patterns

## When to Use

- Elect a leader agent from a cluster without a single point of failure
- Replicate agent state (config, task queue) across N nodes — survive N/2 failures
- Distributed locking: only the leader executes critical operations
- Ordered event log: every agent agrees on the same sequence of commands

## Do NOT use for

- Single-node deployments (use file-based state)
- Eventual consistency (use [[yjs-crdt-sync]] or [[automerge-crdt]])

---

## Raft roles and invariants

```
FOLLOWER  → starts here; transitions to CANDIDATE on election timeout
CANDIDATE → broadcasts RequestVote; wins if majority grants votes → LEADER
LEADER    → sends AppendEntries heartbeats; all writes go through leader

Safety invariants (never violated):
  - Election Safety:   at most one leader per term
  - Log Matching:      if two logs agree at index i, they agree on all entries ≤ i
  - Leader Completeness: if entry committed in term T, present in all future leaders
  - State Machine Safety: if server applies entry at index i, no other server applies different entry at i
```

---

## Raft node config (hashicorp/raft style — Node.js skiff-raft)

```javascript
import Raft from 'skiff-raft'

const node = new Raft({
  id:               'agent-1',
  peers:            ['agent-2', 'agent-3'],
  electionTimeout:  [150, 300],  // ms — randomized to avoid split votes
  heartbeatInterval: 50,         // ms — must be << election timeout

  // State machine: apply committed log entries
  apply: async (entry) => {
    const cmd = JSON.parse(entry.toString())
    await stateMachine.apply(cmd)
    console.log('[raft] applied:', cmd)
  },
})

node.on('leader', ()   => console.log('[raft] I am leader'))
node.on('follower', () => console.log('[raft] I am follower'))
```

---

## Write through leader

```javascript
async function raftWrite(node, command) {
  if (!node.isLeader()) {
    const leader = node.getLeader()
    throw new Error(`[raft] not leader — redirect to ${leader}`)
  }

  // Append to log; committed when majority acknowledges
  await node.append(Buffer.from(JSON.stringify(command)))
  console.log('[raft] committed:', command)
}

// Usage:
await raftWrite(node, { type: 'SET', key: 'agent.tier', value: 'power' })
```

---

## Leader election timeout tuning

```
Guideline (from Raft paper):
  broadcastTime << electionTimeout << MTBF

  broadcastTime:   time to send RPC + receive response (~0.5–20ms LAN)
  electionTimeout: 10–500ms (random in [T, 2T] to avoid split vote)
  MTBF:            mean time between failures (hours for servers)

Typical:
  heartbeatInterval = 50ms
  electionTimeout   = [150ms, 300ms]
  → cluster recovers from leader failure in < 300ms
```

---

## Snapshot and log compaction

```javascript
// Prevent unbounded log growth — snapshot at checkpoint
node.on('needsSnapshot', async () => {
  const snapshot = await stateMachine.snapshot()
  await node.saveSnapshot(snapshot, stateMachine.lastAppliedIndex)
  await node.compactLog(stateMachine.lastAppliedIndex)
  console.log('[raft] snapshot saved at index', stateMachine.lastAppliedIndex)
})
```

---

## Anti-Fake-Pass Checklist

```
❌ Fixed election timeout → all nodes time out simultaneously → split vote loop forever
❌ Leader accepts writes before its own no-op is committed → stale reads from previous term
❌ No log compaction → log grows unbounded, replay takes forever on restart
❌ Cluster size = 2 → majority = 2, lose one node = cluster halted (use odd N ≥ 3)
❌ Redirect to leader without retry on client → write rejected when leader changes mid-request
❌ Applying same log entry twice on restart → idempotent apply is required
```
