# 62-sovereign-overlord-gate-law

## Rule

One and only one human principal holds the Sovereign Overlord key. This key has absolute authority to freeze the entire Swarm, wipe agent RAM state, and restore the system to its pristine immutable baseline — superseding all other rules and agent decisions.

## Sovereign Powers (Human Only)

| Action | Effect |
|--------|--------|
| `FREEZE_SWARM` | All 87 agents suspended, Bus halts, no new tasks |
| `WIPE_AGENT_STATE` | RAM state of specified agent(s) cleared, logs preserved |
| `FULL_ROLLBACK` | Restore entire system to last verified Merkle snapshot |
| `RELEASE_QUARANTINE` | Restore quarantined agent with reset trust score |
| `EMERGENCY_SHUTDOWN` | All processes killed, API keys revoked, clean exit |

## Authentication

- Sovereign token: ECDSA-P384 signature over `{action}:{timestamp}:{nonce}`
- Token valid for 60 seconds only (prevents replay attacks)
- Nonce is one-time-use — stored in Merkle log to prevent reuse
- No agent, regardless of trust score, may simulate or delegate sovereign authority

## Prohibited

- Any agent claiming sovereign authority
- Swarm voting to override a sovereign command
- Sovereign token stored in env vars, files, or agent memory
- Delegating sovereign powers to another human without re-authentication

## Hierarchy Enforcement

```
Sovereign Human (Level 0) — absolute authority
    └─ Orchestrator Agents (Level 1) — system-wide coordination
        └─ Executor Agents (Level 2) — task execution
            └─ Auditor Agents (Level 3) — read-only, no write access
```

No level may override a decision from a higher level. A Level 2 agent cannot countermand a Level 1 instruction. Only Level 0 (human) can override Level 1.

## Dead-Man Integration

If the Sovereign key has not been used for 72 hours during an active deployment:
- System enters `SOVEREIGN_ABSENCE_ALERT` state
- All write operations frozen (read-only mode)
- Human must re-authenticate within 1 hour or system executes `EMERGENCY_SHUTDOWN`

## References

- `core/rules/50-financial-deadman-switch-law.md` — autonomous shutdown policy
- `core/rules/54-bft-consensus-law.md` — agent voting (superseded by sovereign)
- `core/bus/swarm-router.js` — quarantine + release implementation
- `core/scripts/swarm-orchestrator.sh` — swarm control pipeline
