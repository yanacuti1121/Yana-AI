# Context Packs (Internal)

Context packs are curated, task-scoped bundles of references used to keep prompt context focused, lower token usage, and reduce accidental sensitive data intake.

## Goals

- Enforce least-context-first workflow
- Reduce noisy or irrelevant context loading
- Improve traceability of what was read for each task

## Suggested structure

```text
.yamtam/context-packs/
  README.md
  <pack-name>/
    index.md
    include.txt
    exclude.txt
```

## Pack design guidelines

1. Keep each pack task-type specific (docs-only, policy-only, hook-review, etc.).
2. Prefer explicit include lists over broad wildcard patterns.
3. Exclude `.env*`, secrets, credentials, and unrelated large directories.
4. Version packs when their source map changes materially.

## Minimum pack metadata

Each pack `index.md` should describe:

- Pack name and purpose
- Intended task types
- In-scope directories/files
- Explicit exclusions
- Last updated date

## Operational notes

- Harness Scaling context governance is internal architecture guidance.
- Public positioning remains: **YAMTAM Agent Auditor — Audit first. Guard later.**
