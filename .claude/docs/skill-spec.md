# YAMTAM ENGINE — Skill Specification v1.0

**Status:** Active
**Adapted from:** AgentSkills specification (Apache 2.0 © 2025 Anthropic, PBC)
**Changes made:** Added YAMTAM-specific fields (origin, Anti-Fake-Pass section),
adjusted constraints, merged YAMTAM context. Structure adapted, not copied verbatim.

---

## Directory Structure

A skill is a directory containing at minimum one `SKILL.md` file:

```
core/skills/<skill-name>/
├── SKILL.md          ← required: metadata + instructions
├── scripts/          ← optional: executable helpers (bash, python, js)
├── references/       ← optional: detailed reference docs (load on demand)
└── assets/           ← optional: templates, examples, output formats
```

The directory name must match the `name` field in `SKILL.md` frontmatter exactly.

Skills in `core/skills/` are part of the YAMTAM ENGINE pack.
Skills installed from external sources live in `.claude/skills/`.

---

## SKILL.md Format

The file must contain YAML frontmatter followed by Markdown content.

### Frontmatter Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars. Lowercase letters, numbers, hyphens only. Must match directory name. |
| `description` | Yes | Max 1024 chars. Must say WHAT the skill does AND WHEN to use it. |
| `origin` | Yes | `yamtam` / `community` / `adapted:<source-name>` |
| `version` | No | Semver string e.g. `1.0.0` |
| `compatibility` | No | Max 500 chars. Prerequisites, env requirements, tool dependencies. |
| `license` | No | If adapted from external source — license name or reference. |

### `name` field rules

- 1–64 characters
- Lowercase alphanumeric and hyphens only (`a-z`, `0-9`, `-`)
- No leading or trailing hyphens
- No consecutive hyphens (`--`)
- Must match the parent directory name exactly

Valid: `red-team-check`, `image-to-code`, `tdd-workflow`
Invalid: `Red-Team-Check` (uppercase), `-scan` (leading hyphen), `red--team` (double hyphen)

### `description` field rules

- 1–1024 characters
- Must include WHAT the skill does
- Must include WHEN to use it (trigger conditions, user intent keywords)
- Should be written imperatively: "Use when..." not "This skill..."

Good:
```yaml
description: >
  Scan the local codebase for OWASP Top 10 vulnerabilities and hardcoded secrets.
  Use when the user asks to find security issues, audit for vulnerabilities,
  or run a red team check. Only on repos the user owns.
```

Poor:
```yaml
description: Helps with security.
```

### `origin` field values

| Value | Meaning |
|-------|---------|
| `yamtam` | Written original for YAMTAM ENGINE |
| `community` | Imported from external community skill |
| `adapted:<source>` | Adapted from external source — must also have `license` field |

Example: `origin: adapted:taste-skill` with `license: MIT © 2026 Leonxlnx`

---

## SKILL.md Body Structure (recommended)

Not all sections are required for every skill. Use the sections that apply.

```markdown
## When to Use
[Specific triggers. List user intent patterns and keywords.
Also list when NOT to use the skill.]

## Pre-conditions
[Gates or confirmations required before the skill runs.
E.g., scope confirmation, read a file first, etc.]

## How It Works
[Step-by-step. Numbered. Each step should be actionable.]

## Output Format
[What the agent produces — structure, length, example.]

## Gotchas
[Non-obvious constraints, edge cases, known failure modes.
Only include things the agent would get wrong without this.]

## Anti-Fake-Pass Rules
[Evidence required before claiming the skill's task is done.
Reference: gates/anti-fake-pass-gate.md]
```

---

## Progressive Disclosure

Keep `SKILL.md` under 500 lines / 5000 tokens when possible.

For large skills, move detailed content to `references/`:
```
references/
  api-errors.md
  owasp-checklist.md
```

Then in SKILL.md, tell the agent *when* to load each file:
```markdown
Read `references/owasp-checklist.md` when starting a deep scan.
Read `references/api-errors.md` only if the API returns a non-200 status.
```

This is more efficient than loading everything upfront.

---

## Anti-Fake-Pass Section (required for all YAMTAM skills)

Every skill in `core/skills/` must include an **Anti-Fake-Pass Rules** section.
The section must list measurable evidence items — not vague statements.

Good:
```markdown
## Anti-Fake-Pass Rules
Before claiming this task is done, you MUST show:
- [ ] Finding list with severity counts
- [ ] Category coverage table with all scanned categories marked
- [ ] Confirmation log entry shown
```

Poor:
```markdown
## Anti-Fake-Pass Rules
Make sure the work is done properly.
```

Reference: `gates/anti-fake-pass-gate.md`

---

## Registration

After creating a skill:

1. Add entry to `core/config/skills-lock.json`
2. Run `core/scripts/verify-skills-lock.sh` to confirm no drift
3. Update `MANIFEST.json` skills count if total changed

See `docs/skill-evaluation-rules.md` for the pre-add quality checklist.

---

## Skill vs Command vs Agent

| Type | Lives in | When to use |
|------|---------|-------------|
| Skill | `core/skills/` | Domain knowledge, workflow guidance, reusable patterns |
| Command | `core/commands/` | User-invocable slash commands that route or orchestrate |
| Agent | `core/agents/` | Specialized subagent with its own tools and model config |

If it answers "how to do X", it's a skill.
If it's `/something` the user types, it's a command.
If it delegates to specialist tools, it's an agent.
