# 50-financial-deadman-switch-law

## Rule

If no human-authorized interaction is detected within 30 minutes of continuous autonomous agent runtime, the system MUST automatically suspend all API connections and halt outbound LLM requests.

## Enforcement

- `YAMTAM_DEADMAN_TTL` env var sets the timeout (default: 1800 seconds)
- Swarm Bus monitors last human-approval timestamp per session
- On timeout: all agents transition to `SUSPENDED` state; Bus stops routing
- Resume requires explicit human token (`YAMTAM_RESUME_TOKEN`)

## Prohibited

- Any autonomous loop exceeding `YAMTAM_DEADMAN_TTL` without human checkpoint
- Agent self-renewal of approval token
- Bypassing the dead-man window by spoofing heartbeat timestamps

## Triggers

| Condition | Response |
|-----------|----------|
| TTL elapsed, no human interaction | Suspend all API calls, log `DEADMAN_TRIGGER` |
| Token budget > 80% consumed | Emit `BUDGET_ALERT`, require human confirmation to continue |
| >5 consecutive LLM errors | Circuit break, suspend, alert |

## Rationale

Unchecked autonomous loops can exhaust API budgets, generate unreviewed output, or cascade failures across 87 agents without any human being aware. The dead-man switch ensures human oversight is structurally enforced, not optional.

## References

- `core/rules/43-resource-quota-law.md` — per-agent resource limits
- `core/bus/swarm-router.js` — quorum + heartbeat enforcement
