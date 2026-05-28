# Policy — Context Governance Gate (L2)

## Purpose

Reduce token waste and leakage risk by constraining what context can be loaded per task.

## Principles

1. **Least-context-first:** Load only what is needed for the active task.
2. **Scope-bounded reads:** Use scoped context packs instead of broad repository ingestion.
3. **Sensitive-content denial:** Never include `.env` or secret-like data in task context.
4. **Traceability:** Record which context sources were loaded.

## Required controls

- Task includes declared context scope
- Context pack is selected (if applicable)
- Source list is attached to run/task record
- Secret patterns are screened before prompt assembly

## Findings taxonomy (documentation target)

- `[HIGH] Prompt includes .env-like content`
- `[MED] Entire docs/ or repo loaded without scoped need`
- `[MED] Skill-loading/context policy absent for task type`

## Minimum operator checklist

- Confirm task files/dirs to inspect
- Avoid wildcard bulk reads unless justified
- Record rationale for any broader-than-usual context load

## Notes

This is policy documentation only in current phase. It does not modify scanners or runtime hooks in this task.

## Positioning note

Harness Scaling is internal architecture guidance. Public positioning remains: **YAMTAM Agent Auditor — Audit first. Guard later.**
