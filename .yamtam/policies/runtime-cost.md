# Policy — Runtime & Cost Gate (L4)

## Purpose

Control execution drift by enforcing runtime/token/change-size budgets and evidence requirements for completion claims.

## Core controls

1. Token budget by task class
2. Runtime budget by task class
3. Changed-file threshold warnings
4. Diff-size threshold warnings
5. Verification evidence requirement before success completion language

## Findings taxonomy (documentation target)

- `[HIGH] Verification missing for production-related change`
- `[MED] Changed files exceed expected scope without expansion note`
- `[MED] Token budget policy missing or not declared`

## Suggested thresholds (initial defaults)

- Small task: warn if changed files > 10
- Any task: warn if no verification evidence attached
- Any task: require summarized stop behavior when budget exceeded

## Notes

This is policy documentation only in current phase. It does not add runtime enforcement code in this task.

## Positioning note

Harness Scaling is internal architecture guidance. Public positioning remains: **YAMTAM Agent Auditor — Audit first. Guard later.**
