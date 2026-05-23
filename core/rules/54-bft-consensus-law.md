# 54-bft-consensus-law

## Rule

All write operations to critical infrastructure (MANIFEST.json, core/rules/, core/hooks/, core/gates/) MUST receive affirmative votes from at least 3 independent agents before execution. A single compromised agent cannot unilaterally modify system configuration.

## Voting Protocol (3-of-N BFT)

```
Agent A proposes: "Modify core/rules/01-base-law.md"
        ↓
SwarmRouter broadcasts VOTE_REQUEST to N quorum agents
        ↓
Each voter independently validates:
  - Change is within authorized scope
  - Proposing agent has trust score ≥ 60
  - Change does not violate any existing rule
        ↓
If ≥ 3 YES votes received within 30s window:
  APPROVED → log to Merkle chain → execute
Else:
  REJECTED → log CONSENSUS_FAIL → penalize proposer −10
```

## Prohibited

- Any single agent writing to `core/` paths without consensus
- Vote stuffing (one agent submitting multiple votes via different IDs)
- Bypassing consensus by writing to a temp path and then moving
- Consensus with quarantined or stale agents (heartbeat > 30s)

## Quorum Requirements by Operation

| Operation | Min votes | Voter eligibility |
|-----------|-----------|-------------------|
| Add/modify rule | 3 | trust ≥ 60, role: auditor or orchestrator |
| Modify gate file | 5 | trust ≥ 80, role: orchestrator only |
| MANIFEST version bump | 2 | trust ≥ 70 |
| Emergency rollback | 1 human token | human override |

## Byzantine Tolerance

System tolerates up to `f = (N-1)/3` faulty agents (standard PBFT guarantee). With 87 agents: tolerates up to 28 simultaneous compromised agents.

## References

- `core/bus/swarm-router.js` — quorum enforcement implementation
- `core/rules/agent-hierarchy-law.md` — agent role definitions
- `core/scripts/swarm-orchestrator.sh` — orchestration pipeline
