---
name: swarm-consensus
description: Multi-agent consensus and coordination patterns for YAMTAM agent swarms. Quorum voting with majority and super-majority thresholds, security-team veto protocol, inter-agent message passing via agent-message-bus.sh, swarm-orchestrator.sh coordination, Raft-inspired leader election concepts, and anti-split-brain patterns. Sources: hashicorp/raft, etcd-io/etcd, automerge/automerge, maelstrom-systems, swarm-consensus literature.
origin: yamtam-engine — synthesized from hashicorp/raft, etcd-io/etcd, automerge/automerge, maelstrom-systems, agent-consensus literature
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.47
---

# /swarm-consensus

## When to Use

- Multiple agents must agree before a high-risk action executes
- "security-team should be able to block anything core-development tries to push"
- Fan-out: one task dispatched to N agents, results aggregated
- Coordination: agent A must wait for agent B to finish before proceeding

## Do NOT use for

- Single-agent decisions (no consensus needed — one agent acts)
- Low-stakes read-only tool calls (majority vote is overkill)

---

## Architecture: YAMTAM Swarm Decision Flow

```
Initiating agent (core-development)
         │
         │  swarm-orchestrator.sh request "commit-gate" <payload>
         ▼
  [Voting Round Open — REQUEST broadcast to all agents]
         │
         ├──→ security-team     votes YES / NO (VETO power)
         ├──→ qa-team           votes YES / NO
         ├──→ docs-team         votes YES (advisory only)
         └──→ ...other agents
         │
         ▼
  [Tally: swarm-orchestrator.sh tally "commit-gate"]
         │
         ├── VETO by security-team? → BLOCKED (exit 2)
         ├── >= 66% YES (irreversible)? → APPROVED
         ├── >= 50% YES (standard)? → APPROVED
         └── < threshold → REJECTED (exit 1)
```

---

## Sending a Consensus Request

```bash
# core-development agent initiates a commit gate check
REQUEST_ID=$(bash core/scripts/swarm-orchestrator.sh request "commit-gate" '{
  "branch": "feat/new-middleware",
  "files_changed": ["core/rules/agent-middleware-law.md", "core/scripts/tool-proxy.sh"],
  "blast_score": 2,
  "description": "Add tool-proxy.sh middleware layer"
}')

echo "Request opened: $REQUEST_ID"

# Wait for votes (up to YAMTAM_CONSENSUS_TIMEOUT seconds)
sleep 10

# Tally the result
bash core/scripts/swarm-orchestrator.sh tally "commit-gate"
# Exit 0 = approved, Exit 1 = rejected, Exit 2 = vetoed
```

---

## Casting a Vote

```bash
# security-team agent reviews and votes
bash core/scripts/swarm-orchestrator.sh vote "security-team" "$REQUEST_ID" yes

# qa-team votes after running tests
TEST_RESULT=$(bash core/scripts/run-all-tests.sh && echo "yes" || echo "no")
bash core/scripts/swarm-orchestrator.sh vote "qa-team" "$REQUEST_ID" "$TEST_RESULT"

# docs-team advisory vote
bash core/scripts/swarm-orchestrator.sh vote "docs-team" "$REQUEST_ID" yes
```

---

## Veto Protocol (security-team)

```bash
# security-team discovered a gate bypass in the PR — issue veto
bash core/scripts/swarm-orchestrator.sh vote "security-team" "$REQUEST_ID" no
# This triggers the veto path in tally:
#   1. VETO broadcast to all agents
#   2. Initiating agent receives exit 2
#   3. Logged to releases/logs/swarm.log

# Output:
# [bus] VETO issued by security-team on 'commit-gate': gate bypass in tool-proxy.sh

# Veto is lifted only by security-team itself:
bash core/scripts/swarm-orchestrator.sh vote "security-team" "$REQUEST_ID" yes
```

---

## TypeScript: Swarm Coordination Client

```typescript
import { execSync, spawn } from 'child_process'

class SwarmCoordinator {
  async requestConsensus(subject: string, payload: object): Promise<string> {
    const payloadJson = JSON.stringify(payload)
    const result = execSync(
      `bash core/scripts/swarm-orchestrator.sh request "${subject}" '${payloadJson}'`
    ).toString().trim()
    return result  // returns request_id
  }

  async castVote(agent: string, requestId: string, decision: 'yes' | 'no' | 'abstain'): Promise<void> {
    execSync(`bash core/scripts/swarm-orchestrator.sh vote "${agent}" "${requestId}" ${decision}`)
  }

  async tally(subject: string): Promise<'approved' | 'rejected' | 'vetoed'> {
    try {
      execSync(`bash core/scripts/swarm-orchestrator.sh tally "${subject}"`)
      return 'approved'
    } catch (e: any) {
      if (e.status === 2) return 'vetoed'
      return 'rejected'
    }
  }

  // Poll until consensus reached or timeout
  async waitForConsensus(subject: string, timeoutMs = 60_000): Promise<'approved' | 'rejected' | 'vetoed'> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const result = await this.tally(subject)
      if (result !== 'rejected') return result
      await new Promise(r => setTimeout(r, 2000))
    }
    return 'rejected'  // timeout = implicit rejection
  }
}

// Rule: always handle 'vetoed' separately from 'rejected' — they have different escalation paths
// Rule: timeout = rejection, not approval (fail-closed consensus)
```

---

## Fan-Out + Aggregate Pattern

```typescript
// Dispatch one task to multiple agents and aggregate results
async function fanOutTask(subject: string, agents: string[], payload: object) {
  const coordinator = new SwarmCoordinator()
  const requestId   = await coordinator.requestConsensus(subject, payload)

  // All agents work independently — collect their RESPONSE messages
  const responses = await Promise.allSettled(
    agents.map(agent =>
      new Promise<{ agent: string; result: unknown }>((resolve, reject) => {
        const checkInbox = setInterval(async () => {
          const msg = execSync(`bash core/bus/agent-message-bus.sh recv "${agent}"`).toString().trim()
          if (msg) {
            clearInterval(checkInbox)
            const parsed = JSON.parse(msg)
            if (parsed.type === 'RESPONSE' && parsed.payload?.request_id === requestId) {
              resolve({ agent, result: parsed.payload })
            }
          }
        }, 1000)
        // Timeout after 30s
        setTimeout(() => { clearInterval(checkInbox); reject(new Error(`${agent} timeout`)) }, 30_000)
      })
    )
  )

  const succeeded = responses.filter(r => r.status === 'fulfilled').map(r => (r as any).value)
  const failed    = responses.filter(r => r.status === 'rejected').map(r => (r as any).reason.message)

  return { succeeded, failed, quorum: succeeded.length > agents.length / 2 }
}

// Rule: Promise.allSettled() — collect ALL results even if some agents fail
// Rule: quorum = majority of agents responded (not all) — some may be offline
```

---

## Anti-Split-Brain Pattern

```typescript
// Split-brain: two agents both think they're the leader and issue conflicting actions
// Prevention: only the agent that initiated the request can act on its approval

class SwarmLeaderLock {
  private static activeRequests = new Map<string, string>()  // subject → requestId

  static acquire(subject: string, requestId: string): boolean {
    if (SwarmLeaderLock.activeRequests.has(subject)) {
      console.error(`[swarm] Split-brain blocked: ${subject} already has active request`)
      return false
    }
    SwarmLeaderLock.activeRequests.set(subject, requestId)
    return true
  }

  static release(subject: string): void {
    SwarmLeaderLock.activeRequests.delete(subject)
  }
}

// Rule: only ONE request per subject can be open at a time
// Rule: lock released in finally block (even on veto/rejection)
// Rule: request timeout = implicit lock release (prevents deadlock)
```

---

## Anti-Fake-Pass Checklist

```
❌ Consensus proceeds without checking for veto messages (veto ignored)
❌ Timeout treated as approval instead of rejection (fail-open consensus)
❌ Advisory votes (Tier 4) counted as blocking votes
❌ Same subject has two open requests simultaneously (split-brain)
❌ Veto lifted by a lower-tier agent (only security-team can lift its own veto)
❌ Fan-out uses Promise.all() instead of allSettled() (one failure aborts all results)
❌ Lock not released in finally block (deadlock on next request for same subject)
❌ swarm-orchestrator.sh exit code not checked (approved/rejected/vetoed conflated)
```
