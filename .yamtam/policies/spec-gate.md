# Policy — Spec Gate (L0.5)

## Purpose

Prevent implementation from starting when task intent and acceptance boundaries are unclear.

## Applies to

- Any task expected to produce code/docs changes beyond trivial typo edits
- Any task at risk level L1+

## Required task spec fields

A task specification MUST include:

1. Goal
2. In-scope and out-of-scope boundaries
3. Acceptance criteria
4. Verification/test plan
5. Owner
6. Created date

Recommended for L2+ tasks:

- Rollback plan
- Explicit risk level

## Gate behavior (documentation target)

- Missing acceptance criteria: **HIGH** finding
- Missing verification plan: **HIGH** finding
- Missing scope boundaries: **HIGH** finding
- Missing rollback note for risky tasks: **MED** finding

## Output expectations

For each rejected/flagged task, include:

- Missing fields list
- Suggested minimal fix
- Re-check instruction

## Notes

This is policy documentation only in current phase. It does not add runtime hooks in this task.

## Positioning note

Harness Scaling is internal architecture guidance. Public positioning remains: **YAMTAM Agent Auditor — Audit first. Guard later.**
