# 50-financial-deadman-switch-law

**Status:** REVIEWED (rewritten 2026-07-03 — see "What this rule used to say" below)

## Rule

An autonomous agent session must not run unboundedly without human oversight. In this repo's actual architecture — a single synchronous Claude Code session — that oversight is structural: nothing executes without either a direct human message or an explicitly human-configured wakeup (`ScheduleWakeup`/`CronCreate`, both visible to and set by the human). This rule documents the real mechanisms that bound and surface autonomous runtime, replacing an earlier draft that invented an async "Swarm Bus" monitoring mechanism that was never built.

## Real Enforcement — wired and running today (verified against `.claude/settings.json`)

| Mechanism | File | What it does |
|---|---|---|
| Per-tool-name circuit breaker | `core/hooks/per-tool-circuit-breaker.sh` | PreToolUse hook, live in `.claude/settings.json`. CLOSED/OPEN/HALF_OPEN state tracked per tool name, adaptive backoff (60s→300s→1800s), state in `.claude/state/per-tool-circuit.jsonl` |
| Loop/fix-attempt circuit breaker | `core/hooks/token-budget-guard.sh` (native fast path: `src/guard/token_budget.rs`) | PreToolUse hook, live in `.claude/settings.json`. 5 consecutive failed fix attempts → CLOSED→OPEN→HALF-OPEN circuit break, hard block until cooldown |
| Human-visible scheduling | `ScheduleWakeup` tool | Every scheduled resume carries an explicit reason shown to the human in-session — there is no silent background timer the human can't see |

## Available but not currently auto-invoked

These exist as real, working scripts but are **not** in `.claude/settings.json`'s hooks list as of this writing — verified by grepping the file directly, not assumed from the scripts' own header comments (which describe intended installation, not confirmed installation). Citing them as "what runs today" would repeat the exact overclaim pattern this rewrite exists to eliminate, just at smaller scale.

| Mechanism | File | Status |
|---|---|---|
| Periodic checkpointing | `core/hooks/session-checkpoint-hook.sh` | Script works when invoked; its own header says "Install in settings.json hooks.PostToolUse alongside audit-log.sh" — that installation step was never done. Currently requires the agent to run it manually. |
| Explicit stop conditions | `core/rules/63-autonomous-session-law.md` | A behavioral checklist the agent applies by choice each turn (context >80%, token budget >100K, trust score <60, 3+ consecutive hook blocks, CRITICAL-risk action → stop and report). Real and useful, but self-applied, not hook-enforced — the same category of protection as any other rule in this file, not a stronger guarantee. |

Wiring `session-checkpoint-hook.sh` into `PostToolUse` (making the first row true) is a real option — it's core-lock-pinned already, so it's a one-line settings.json change, not new code — but that's a live-behavior change to every future session, out of scope for a documentation-accuracy pass and left for the maintainer to decide.

## Prohibited

- Continuing autonomous work past a Stop condition in `63-autonomous-session-law.md` without surfacing it to the human first
- Treating a scheduled wakeup as standing authorization to skip the human-gate checks in `human-gate-policy.md` or `git-push-enforcement.md` for the resumed work — authorization is per-action, not a switch left on
- Claiming a budget/circuit-breaker check passed without it having actually run this turn (see `verification.md`'s Iron Law)

## References

- `core/rules/63-autonomous-session-law.md` — the real stop-condition checklist
- `core/rules/56-circuit-breaker-law.md` — circuit breaker state machine (tool-call level)
- `core/rules/resource-quota-law.md` — per-agent CPU/RAM/PID hard limits (this rule previously cited a nonexistent `43-resource-quota-law.md`)
- `core/hooks/token-budget-guard.sh`, `core/hooks/per-tool-circuit-breaker.sh` — the hooks confirmed live in `.claude/settings.json`
- `core/hooks/session-checkpoint-hook.sh` — real script, not currently wired (see table above)

## What this rule used to say

Before this rewrite: an env-var-driven `YANA_DEADMAN_TTL` (default 1800s) monitored by a "Swarm Bus" tracking "last human-approval timestamp per session," transitioning "all agents" to a `SUSPENDED` state on timeout and resumable only via a `YANA_RESUME_TOKEN`, logging a `DEADMAN_TRIGGER` event. None of `YANA_DEADMAN_TTL`, `YANA_RESUME_TOKEN`, or `DEADMAN_TRIGGER` exist anywhere in this repo's code — confirmed by grep across `core/` and `.claude/` returning zero hits outside this rule file itself. The "cascade failures across 87 agents" framing also didn't map to reality: `core/agents/` holds persona definitions dispatched synchronously per `subagent-policy.md`, not 87 concurrently-running processes that could cascade-fail unsupervised.

## Related

- `core/rules/62-sovereign-overlord-gate-law.md` — the human-authority counterpart, rewritten the same day for the same reason
