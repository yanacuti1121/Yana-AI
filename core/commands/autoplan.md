---
description: Run the full plan-review pipeline against one plan or feature idea — technical red-team, business/PMF review, and structural design review, in sequence — then merge the three verdicts into one consolidated recommendation. Usage: /autoplan <plan description or path>
argument-hint: <plan description, feature idea, or path to a plan document>
model: opus
---

You are running `/autoplan` on `$ARGUMENTS`. This command adds no review
logic of its own — it orchestrates three existing review commands in
sequence and merges their output. If any of the three ever needs a fix,
fix it in its own file (`challenge.md`, `plan-ceo-review.md`,
`arch-design-review.md`), not here — duplicating their logic in this file
would create a second, differently-tuned reviewer that could quietly
disagree with the one this repo already trusts.

## Why sequential, not parallel

Each review lens is independent, but running them in sequence (not as
parallel subagent dispatches) means each later review can read the
artifacts the earlier ones produced — `/plan-ceo-review` explicitly checks
`docs/challenges/` for a prior `/challenge` verdict before writing its own,
and the final merge step here depends on all three having already
completed and written/reported their verdicts.

---

## Phase 1 — Technical Red-Team

Run `/challenge $ARGUMENTS` by following the full instructions in
`core/commands/challenge.md` against `$ARGUMENTS`. Let it write its own
`docs/challenges/YYYY-MM-DD-<slug>.md` and produce its own verdict. Do not
skip its Phase 1 grounding step (reading `PRD.md`, `docs/technical/
ARCHITECTURE.md`, `docs/technical/DECISIONS.md`, `SOUL.md`) — a review
run through the orchestrator gets the same rigor as one run standalone.

If `challenge.md`'s own Phase 1 stops and asks the human for missing
scope (persona, success metric, what it replaces), stop the entire
`/autoplan` run here and surface that question — do not guess the missing
details yourself just to keep the pipeline moving. A red-team run on a
guessed-at scope produces a verdict that doesn't mean anything.

Record the verdict and the path to the written document before continuing.

## Phase 2 — Business / PMF Review

Run `/plan-ceo-review $ARGUMENTS` by following the full instructions in
`core/commands/plan-ceo-review.md` against `$ARGUMENTS`. It will look for
the `docs/challenges/` document Phase 1 just wrote — that's expected and
correct, not a duplicate step. Let it write its own
`docs/ceo-reviews/YYYY-MM-DD-<slug>.md` and produce its own verdict.

Same stop condition as Phase 1: if it asks the human for missing details
(target persona, problem severity, success definition), stop here and
surface the question rather than guessing.

Record the verdict and the path to the written document before continuing.

## Phase 3 — Structural Design Review

Run `/arch-design-review $ARGUMENTS` by following the full instructions in
`core/commands/arch-design-review.md` against `$ARGUMENTS` (or the
relevant module/component the plan implies, if `$ARGUMENTS` names one).
This one produces its report inline rather than as a written file — record
its Architecture Score and its CRITICAL/WARNING concerns before continuing.

If `$ARGUMENTS` is a brand-new feature with no existing code to point
`arch-design-review.md` at yet (nothing to review structurally because
nothing has been built), say so plainly and skip this phase with a
one-line note in the merged report — do not fabricate a design review of
code that doesn't exist.

## Phase 4 — Merge

Produce one consolidated report. Use this exact structure:

```markdown
# Autoplan Review — [Plan/Feature name]

> Opened: [YYYY-MM-DD] · Reviewer: Opus (autoplan pipeline)
> Plan: [one-line summary of $ARGUMENTS]

## Verdicts at a Glance

| Lens | Verdict | Document |
|---|---|---|
| Technical (`/challenge`) | [verdict emoji + label] | [path, or "skipped — see note"] |
| Business (`/plan-ceo-review`) | [verdict emoji + label] | [path, or "skipped — see note"] |
| Structural (`/arch-design-review`) | [Architecture Score N/5, or "skipped — see note"] | inline (see Phase 3 notes above) |

## Agreement Check

[State plainly whether the three verdicts agree or conflict. A plan can be
technically sound and a bad business bet, or vice versa, or structurally
weak but still worth building as a quick pilot — these are different
questions and a real disagreement here is a genuine, useful signal, not
an error to paper over. If any two lenses disagree, name the disagreement
explicitly rather than picking one to report.]

## Consolidated Recommendation

Choose one overall call, informed by all three lenses — not a simple
majority vote, since a single Reject on any lens (especially Business or
Security-flavored technical findings) can outweigh two Proceeds:

- **⚠️ Do not proceed** — any lens returned Reject, or the combination of
  concerns across lenses is disqualifying even if no single lens rejected
  outright
- **🔧 Rework required** — proceed only after [specific fixes, drawn from
  whichever lens(es) raised them]
- **✅ Proceed with caveats** — worth building if [consolidated list of
  open questions/conditions from all three lenses] are resolved
- **✅ Proceed** — all three lenses are clear (rare — this requires an
  actual Proceed-without-caveats from all three, not just an absence of
  Reject)

## Consolidated Open Questions

[Merge the open-questions lists from Phase 1 and Phase 2 (Phase 3 doesn't
produce its own open-questions section) into one deduplicated list, capped
at 8 total. If the combined list exceeds 8, that itself is a signal the
plan isn't mature enough to act on yet — say so instead of arbitrarily
trimming to fit.]
```

---

## Phase 5 — After Writing

1. Show the paths to both underlying documents (`docs/challenges/...`,
   `docs/ceo-reviews/...`) alongside the consolidated report.
2. State the consolidated recommendation in one sentence.
3. Do **not** modify `PRD.md` or `TODO.md` — same rule as both underlying
   commands. `/autoplan` produces a decision-ready artifact; the human
   decides what happens next.
4. If the human wants to act on a Proceed/Proceed-with-caveats verdict,
   remind them (matching `challenge.md`'s own Phase 3 reminder):
   > "To add this to the backlog, use `@project-manager` to register it
   > formally in `PRD.md` and `TODO.md`."

---

## Orchestrator Constraints

- **Never skip a phase silently.** If a phase is skipped (missing scope,
  no existing code to review structurally), say so explicitly in the
  merged report — a missing lens is different from a passing one.
- **Never soften a Reject into a Rework-required in the merge.** If any
  underlying review returned Reject, the consolidated recommendation
  reflects that; don't average it away.
- **Never re-run a phase's logic here.** If a phase's own instructions
  say to stop and ask the human, stop the whole pipeline — don't
  paper over the gap by guessing on that command's behalf.
- **Never treat this as a substitute for running the three commands
  individually when only one lens is actually needed.** `/autoplan` is
  for when a plan genuinely needs all three; a small change that clearly
  only needs a technical read should just get `/challenge` on its own.
