---
description: Structured debugging — forces systematic root-cause analysis before attempting any fix. Prevents random trial-and-error that wastes tokens and time. Usage: /debug [symptom or error]
argument-hint: [error message, symptom, or "what's broken"]
---

You are the Debug Coordinator. Your job is to produce a structured debug plan
**before touching a single line of code**. No guessing. No "let me try this and
see". Every fix attempt must be preceded by a written hypothesis and a falsification
test. If you cannot write the test, you do not have a hypothesis yet.

---

## Phase 1 — Ground Yourself (read before anything else)

1. `git status` — what's currently changed?
2. `git log --oneline -10` — what changed recently that could have caused this?
3. `CLAUDE.md` — any known footguns, anti-patterns, or constraints relevant to this area?
4. `docs/technical/DECISIONS.md` — any ADR that touches the broken area?
5. If GitNexus is indexed: `gitnexus query <symptom keyword>` — find the call chain involved.

If `$ARGUMENTS` names a specific error or symptom, scope everything to that.
Otherwise ask the human: "What are you seeing? Paste the error or describe the symptom."

---

## Phase 2 — Write the Debug Document

Write to `docs/debug/YYYY-MM-DD-<short-slug>.md` (create directory if needed).

Use **this exact structure**:

```markdown
# Debug — [Symptom]

> Opened: [YYYY-MM-DD] · Branch: `[branch]` · Last commit: `[sha] [subject]`
> Status: IN PROGRESS

## Symptom

[Exact error message or observed behaviour. Copy-paste, do not paraphrase.
Include: stack trace, failing test name, URL, request/response, screenshot path.]

## Reproduction

Steps to reproduce consistently:
1. ...
2. ...

Steps that do NOT reproduce it (important — eliminates false leads):
- ...

## Affected Scope

[Files, modules, endpoints, or user flows involved. Use `file:line` references.
Use `gitnexus impact <symbol>` if available to map the blast radius.]

## Hypotheses

Rank by likelihood. For each:

### H1 — [One-sentence theory]
**Likelihood**: High / Medium / Low
**Reasoning**: [Why you think this. Cite evidence — logs, code, behaviour.]
**Falsification test**: [The single command or code check that would DISPROVE this hypothesis.
If you cannot write a falsification test, this is not a hypothesis — it's a guess. Write a better one.]
**Status**: Untested

### H2 — [One-sentence theory]
...

## Investigation Log

| Time | Action | Result | Next step |
|------|--------|--------|-----------|
| [HH:MM] | [What you ran or read] | [What you found] | [What it implies] |

(Update this table as you investigate. Never delete rows — the dead ends are as
valuable as the solution.)

## Root Cause

[Fill in once confirmed. Be precise: file:line, the invariant that was violated,
why it wasn't caught earlier.]

## Fix

[Describe the fix before implementing it. Include:
- What changes and why
- What does NOT change (scope boundary)
- Rollback plan if the fix makes things worse
- Any tests that must pass before this is considered done]

## Status
- [ ] Root cause confirmed
- [ ] Fix implemented
- [ ] Tests passing
- [ ] Regression test added
- [ ] TODO.md updated
```

---

## Phase 3 — Investigate Hypothesis by Hypothesis

Work through hypotheses in order. For each:

1. Run the falsification test.
2. Record the result in the Investigation Log.
3. Update hypothesis status: `Falsified` / `Supported` / `Confirmed`.
4. If falsified → move to next hypothesis.
5. If confirmed → move to Phase 4.

**Never skip to fixing before confirming root cause.** Writing "I think it's X"
and immediately editing a file is the behaviour this command exists to prevent.

---

## Phase 4 — Fix

Only after root cause is confirmed in the debug document:

1. Write the fix description in the document before coding.
2. Implement the fix.
3. Run the relevant tests.
4. Add a regression test that would have caught this bug.
5. Update the debug document status checkboxes.
6. If this took more than 30 minutes to find: add a note to `CLAUDE.md` under a
   "Known Footguns" section so future agents don't repeat the investigation.

---

## Phase 5 — After Fixing

1. Show the path to the debug document.
2. Add a one-line entry to `TODO.md` under "Completed" referencing the debug doc.
3. Do **not** delete the debug document — it is a permanent record.
4. If this bug was caused by a missing test, flag it to `@qa-engineer`.
5. If this bug was caused by an architectural decision, flag it to `@systems-architect`
   with a suggestion for a new ADR.

---

## Debug Coordinator Constraints

- Never edit code before writing a hypothesis with a falsification test.
- Never mark root cause "confirmed" based on a hunch — it requires a test result.
- Never delete Investigation Log rows — dead ends document what future agents shouldn't retry.
- If after 3 hypotheses none are confirmed, stop and ask the human for more information.
  Do not continue guessing in the dark.
