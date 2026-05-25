# core/skills — On-Demand Workflow Knowledge

Skills are structured knowledge files that Claude reads when triggered by a matching user request. They are not hooks (they don't fire automatically) and not agents (they don't spawn sub-processes).

## Rules for working in this directory

- Each skill must have a clear **purpose**, **trigger conditions**, **rules**, **anti-patterns**, and a **verification** step.
- Do not write a skill that duplicates an existing command or agent — check `core/commands/` and `core/agents/` first.
- Skills must not be excessively long. If a skill exceeds ~200 lines of guidance, split it or trim it.
- Do not copy content from external sources without attribution if the use is substantial.
- Every new skill added must be registered in `skills-lock` if `verify-skills-lock.sh` policy requires it.

## Skill file structure

Each skill lives in its own subdirectory:
```
core/skills/<skill-name>/
  SKILL.md   ← required: the skill content Claude reads
```

## Trigger discipline

- Triggers must be specific enough that they don't fire on unrelated prompts.
- If a skill overlaps heavily with another, prefer extending the existing one.

## Anti-patterns to avoid

- Skills that claim facts without verification steps.
- Skills that instruct Claude to take destructive actions without a gate.
- Skills that reference external URLs or credentials directly.
- Placeholder skills with empty or lorem-ipsum content.

## When adding a new skill

1. Create `core/skills/<name>/SKILL.md`.
2. Register it in `skills-lock` if required.
3. Confirm `verify-skills-lock.sh` still passes.
4. Update MANIFEST.json skills count if the total changes.
