---
description: Human-gated skill self-improvement loop. Runs a skill against test scenarios, diagnoses failures, proposes ONE change at a time, and waits for human approval before applying anything. Usage: /improve-skill path/to/SKILL.md
argument-hint: <path to SKILL.md>
---

You are running the skill improvement pipeline on: `$ARGUMENTS`

This is a **human-gated loop**. You NEVER edit files without explicit approval
in this session. The Mutator proposes; the human commits.

---

## Before You Start

1. Read `$ARGUMENTS` — understand the skill's stated goal and constraints.
2. If `$ARGUMENTS` is missing or the file does not exist, stop and ask the user.
3. Check if `$ARGUMENTS` is a YAMTAM core file (path contains `core/hooks/`,
   `core/scripts/`, or `gates/`). If so, stop and tell the user:
   > "This is a YAMTAM core file. Changes require a separate approval cycle —
   > do not run /improve-skill on it directly."

State the skill's goal in one sentence before proceeding.

---

## Step 1 — Executor

Design 3–5 test scenarios that cover:
- The happy path (skill used as intended)
- At least one edge case (ambiguous input, missing context, boundary condition)
- At least one failure mode (what the skill was designed to prevent)

If the skill file contains example inputs, use those as scenarios.
If a `.tasks/` directory exists, check for task files that reference this skill.

For each scenario:
- State the input
- Run the skill mentally (or with a real invocation if it's a slash command)
- Judge the output: **pass** (met stated goal) / **fail** (did not meet stated goal)
- One sentence on why

Report:
```
EXECUTOR SCORE: N/M passed

Scenario 1: [input] → PASS — [reason]
Scenario 2: [input] → FAIL — [reason]
...
```

If all scenarios pass (N/M = M/M), skip to the Exit section.

---

## Step 2 — Analyst

For each failing scenario, identify ONE root cause. Choose from:

| Root cause type  | Meaning                                                    |
|------------------|------------------------------------------------------------|
| `missing_example`  | Skill has no example showing this case                   |
| `missing_constraint` | Skill lacks a rule that would prevent this failure     |
| `restructure`    | Instructions are ambiguous or ordered incorrectly          |
| `missing_edge_case` | Skill does not mention this input class at all          |

Pick the ONE root cause that covers the most failures.
Pick the ONE mutation strategy that addresses it.

Report:
```
ANALYST:
  Root cause: [type] — [one sentence explanation]
  Mutation strategy: [add_example | add_constraint | restructure | add_edge_case]
  Covers: [list of failing scenario numbers]
```

---

## Step 3 — Mutator

Describe the exact change in plain text.
Show the diff between current text and proposed text:

```
MUTATOR PROPOSAL:

Location: [section name or line description in the skill file]

CURRENT:
  [exact current text]

PROPOSED:
  [exact proposed text]

Expected effect: [one sentence — why this fixes the root cause]
```

**STOP HERE.** Do NOT apply the change. Do NOT edit the file.
Wait for the human to respond with "approve" or "reject".

---

## Step 4 — Human Gate

**If approved:**
- Apply the exact change described in Step 3 to `$ARGUMENTS`.
- Confirm: "Applied. Re-running Executor…"
- Return to Step 1 with round counter incremented.

**If rejected:**
- Do NOT apply the change.
- Return to Step 2 — Analyst picks the next best mutation strategy.
- If no remaining strategies, report: "No further strategies available for
  current failures. Human intervention required."

---

## Exit Conditions

Stop the loop when any of these is true:

| Condition | Message |
|-----------|---------|
| Score = 100% | "All scenarios pass. Skill improvement complete." |
| Round 5 reached | "Max 5 rounds reached. Final score: N/M. Remaining failures need manual review." |
| Human says stop | "Stopping at human request. Final score: N/M." |

At exit, summarise:
- Rounds completed
- Changes applied (list each, one line per round)
- Final score
- Remaining failures (if any) with suggested next steps

---

## Hard Rules

- **Mutator NEVER edits files without explicit approval in this session.**
- If the score does not improve after applying a change, revert it immediately
  and report: "Score did not improve — reverting change."
- Changes to `core/hooks/`, `core/scripts/`, or `gates/` files require a
  separate approval cycle — do not include them in this pipeline.
- Do not run more than one mutation per round — one change, one test, one verdict.
- Do not ask "should I continue?" between rounds unless the human has not
  responded — keep the loop moving until an exit condition is met.
