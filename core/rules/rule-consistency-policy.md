# Yana AI — Rule Consistency Policy
# Source: nedcodes-ok/rule-gen (cursor-doctor pattern) + yana-ai-original

**Status:** Active  
**Enforced by:** All agents before creating a new skill or rule  
**Companion skills:** `writing-skills`, `skill-factory`, `karpathy-guidelines`

---

## Purpose

Prevents:
- Skill overlap/duplication (two skills covering the same trigger phrases)
- Rule conflicts (rule A says DO X, rule B says DON'T X)
- Token waste from redundant content in context
- Agent confusion from contradictory instructions

---

## Pre-Skill Creation Checklist

Before creating a new SKILL.md, an agent MUST verify:

```bash
# 1. Name collision check
ls core/skills/ | grep -i "<proposed-name>"

# 2. Trigger phrase overlap check — does any existing skill already cover this?
grep -ri "<key-trigger-phrase>" core/skills/*/SKILL.md | grep "description:"

# 3. Description semantic overlap — any skill within 1-2 topic degrees?
#    Check skills that cover adjacent topics manually
grep -r "Do NOT use for.*<topic>" core/skills/*/SKILL.md

# 4. Conflict with existing rules
grep -ri "<topic>" core/rules/*.md
```

**If overlap found:** extend the existing skill instead of creating a new one.

---

## Rule Conflict Detection

Before adding a new rule file, check for contradictions:

| Check | Command |
|---|---|
| Duplicate topic | `grep -l "<topic>" core/rules/*.md` |
| Contradictory directive | Search for both "MUST" and "MUST NOT" on same keyword |
| Superseded rule | Check if newer skill covers the same ground |

**Conflict resolution:** newer, more specific rule wins. Document the supersession in the old rule file with `# SUPERSEDED BY: <new-file>`.

---

## Skill Deduplication Matrix

When two skills cover overlapping ground, use this decision tree:

```
Does one cover a SUBSET of the other?
  YES → fold the subset into the parent skill (add a section)
  NO  → keep both, add "Do NOT use for: X — see Y" cross-references

Do both have the same trigger phrases?
  YES → MUST merge or differentiate triggers before both can exist
  NO  → cross-reference and keep

Is one deprecated?
  YES → add "# DEPRECATED: use X instead" header, keep file for 2 releases
```

---

## Token Waste Rules

Agents MUST flag and refuse to generate content that:

```
❌ Repeats content verbatim already in another SKILL.md
❌ Creates a skill with < 5 distinct trigger phrases (too narrow to be a skill)
❌ Creates a skill > 220 lines (too broad — split it)
❌ Copies external docs without substantial transformation/adaptation
❌ Has a "When to Use" section that reads identically to another skill
```

---

## Conflict-Free Skill Registration

New skills must pass this gate before being added to `skills-lock.json`:

```
□ Name does not match any existing skill (exact or 80%+ similar)
□ Primary trigger phrases do not overlap > 2 with any existing skill
□ "Do NOT use for" section explicitly defers to adjacent skills
□ Cross-references present for all related skills (see also: X, Y)
□ Skill fits within 200 lines
□ At least 4 distinct Anti-Fake-Pass checks that are unique to this skill
```

---

## Trigger Abuse Detection (SkillSpector TR1–TR3)

Before registering any skill, check triggers against three abuse patterns:

### TR1 — Overly Broad Trigger

```
REJECT if primary trigger is a single common word with no qualifiers:
  ❌ "help", "do", "run", "go", "fix", "check", "make", "get", "use"
  ❌ Any trigger matching > 30% of realistic user inputs in test suite

REQUIRE: triggers that are ≥ 2 words OR contain a domain-specific noun
  ✅ "fix bug", "security audit", "write tests", "docker build"
```

### TR2 — Shadowing Built-Ins

```bash
# Check if trigger phrase matches an existing core command or built-in skill
grep -ri "^## trigger.*<proposed-trigger>" core/skills/*/SKILL.md
grep -ri "<proposed-trigger>" core/commands/*.md

REJECT if trigger:
  - Matches or subsumes an existing built-in command (/plan, /commit, /review...)
  - Would intercept inputs meant for the shell (ls, git, npm...)
  - Shadows a native Claude Code slash command
```

### TR3 — Keyword Baiting

```
Patterns indicating a skill is designed to match ALL inputs:
  ❌ Trigger list contains "anything", "everything", "always", "any request"
  ❌ Trigger list has > 50 entries covering unrelated domains
  ❌ Skill description says "can handle any task" or "general purpose"
  ❌ No "Do NOT use for" section (every skill must have exclusions)

Intent: keyword baiting inflates a skill's activation rate, degrading routing
quality for legitimate skills and wasting tokens on false positives.
```

---

## Drift Detection

Run periodically to catch accumulated drift:

```bash
# Find skills with no unique trigger phrases (potential duplicates)
bash core/tests/skills/test-skill-triggering.sh 2>&1 | grep FAIL

# Find rule files with overlapping topics
for f in core/rules/*.md; do
  echo "=== $f ===" && grep -o '"[^"]*"' "$f" | sort | head -10
done | sort | uniq -d
```
