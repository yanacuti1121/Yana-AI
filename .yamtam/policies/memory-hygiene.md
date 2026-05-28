# Policy — Memory Hygiene Gate (L3.8)

## Purpose

Prevent stale, source-less, or evidence-free memory from driving execution decisions.

## Requirements for memory-derived decisions

Each memory record used for action should include:

1. Decision statement
2. Date (or date range)
3. Source reference
4. Evidence pointer (if claiming fix/verification)
5. Freshness note for production-impacting rules

## Findings taxonomy (documentation target)

- `[MED] Memory decision missing date or source`
- `[HIGH] Stale production rule used without refresh`
- `[MED] Handoff claims fixed/verified without evidence`

## Freshness guidance

- Time-sensitive operational rules should be re-validated before use.
- Older memory can remain as historical context but should be marked stale if superseded.

## Notes

This is policy documentation only in current phase. It does not alter memory runtime behavior in this task.

## Positioning note

Harness Scaling is internal architecture guidance. Public positioning remains: **YAMTAM Agent Auditor — Audit first. Guard later.**
