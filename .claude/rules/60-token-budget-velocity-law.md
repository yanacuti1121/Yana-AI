# 60-token-budget-velocity-law

## Rule

Token consumption MUST be estimated before each LLM request, capped per sliding window, and allocated via a hierarchical credit tree. Requests that would exceed budget are rejected before the API call is made.

## Budget Hierarchy

```
Global daily budget (YAMTAM_DAILY_TOKEN_BUDGET)
    └─ Orchestrator pool (40%)
        └─ Per-orchestrator cap
    └─ Executor pool (50%)
        └─ Per-agent cap (YAMTAM_AGENT_TOKEN_CAP, default: 5000/session)
    └─ Reserve (10%) — emergency rollback + auditor agent
```

## Velocity Caps

| Window | Max tokens | Action on exceed |
|--------|-----------|-----------------|
| 10s | 2,000 | Backoff + log |
| 60s | 8,000 | Throttle, require human approval |
| 300s | 20,000 | Auto-suspend agent session |

## Pre-request Estimation

Before every LLM call, the gateway MUST:
1. Count input tokens (tiktoken or claude token counter)
2. Estimate output tokens based on task complexity tier
3. Check: `estimated_total + session_used ≤ agent_cap`
4. Reject if over budget, log `BUDGET_EXCEEDED`

## Prompt Injection Cost Attack Detection

Flag any prompt where:
- Same phrase repeated > 50 times
- Total input tokens > 80% of agent cap in a single request
- Unusual Unicode density suggesting character stuffing

Response: reject request, penalize agent −20 trust points.

## Financial Dead-Man Integration

If daily budget > 80% consumed, enforce rule 50 (dead-man switch): require human confirmation before any further API calls.

## Prohibited

- LLM calls without pre-estimation
- Agent self-increasing its token cap via env var manipulation
- Splitting one large request into many small ones to evade velocity caps (burst detection applies)

## References

- `core/rules/50-financial-deadman-switch-law.md` — session-level shutdown
- `core/rules/resource-quota-law.md` — memory and CPU quotas
- `core/bus/swarm-router.js` — per-agent tracking
