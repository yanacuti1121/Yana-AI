# YAMTAM ENGINE — L3 Truth Gate

**Version:** 1.0
**Status:** Active spec — enforced via AI prompt template
**Layer:** L3 of YAMTAM Memory Pipeline
**Purpose:** Prevent agent overclaim by requiring evidence before claim verbs.

---

## Problem

Agents say "done", "passed", "clean" without showing evidence.

Bad:
  "Build passed."          no output shown
  "Tests are clean."       no test runner output
  "Already fixed."         no commit/diff shown
  "I deployed it."         no deploy log shown

---

## Claim Verbs — Require Evidence Before Use

done, finished, complete, completed,
passed, passing, clean, working,
fixed, resolved, ready,
merged, pushed, deployed, released, shipped,
verified, confirmed, tested, validated

---

## Strong Evidence (sufficient)

- git status output
- git diff output
- git log output
- git push stdout
- File contents shown
- Test runner output with counts
- CI pipeline log
- Deploy command stdout
- PR/remote state

## Weak Evidence (NOT sufficient)

- TODO.md checkbox
- MEMORY.md / BRAIN_DUMP.md content
- Old checkpoint files
- Previous agent message saying "I did it"
- Task file with "status: done"

---

## Required Evidence by Claim

| Claim | Minimum required |
|---|---|
| done / finished | diff + file or test verify |
| passed / clean | test runner output in same response |
| pushed | git push stdout OR remote ref |
| deployed | deploy output + health check |
| fixed | before + after + verify |
| merged | git log showing merge commit |

---

## Fallback Phrasings (when evidence unavailable)

claimed      "TODO.md claims this is done — unverified."
reportedly   "Reportedly fixed, no commit found to confirm."
expected     "Expected to pass — not re-verified this session."
unverified   "Build status unverified — no recent CI output."

---

## Examples

WRONG: "The keyboard fix is done."
RIGHT: "Keyboard fix verified — commit #004 in git log, build clean."

WRONG: "Tests passed."
RIGHT: "Tests claimed passing per TODO.md — unverified this session.
        Run: .claude/tests/hooks/run-hook-tests.sh to confirm."

WRONG: "Already deployed."
RIGHT: "Deployment unverified — no deploy log in this context."

---

## Apply to AI Prompt

Add this block to your AI prompt template:

  Before using: done / finished / passed / clean / fixed /
  pushed / deployed / merged / verified

  You MUST show strong evidence (git output, test output,
  file content, CI log) in the same response.

  If evidence unavailable, use: claimed / reportedly /
  expected / unverified.

  Never say "done" based only on TODO.md, MEMORY.md,
  or your own previous message.

---

## Future Hook (Phase 2, not now)

Spec for future implementation:
  .claude/hooks/truth-gate-guard.sh

Scans agent output for claim verbs, blocks if no evidence pattern detected.
Currently enforced via prompt only.
