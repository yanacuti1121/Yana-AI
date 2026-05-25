# YAMTAM ENGINE — Skill Evaluation Rules

**Status:** Active
**Adapted from:** AgentSkills evaluating-skills.mdx (Apache 2.0 © 2025 Anthropic, PBC)
**Changes:** Rewritten for YAMTAM format, added Anti-Fake-Pass integration,
YAMTAM-specific field requirements, skills-lock registration step.

---

## Purpose

This checklist gates new skills before they are added to `core/skills/` and
registered in `skills-lock.json`. It prevents vague, incomplete, or conflicting
skills from entering the pack.

Run this checklist manually. Do not claim a skill "passes" without evidence.

---

## Pre-Add Checklist

Run through every item before adding a skill to `skills-lock.json`.

### Frontmatter

```
□ name field present
□ name is lowercase, hyphens only, no consecutive hyphens, no leading/trailing hyphen
□ name matches the parent directory name exactly
□ name is ≤ 64 characters
□ description field present
□ description is ≥ 50 characters
□ description contains WHAT the skill does (not just "helps with X")
□ description contains WHEN to use it (trigger conditions or keywords)
□ origin field set (yamtam / community / adapted:<source>)
□ if origin is adapted:*, license field is also present
□ no placeholder text in any field (TODO, TBD, [insert here], lorem ipsum)
```

### Body Structure

```
□ "When to Use" section exists
□ "When to Use" has at least 1 specific trigger condition
□ "Anti-Fake-Pass Rules" section exists
□ "Anti-Fake-Pass Rules" has at least 1 measurable checkbox item
□ no section contains only placeholder content
□ skill is ≤ 500 lines (if longer, references/ directory must exist with conditional load instructions)
```

### Conflict Check

```
□ no existing skill in core/skills/ covers the same domain
□ no existing command in core/commands/ already does this
□ no existing agent in core/agents/ already handles this scope
  (to check: grep -r "description" core/skills/ | grep -i <keyword>)
```

### Attribution

```
□ if adapted from external source: origin + license fields set
□ if adapted from external source: attribution comment in SKILL.md body
□ if adapted from external source: entry in docs/third-party-inspiration.md
□ if source has no license: content was written original (no text copied)
```

### Registration

```
□ skills-lock.json entry added with correct source, sourceType, localPath, computedHash
□ core/scripts/verify-skills-lock.sh passes (or is noted as UNKNOWN if not run)
□ MANIFEST.json skills count updated if total changed
```

---

## Quality Score (optional)

Use to compare skill quality when reviewing a batch of skills.

| Dimension | 0 | 1 | 2 | Score |
|-----------|---|---|---|-------|
| Description | Vague ("helps with X") | Has WHAT only | Has WHAT + WHEN + keywords | /2 |
| Trigger precision | Always or never triggers | Sometimes wrong | Reliable trigger | /2 |
| Gotchas section | Missing | Present but generic | Specific, non-obvious items | /2 |
| Output format | Not described | Mentioned loosely | Clearly defined with example | /2 |
| Anti-Fake-Pass | Missing | Present but vague | Measurable checkboxes | /2 |

**Minimum to ship: 5 / 10**
Skills scoring below 5 should be revised before registration.

---

## Description Trigger Test (minimum viable)

Before shipping, test the description against at least 3 prompts:

**Should-trigger queries** (2–3 examples):
Write realistic user prompts where the skill should activate.
Vary phrasing — formal, casual, without domain keywords.

**Should-not-trigger queries** (1–2 examples):
Write near-miss prompts that share keywords but need a different skill.

Example for `red-team-check`:
```
Should trigger:
  "Can you check this repo for security vulnerabilities?"
  "Run a security audit on the codebase"
  "Is there anything dangerous in this code before I deploy?"

Should NOT trigger:
  "Review the code quality and suggest refactors"    ← code-review skill
  "Check for linting errors in the TypeScript files"  ← not security
```

Record results:
```
□ All should-trigger queries: skill would activate → PASS
□ All should-not-trigger queries: skill would NOT activate → PASS
Status: UNKNOWN (not run) / REVIEWED (manually evaluated) / TESTED (run with tool)
```

---

## Upgrade Checklist (for existing skills)

When modifying an existing skill:

```
□ description still accurate after changes
□ Anti-Fake-Pass section still reflects the actual task
□ skills-lock.json computedHash updated to new hash
  (run: sha256sum core/skills/<name>/SKILL.md)
□ MANIFEST.json updated if behavior changed significantly
□ docs/third-party-inspiration.md updated if new external content added
```

---

## Anti-Fake-Pass for This Process

Before marking a skill evaluation as complete:
- [ ] All Pre-Add Checklist boxes checked (or explicitly noted as UNKNOWN)
- [ ] Conflict check grep run and result noted
- [ ] Description trigger test documented (even if UNKNOWN — don't skip without noting)

MUST NOT say "skill evaluated" without showing the checklist output.
MUST NOT say "no conflicts" without running the grep check.

---

## References

- `docs/skill-spec.md` — full field specification
- `docs/skill-writing-guide.md` — how to write good skills
- `core/templates/SKILL_TEMPLATE.md` — canonical template
- `gates/anti-fake-pass-gate.md` — evidence requirements
- `core/config/skills-lock.json` — skill registry
- `core/scripts/verify-skills-lock.sh` — drift check
