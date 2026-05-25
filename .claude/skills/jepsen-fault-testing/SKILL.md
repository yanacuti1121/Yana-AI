---
name: jepsen-fault-testing
description: Jepsen-style distributed system fault injection patterns. Network partition simulation, clock skew injection, process kill scenarios, linearizability checkers, and fault-tolerance test design. Sources: jepsen-io/jepsen (EPL-1.0).
origin: yamtam-engine — synthesized from jepsen-io/jepsen (EPL-1.0), Jepsen analysis methodology
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.50
---

# /jepsen-fault-testing

## When to Use

- Verify that distributed agent consensus (Raft, etcd) actually survives network splits
- Prove that the distributed mutex never grants two agents the lock simultaneously
- Chaos test before a production deployment of a multi-node agent cluster
- Validate that CRDT merges produce linearizable results after partitions

## Do NOT use for

- Unit tests of business logic (use Jest [[jest-test-generation]])
- Performance benchmarking (Jepsen introduces intentional faults, not load)

---

## Jepsen test anatomy (Clojure DSL — conceptual)

```clojure
;; A Jepsen test has 5 components:
{:name    "yamtam-raft-lock"
 :db      (raft-cluster-db)         ; setup/teardown cluster
 :client  (lock-client)             ; operations: acquire/release
 :nemesis (nemesis/partition-random-halves)  ; fault injector
 :checker (checker/linearizable)    ; correctness verifier
 :generator
   (->> (gen/mix [acquire-op release-op])
        (gen/stagger 0.1)           ; 100ms between ops
        (gen/nemesis
          (gen/seq [{:type :info :f :start}  ; inject partition
                    (gen/sleep 10)
                    {:type :info :f :stop}])) ; heal
        (gen/time-limit 60))}       ; 60s test
```

---

## Node.js fault injection patterns (without Jepsen)

```javascript
// Simulate network partition: drop packets between agent-1 and agent-2
// Requires iptables or tc (traffic control)
import { exec } from 'child_process'
import { promisify } from 'util'
const run = promisify(exec)

async function partitionAgents(ip1: string, ip2: string) {
  // Drop traffic in both directions
  await run(`iptables -A INPUT  -s ${ip2} -j DROP`)
  await run(`iptables -A OUTPUT -d ${ip2} -j DROP`)
  console.log(`[jepsen] partition: ${ip1} ↔ ${ip2} blocked`)
}

async function healPartition(ip1: string, ip2: string) {
  await run(`iptables -D INPUT  -s ${ip2} -j DROP`)
  await run(`iptables -D OUTPUT -d ${ip2} -j DROP`)
  console.log('[jepsen] partition healed')
}
```

---

## Linearizability checker (knossos-style)

```typescript
// Record all operations with their start/end times
interface Op {
  type:    'invoke' | 'ok' | 'fail'
  fn:      string
  value:   unknown
  process: string
  time:    number   // monotonic ms
}

const history: Op[] = []

async function trackedLock(agentId: string, lockFn: () => Promise<boolean>) {
  history.push({ type: 'invoke', fn: 'lock', value: null, process: agentId, time: Date.now() })
  try {
    const result = await lockFn()
    history.push({ type: 'ok',     fn: 'lock', value: result, process: agentId, time: Date.now() })
    return result
  } catch (err) {
    history.push({ type: 'fail',   fn: 'lock', value: null,   process: agentId, time: Date.now() })
    throw err
  }
}

// Check: no two agents hold lock simultaneously
function checkLinearizability(history: Op[]): boolean {
  const held = new Map<string, boolean>()
  const locks: string[] = []

  for (const op of history.filter(o => o.type === 'ok' && o.fn === 'lock' && o.value === true)) {
    locks.push(op.process)
    if (locks.length > 1) {
      console.error('[jepsen] VIOLATION: concurrent lock holders:', locks)
      return false
    }
  }
  return true
}
```

---

## Clock skew injection

```bash
# Shift system clock forward 200ms to simulate NTP jump (requires root)
sudo date -s "$(date --date='+200 ms' '+%Y-%m-%d %H:%M:%S.%N')"

# tc: add 100ms jitter to all outgoing packets
sudo tc qdisc add dev eth0 root netem delay 100ms 50ms distribution normal

# Restore
sudo tc qdisc del dev eth0 root
```

---

## Anti-Fake-Pass Checklist

```
❌ Testing on localhost only → no real network partition possible; tests prove nothing about distributed behavior
❌ Not recording op timestamps → linearizability check cannot detect overlapping lock windows
❌ Healing partition before checking consistency → find violations while partition is active
❌ Single-node "cluster" in tests → consensus algorithms behave differently with 1 vs 3 nodes
❌ iptables rules not cleaned up after test → permanent partition in CI environment
❌ Assuming test pass = production safe → Jepsen finds bugs in mature DBs (etcd, Cassandra, etc.)
```
