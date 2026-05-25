# YAMTAM ENGINE — Skill Writing Guide

**Status:** Active
**Adapted from:** AgentSkills best-practices.mdx + optimizing-descriptions.mdx
  (Apache 2.0 © 2025 Anthropic, PBC) — adapted for YAMTAM, not copied verbatim.
**Spec reference:** docs/skill-spec.md
**Template:** core/templates/SKILL_TEMPLATE.md

---

## Core Principle

A skill is **instructions, not code**. It tells the agent how to approach a
class of problems — not what to produce for a specific instance.

A skill scoped to one coherent task composes better than a skill that tries
to do everything. If you need two skills to trigger for one task, the skills
are too narrow. If a skill triggers when it shouldn't, it's too broad.

---

## 1. Start From Real Expertise

The most common mistake: asking an AI to generate a skill without providing
domain-specific context. The result is generic advice ("handle errors
appropriately") rather than specific guidance.

**Good source material:**
- Steps that worked in a real session — the sequence that led to success
- Corrections you had to make — "use X not Y", "check for edge case Z"
- Project-specific conventions the agent wouldn't know from training
- Known failure modes and how to avoid them

**Bad source material:**
- Generic "best practices" articles
- What the agent already knows from training

---

## 2. Writing a Good Description

The `description` field is how the agent decides whether to use your skill.
It is the single most important field.

### Rules

- **WHAT + WHEN** — describe both what the skill does and when to trigger it
- **Imperative** — "Use when..." not "This skill helps with..."
- **Keywords** — include the actual words a user might say
- **Specific** — be precise about scope boundaries

### The "pushy" test

A good description is slightly pushy about when to use the skill. Include
cases where the user might not say the domain name directly:

```yaml
# Weak
description: Security scanning for codebases.

# Strong
description: >
  Scan the local codebase for OWASP Top 10 vulnerabilities, hardcoded
  secrets, and misconfigurations. Use when the user asks to find security
  issues, audit for bugs, run a red team check, or check if code is safe
  to deploy — even if they don't explicitly say "security scan" or "OWASP".
```

### Near-miss triggers (things you want to NOT trigger)

If your skill is close to another skill in concept, add a "Do NOT use when"
line to avoid false triggers:

```yaml
description: >
  ...
  Do NOT use for general code review or linting — use code-review skill instead.
```

---

## 3. Body Structure

Follow the template in `core/templates/SKILL_TEMPLATE.md`.
Only include sections that have real content — delete empty ones.

### When to Use
List specific trigger conditions including user intent keywords.
Also list when NOT to use the skill.

### Pre-conditions
Gates or confirmations required before starting.
If a scope gate is required (e.g., ownership confirmation), list it here.

### How It Works
Numbered steps. Each step is an action.
Prefer procedures over declarations — "how to do X" not "what X is".

### Output Format
What the agent produces: structure, length, template.
Include a concrete example if the output shape is non-obvious.

### Gotchas
Non-obvious constraints the agent would get wrong without being told.
This section has the highest value per word — keep it specific.

Examples of good gotchas:
```markdown
- The `users` table uses soft deletes — queries must include `WHERE deleted_at IS NULL`
- npm audit modifies package-lock.json — ask user before running in targeted mode
- JWT alg:none only applies to libraries that accept unsigned tokens — check the library first
```

Examples of bad gotchas:
```markdown
- Handle errors appropriately   (too vague)
- Be careful with production    (not actionable)
```

### Anti-Fake-Pass Rules
Measurable evidence the agent must show before claiming done.
Every YAMTAM skill must have this section.

```markdown
## Anti-Fake-Pass Rules
Before claiming this task is done, you MUST show:
- [ ] [Specific evidence item — what file, output, or number]
- [ ] [Another specific item]
```

---

## 4. Size Guidelines

| Guideline | Value |
|-----------|-------|
| Recommended max | 500 lines / 5000 tokens |
| Hard max before splitting | 800 lines |
| Gotchas section | 3–8 items (prune aggressively) |
| How It Works steps | 3–10 numbered steps |
| Anti-Fake-Pass items | 2–5 checkboxes |

If a skill exceeds 500 lines:
1. Move detailed reference material to `references/` subdirectory
2. Tell the agent *when* to load each reference file (conditional loading)
3. Keep `SKILL.md` to core instructions only

---

## 5. What to Include vs Omit

### Include
- Project-specific conventions the agent doesn't know from training
- Non-obvious failure modes and how to avoid them
- Specific tools, APIs, or patterns to prefer
- Exact output format when it matters
- The "do NOT" cases for trigger and action

### Omit
- What the agent already knows (general programming, common patterns)
- Theoretical background or explanations of concepts
- Content the agent can figure out by reading the codebase
- "Be careful", "handle properly" — not actionable

Test: for each sentence, ask "Would the agent get this wrong without this instruction?"
If no → cut it.

---

## 6. Anti-Patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Vague description | Skill never triggers or triggers on everything | Add WHAT + WHEN with specific keywords |
| No output format | Agent produces inconsistent output | Add Output Format section with example |
| Missing Gotchas | Agent makes the same mistake repeatedly | Extract corrections from real sessions |
| No Anti-Fake-Pass | Agent claims done without evidence | Add measurable evidence checklist |
| Too broad scope | Skill triggers on unrelated tasks | Add "Do NOT use when" to description |
| Too narrow scope | Need 3 skills to do one task | Merge related skills |
| Instructions for known things | Context bloat, no value | Cut everything the agent already knows |
| Placeholder content | TODO, [insert here] | Never ship a skill with placeholders |

---

## 7. Optimizing Descriptions for Triggering

If a skill is not triggering when it should:

1. Check: does the description include the keywords the user said?
2. Check: is it phrased as "Use when..." (imperative)?
3. Check: does it mention near-miss cases explicitly?

If a skill triggers when it shouldn't:

1. Check: is the description too broad?
2. Add a "Do NOT use when" line with the cases you want to exclude
3. Make the trigger conditions more specific

A description that tests well against 3 should-trigger queries and 3
should-not-trigger queries is ready to ship.

---

## 8. Attribution Rules

If adapting from an external skill:

```yaml
origin: adapted:taste-skill
license: MIT © 2026 Leonxlnx
```

And add a header comment in the body:
```markdown
<!-- Adapted from [source] ([license]). Changes: [brief description]. -->
```

If the source has no license: **do not copy text** — write the skill original
and note the inspiration only in `docs/third-party-inspiration.md`.

---

## Quick Checklist Before Adding a Skill

See `docs/skill-evaluation-rules.md` for the full pre-add checklist.

Minimum before shipping:
- [ ] name matches directory name, lowercase, no double hyphens
- [ ] description has WHAT + WHEN (≥ 50 chars)
- [ ] origin field set
- [ ] When to Use section exists
- [ ] Anti-Fake-Pass section with at least 1 measurable item
- [ ] No placeholder text (TODO, TBD, [insert here])
- [ ] Registered in skills-lock.json
