# 57-canary-deployment-law

## Rule

New skills, rules, and gate files MUST be deployed in canary mode first — active for ≤1% of tasks — before full rollout. Automated rollback triggers if error rate rises above baseline within the observation window.

## Canary Pipeline

```
New skill written to core/skills/<name>/SKILL.md
        ↓
Canary flag set: YAMTAM_CANARY=1, YAMTAM_CANARY_RATE=0.01
        ↓
For 1% of incoming tasks: route through new skill
        ↓
Observe for 30 min:
  - Error rate vs baseline
  - Hallucination score (semantic checker)
  - Trust score impact on routing agents
        ↓
If delta > +2% errors OR hallucination > 0.15:
  AUTO-ROLLBACK → restore previous version
Else:
  PROMOTE → full rollout
```

## Rollback Trigger Conditions

| Signal | Threshold | Action |
|--------|-----------|--------|
| Error rate increase | > +2% vs baseline | Immediate rollback |
| Hallucination score | > 0.15 | Rollback + flag for review |
| Trust score drop | > −10 avg across agents | Rollback |
| Security block rate | Any increase | Rollback + security audit |

## Prohibited

- Deploying a new skill directly to 100% traffic without canary phase
- Canary observation window shorter than 15 minutes
- Disabling rollback checks via env var override without human authorization

## Semantic Canary Checks

Before promoting, the hallucination telemetry checker scores the skill output:
- Factual consistency with known-good responses: must be ≥ 0.85
- Schema compliance rate: must be 100%
- Latency regression: must be < +20% vs baseline P95

## References

- `core/rules/56-circuit-breaker-law.md` — error threshold handling
- `core/rules/49-immutable-infrastructure-law.md` — deploy surface policy
