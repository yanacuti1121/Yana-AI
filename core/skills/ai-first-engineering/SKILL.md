---
name: ai-first-engineering
description: >
  Engineering practices for teams where AI generates most code.
  Use when planning architecture for AI-assisted projects, defining code review
  standards for AI-generated code, structuring requirements for agent handoff,
  or asking "how do we work with AI at scale?", "our AI code keeps breaking",
  "agents keep misunderstanding requirements", "how to review AI output".
  Do NOT use for one-off AI prompting or pure manual codebases.
origin: adapted:affaan-m/ECC
license: MIT © ECC contributors
version: 1.0.0
compatibility: "Any stack. Practices are language-agnostic."
---

<!-- Adapted from ECC ai-first-engineering (MIT © affaan-m). Changes: added YAMTAM fields, condensed, added Anti-Fake-Pass checks. -->

## When to Use

- Use when: AI generates >30% of new code on the team
- Use when: recurring bugs in the same files/areas despite fixes
- Use when: agents misunderstand requirements repeatedly
- Use when: code review process wasn't designed for generated code

## Core Shift

In AI-first teams:
- **Planning quality** matters more than typing speed
- **Test coverage** matters more than implementation speed
- **Explicit contracts** matter more than implicit conventions
- **Acceptance criteria** matter more than story points

## Architecture for AI Agents

Design code so agents can navigate it reliably:

```
✓ Explicit module boundaries — clear import paths, no implicit globals
✓ Typed interfaces at every boundary — agents follow types, not conventions
✓ Stable contracts — rename carefully; agents break on renamed functions
✓ Small files — agents context-window out on 500+ line files
✓ One responsibility per file — agents over-generalize in catch-all files
✗ Barrel index.ts with 50 re-exports — agents import wrong things
✗ Implicit side effects on import — agents can't reason about order
✗ Magic strings/numbers — agents copy the wrong value
```

## Requirements for Agent Handoff

Before handing a task to an agent:
1. **One clear deliverable** — "Add X to Y" not "improve the auth flow"
2. **Acceptance criteria as test cases** — "passes these 3 tests" beats "works correctly"
3. **Explicit constraints** — "touch only these files", "do not change the public API"
4. **Failure definition** — "if you can't do X without touching Y, stop and report"

## Code Review for AI Output

AI-generated code review focuses on **behavior**, not style:
- [ ] Does it handle the edge cases a human would remember?
- [ ] Are security assumptions correct (auth checks, input validation)?
- [ ] Does it regress any existing behavior?
- [ ] Are error states handled (not just happy path)?
- [ ] Did it touch files outside declared scope? (scope drift)

Style, formatting, naming — let the linter handle it. Don't waste review on what tools enforce.

## Regression Strategy

When AI fixes a bug, immediately write a regression test:
```
Bug found in X → Write failing test for X → Apply fix → Test passes → Commit both
```
Never trust "AI reviewed its own work" — same model carries same blind spots into both steps.

## Anti-Fake-Pass

```
❌ Calling requirements "clear" when they have no acceptance criteria
❌ Reviewing AI output for style instead of behavior
❌ No regression test after an AI-introduced bug is fixed
❌ Architecture with implicit conventions AI can't read from types
✅ Every requirement answered: "how do I know this is done?"
✅ Regression test committed alongside every AI bug fix
```
