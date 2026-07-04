# 56-circuit-breaker-law

**Status:** REVIEWED (rewritten 2026-07-04 — see "What changed" below)

## Rule

Any tool that returns errors repeatedly in a short window MUST be automatically blocked (circuit open) until a cooldown expires and a health-check probe passes. This is real and enforced today — the mechanics below match the actual hooks, not a design sketch.

## Real Enforcement

| Hook | Scope | State file |
|---|---|---|
| `core/hooks/per-tool-circuit-breaker.sh` | Per tool name (e.g. `Bash`, `WebFetch`) | `.claude/state/per-tool-circuit.jsonl` |
| `core/hooks/token-budget-guard.sh` (native fast path: `src/guard/token_budget.rs`) | Loop/fix-attempt detection | `core/memory/L2_session/circuit-state.json` |

Both hooks are live in `.claude/settings.json`'s `PreToolUse` matcher — confirmed by grep against the file directly, not assumed from the scripts' own comments.

## Circuit States (real, matches both hooks' actual code)

```
CLOSED (normal)
    → MAX_FAILURES consecutive errors (default 5)
OPEN (blocked — tool call denied)
    → cooldown expires
HALF-OPEN (1 probe call allowed)
    → probe succeeds → CLOSED
    → probe fails    → OPEN (cooldown escalates)
```

## Cooldown Schedule

| Open count | Cooldown |
|------------|---------|
| 1st | 60s (`YANA_CIRCUIT_COOLDOWN_INITIAL`) |
| Escalating | up to 1800s (`YANA_CIRCUIT_COOLDOWN_MAX`), adaptive backoff between |

Bypass: `YANA_CIRCUIT_BYPASS=1` (per-tool-circuit-breaker.sh) / `YANA_BUDGET_BYPASS=1` (token-budget-guard.sh) — sovereign-only per `human-gate-policy.md`.

## Prohibited

- Retrying a circuit-open tool without waiting for the cooldown/HALF-OPEN probe
- Manually forcing CLOSED state by editing the state file instead of letting the probe pass
- Setting a bypass env var to skip a circuit that's OPEN because of repeated failures, rather than fixing the underlying cause

## References

- `core/hooks/per-tool-circuit-breaker.sh`, `core/hooks/token-budget-guard.sh` — the two real hooks
- `core/rules/50-financial-deadman-switch-law.md` — the autonomous-session counterpart (rewritten 2026-07-03 for the same reason this file was rewritten 2026-07-04)
- `core/rules/human-gate-policy.md` — bypass authorization

## What changed

Before this rewrite, the rule was accurate about the state machine and thresholds (both matched real code even then) but framed enforcement as "The Bus stops routing to it" and cited `core/bus/swarm-router.js` ("trust score + quarantine") and `core/scripts/swarm-orchestrator.sh` ("orchestration pipeline") as the enforcing mechanism. Neither is automatically invoked by anything — `swarm-router.js` is optional manual tooling for coordinating separate concurrent sessions (see `agent-communication-policy.md`, rewritten 2026-07-03), and `swarm-orchestrator.sh` is a manual CLI, not a hook. The actual enforcement was always the two hooks in the table above; this rewrite just points at them instead of a fictional bus.
