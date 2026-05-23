# Session Safety Gate
**Layer:** L2.5 — Autonomous Session Guard  
**Type:** Advisory + Hard stop on CRITICAL  
**Enforced by:** `core/hooks/risk-scorer.sh`, `core/hooks/token-budget-guard.sh`

---

## Purpose

When an AI agent runs autonomously — without a human watching each step — the normal confirmation loop is broken. This gate defines the conditions under which the agent MUST stop and check in with the sovereign, even without being asked.

Think of it as a dead man's switch for autonomous sessions.

---

## Stop conditions (agent MUST pause and report)

The agent must stop, write a status report, and wait for human input when ANY of the following is true:

### Hard stops (non-negotiable)
| Condition | Why |
|-----------|-----|
| Risk scorer returns CRITICAL (score ≥ 85) | Action is too dangerous to proceed without approval |
| Secret/credential file in any write path | Potential credential leak — requires explicit awareness |
| Deploy command detected without human in session | No autonomous deploys |
| `git push` or `git push --force` attempted | No autonomous pushes to remote |
| Any `DROP TABLE`, `DELETE FROM` without WHERE | Bulk data loss — requires explicit approval |
| Hook blocked same tool call 3+ times | Agent is stuck in a loop |

### Soft stops (report and ask, then continue if no response in 2 minutes)
| Condition | Action |
|-----------|--------|
| Risk scorer returns HIGH (score 60–84) | State scope, state rollback plan, then proceed |
| Trust score < 60 | Flag degraded trust, request human review |
| Token budget > 80K in session | Report cost, ask to continue or wrap up |
| Context window > 75% used | Suggest wrapping up, finishing current task only |
| 20+ tool calls with no checkpoint | Checkpoint immediately |

---

## Check-in message format

When a hard stop triggers, output exactly:

```
⛔ SESSION SAFETY GATE — STOP

Condition triggered: [condition name]
Detected at: [timestamp]
Last action: [tool / command]
Session checkpoint: [latest checkpoint ID or "none"]

What was I doing: [1-2 sentences]
Why I stopped: [specific reason from the condition above]

To continue: [explicit instruction for sovereign]
To rollback: bash core/scripts/session-rollback.sh --list
```

Do NOT output anything else. Do NOT continue the task. Do NOT retry the blocked action.

---

## Recovery

After a hard stop, the sovereign may:

1. **Approve and continue:** "Continue" or "Proceed with [modified instruction]"
2. **Rollback:** `/rollback` to restore to last checkpoint
3. **Abort session:** `/wrap-up` to summarize and close

The agent resumes ONLY after explicit instruction from the sovereign.

---

## What this gate does NOT do

- Does not replace the Truth Gate (evidence for claims)
- Does not replace the Action Gate (L0–L5 risk levels)
- Does not apply to read-only operations
- Does not apply to test runs that don't modify source files

---

## Relationship to other gates

```
PreToolUse  → risk-scorer.sh          (scores every action)
PreToolUse  → token-budget-guard.sh   (circuit breaker)
PreToolUse  → scope-guard.sh          (boundary enforcement)
PostToolUse → session-checkpoint.sh   (automatic snapshots)
Stop        → truth-gate-guard.sh     (evidence for claims)
           ↓
       Session Safety Gate (this document)
       — defines WHEN to stop
       — defines HOW to report
       — defines HOW to recover
```
