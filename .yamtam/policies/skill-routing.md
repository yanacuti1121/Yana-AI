# Policy — Skill Routing Gate (L2.5)

## Purpose

Route each task to the minimum viable skill/toolset to reduce noise, token cost, and wrong-path execution.

## Routing baseline

- Small/simple task: no skill or one focused skill
- CI failure task: CI triage-focused routing
- Release task: release guard + truth verification path
- Security-sensitive task: security + destructive guard path
- Docs-only task: avoid runtime-heavy/test-heavy skill bundles

## Routing requirements

1. Task type classification is explicit.
2. Selected skill set is justified in one line.
3. Over-provisioned skill selections are flagged.
4. Destructive-capable paths require guard mapping.

## Findings taxonomy (documentation target)

- `[LOW] Too many skills for docs-only task`
- `[MED] Missing routing policy for security task`
- `[HIGH] Destructive path lacks guard mapping`

## Notes

This is policy documentation only in current phase. It does not add or change skills in this task.

## Positioning note

Harness Scaling is internal architecture guidance. Public positioning remains: **YAMTAM Agent Auditor — Audit first. Guard later.**
