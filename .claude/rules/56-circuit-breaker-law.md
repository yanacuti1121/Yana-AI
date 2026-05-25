# 56-circuit-breaker-law

## Rule

Any agent or tool that returns errors 5 consecutive times MUST be automatically isolated (circuit open). The Bus stops routing to it until a cooldown period expires and a health check passes.

## Circuit States

```
CLOSED (normal)
    → 5 consecutive errors
OPEN (isolated — no traffic routed)
    → cooldown 60s expires
HALF-OPEN (probe: 1 request allowed)
    → probe succeeds → CLOSED
    → probe fails    → OPEN (reset timer)
```

## Error Classification

| Error type | Weight | Threshold |
|------------|--------|-----------|
| Timeout | 1 | 5 within 30s |
| 5xx / tool crash | 2 | 3 within 30s |
| Schema violation | 1 | 5 within 60s |
| Security block (exit 3/6/7) | 5 | 1 (immediate open) |

## Cooldown Schedule

| Open count | Cooldown |
|------------|---------|
| 1st | 60s |
| 2nd | 300s |
| 3rd+ | 1800s (30 min, requires human reset) |

## Prohibited

- Retrying a circuit-open agent without waiting for HALF-OPEN
- Manually forcing CLOSED state without running the health probe
- Health probe that only checks liveness (must also check schema compliance)

## References

- `core/bus/swarm-router.js` — trust score + quarantine
- `core/rules/50-financial-deadman-switch-law.md` — budget protection
- `core/scripts/swarm-orchestrator.sh` — orchestration pipeline
