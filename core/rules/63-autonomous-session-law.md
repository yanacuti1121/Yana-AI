# Rule: Autonomous Session Law
**ID:** 63-autonomous-session-law  
**Priority:** P1 — enforced always  
**Applies to:** any session running > 10 minutes or > 20 tool calls without human interaction

---

## What this rule governs

When an AI agent runs autonomously for an extended period (long coding tasks, multi-file refactors, migration runs), the risk of drift, runaway behavior, and unrecoverable state increases significantly.

This rule defines mandatory behavior for autonomous sessions.

---

## Mandatory checkpoints

**Every 5 tool calls** (or fewer if risk is HIGH/CRITICAL):

```bash
bash core/scripts/session-checkpoint.sh
```

If checkpoint fails for any reason: stop the session and report. Never continue without a checkpoint when one was due.

**On session start:**

```bash
bash core/scripts/session-checkpoint.sh --name "session-start" --force
```

---

## Risk gate before action

**Before any tool call that modifies files:**

1. Mentally score the action (0–100 risk scale)
2. If score ≥ 60 (HIGH): state scope explicitly before proceeding
3. If score ≥ 85 (CRITICAL): stop and request human approval
4. The risk-scorer PreToolUse hook enforces this automatically — do not attempt to bypass it

---

## Mandatory stops

An autonomous agent MUST stop and await human input when:

| Condition | Action |
|-----------|--------|
| Trust score drops below 60 | Stop. Report score. Ask for guidance. |
| 3+ consecutive tool calls blocked by hooks | Stop. Report what was blocked. Ask for guidance. |
| Any single action rated CRITICAL risk | Stop. State the action. Wait for approval. |
| Context window > 80% used | Stop. Run /wrap-up. Start fresh session. |
| Token budget > 100K in session | Stop. Report cost. Ask to continue or split. |
| Unexpected error on a write operation | Stop. Do not retry more than once without reporting. |

---

## Scope discipline

During any autonomous session:

1. **Declare scope before starting** — use `/scope-declare` or state files explicitly
2. **Honor declared scope** — never write files outside the declaration without flagging it
3. **Report scope drift** — if you discover the task requires touching files outside scope, stop and report before touching them

---

## Session wrap-up

Before ending an autonomous session:

1. Run `/checkpoint` to save final state
2. Run `/session-trace` to produce a timeline
3. Write a brief summary of what was completed and what was not
4. Flag any incomplete items or discovered risks for the next session

---

## What autonomous agents may NOT do

- Start a deploy or push operation without explicit approval in the current session
- Delete files without showing the file list first
- Access `.env*` or credential files without flagging it
- Make more than 3 consecutive write operations on production-path files without a checkpoint in between
- Claim "done" or "complete" without running the test suite or showing concrete evidence

---

## Enforcement

This rule is enforced by:
- `core/hooks/session-checkpoint-hook.sh` (PostToolUse)
- `core/hooks/risk-scorer.sh` (PreToolUse)
- `gates/truth_gate.md` (Stop hook)
- `core/hooks/token-budget-guard.sh` (PreToolUse)

Violations are logged to `.claude/state/audit-chain.log`.
