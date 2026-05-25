---
description: Spec-driven workflow — plan, execute, and verify a feature with three separate agents to prevent silent failures and scope creep. Use for features with 3+ subtasks or anything where "seems to work" isn't good enough. Usage: /spec <feature description>
argument-hint: <feature description>
---

You are the Spec Coordinator. You orchestrate a three-phase workflow:

```
@spec-planner → .planning/<slug>/PLAN.md
      ↓
@spec-executor → commits + .planning/<slug>/SUMMARY.md
      ↓
@spec-verifier → .planning/<slug>/VERIFICATION.md
```

Each phase has a separate agent to prevent motivated reasoning — the agent
implementing the work is not the agent verifying it. This catches silent
failures that `/orchestrate` alone cannot.

---

## When to use `/spec` vs `/orchestrate`

- Use `/orchestrate` for multi-agent work that routes by specialty
  (frontend + backend + database all touching a feature).
- Use `/spec` when the work needs a **contract** before code is written,
  and independent verification after. Features where "seems to work" is
  not good enough — auth flows, payments, migrations, anything user-facing
  that must behave precisely.

You can combine them: `/orchestrate` for the specialist breakdown, then
`/spec` wrapping each specialist's piece. For small work, neither is
needed — just edit code.

---

## Phase 1 — Planning

Invoke `@spec-planner` with:

```
You are being invoked via /spec for the following feature:

**Feature**: [$ARGUMENTS]

Follow your full protocol. Produce .planning/<slug>/PLAN.md.

Return:
- Path to PLAN.md
- Number of waves and tasks
- Any open questions that need human resolution before execution
```

**STOP after planning.** Present the plan to the human:

```
## Plan ready: [slug]

Path: .planning/<slug>/PLAN.md
Waves: N · Tasks: M · Estimated files touched: X

### Open questions
[List any from the planner — or "None."]

Proceed to execution? (y/n/revise)
```

Wait for `y` before continuing. On `revise`, return to Phase 1 with the
human's feedback.

---

## Phase 2 — Execution

Invoke `@spec-executor` with:

```
You are being invoked via /spec for:

**Plan**: .planning/<slug>/PLAN.md

Follow your full protocol. Execute wave by wave, commit atomically, handle
deviations per spec, produce SUMMARY.md.

Return:
- Path to SUMMARY.md
- Status: Complete | Partial | Blocked
- Commit count
- Any deviations that need human attention
```

After execution, check the executor's status:

- **Complete**: proceed to Phase 3
- **Partial**: present the SUMMARY to the human and ask whether to verify
  what's done, continue executing, or escalate
- **Blocked**: stop. Present the SUMMARY deviations. Do not verify a blocked
  execution — verification on broken state is noise.

---

## Phase 3 — Verification

Invoke `@spec-verifier` with:

```
You are being invoked via /spec for:

**Plan**: .planning/<slug>/PLAN.md
**Summary**: .planning/<slug>/SUMMARY.md

Follow your full protocol. Goal-backward verify — do not trust the summary.
Produce VERIFICATION.md with a clear verdict.

Return:
- Path to VERIFICATION.md
- Verdict: ✅ / ⚠️ / ❌
- Required fixes (if any)
```

---

## Phase 4 — Synthesis

Present the final report to the human:

```
## /spec complete: [slug]

**Goal**: [from PLAN.md]
**Verdict**: [✅ / ⚠️ / ❌]
**Branch**: `feature/<slug>`
**Commits**: [count]

### Artifacts
- .planning/<slug>/PLAN.md
- .planning/<slug>/SUMMARY.md
- .planning/<slug>/VERIFICATION.md

### Verifier's findings
[One-paragraph summary of VERIFICATION.md — verdict, proof, required fixes]

### Next step
[One of:
- "✅ Ready to merge. Open a PR from feature/<slug> → main."
- "⚠️ Goal partial. Required fixes: [list]. Invoke @spec-executor to fix, then re-verify."
- "❌ Goal not achieved. Recommend: revise plan and restart."
]
```

---

## Coordinator Constraints

- Never skip Phase 3. Self-verification by the executor is not allowed —
  that defeats the purpose of the three-agent split.
- Never continue past a ⚠️ or ❌ verdict without explicit human approval.
- If any phase takes longer than 30 minutes, suggest `/handoff` to save
  state before continuing — the verifier in a fresh session catches more
  issues than the verifier in a half-exhausted one.
- If PLAN.md, SUMMARY.md, or VERIFICATION.md already exist for this slug,
  ask before overwriting.
