# Contributing to YAMTAM ENGINE

Thank you for helping build the most comprehensive AI agent safety framework.

---

## Quick Start

```bash
git clone https://github.com/phamlongh230-lgtm/yamtam-engine
cd yamtam-engine
bash core/tests/skills/test-skill-triggering.sh  # should show Result: PASS
bash core/tests/hooks/run-hook-tests.sh          # should show all passing
```

---

## What We Accept

| Type | Welcome? | Notes |
|---|---|---|
| New skills | ✅ | Must follow skill format (see below) |
| Bug fixes in hooks/scripts | ✅ | Include failing test case |
| New rules | ✅ | No conflicts with existing rules |
| Cross-engine adapters | ✅ | Add to `adapters/` |
| Performance improvements | ✅ | Benchmark before/after |
| New agent definitions | ✅ | Must be generic, no product coupling |
| Product-specific code | ❌ | Keep YAMTAM engine-agnostic |
| Credentials / secrets | ❌ | Hard rejected at PR stage |

---

## Adding a New Skill

1. Create `core/skills/<name>/SKILL.md` using this structure:

```markdown
---
name: your-skill-name
description: One-line description including key trigger phrases
origin: source/repo (License)
license: MIT
version: 1.0.0
compatibility: what platforms/languages it works with
---

## When to Use
## Do NOT use for
## [Code examples with fenced blocks]
## Anti-Fake-Pass Checklist
- [ ] verifiable assertion 1
- [ ] verifiable assertion 2
```

2. Register in `core/config/skills-lock.json`

3. Add trigger phrases to `core/tests/skills/test-skill-triggering.sh`:
```bash
check_skill "your-skill-name"   "trigger phrase 1"
check_skill "your-skill-name"   "trigger phrase 2"
```

4. Run the gate:
```bash
bash core/tests/skills/test-skill-triggering.sh
# Must show Result: PASS
```

5. Update counts in `MANIFEST.json`, `plugin.json`, `marketplace.json`

---

## Commit Format

```
type(scope): short description

Types: feat, fix, chore, docs, refactor, test, perf
Examples:
  feat(skills): add redis-patterns skill (caching + pub/sub)
  fix(hooks): token-scope-guard false positive on .env.example
  docs(readme): update skill count to 145
```

---

## Pull Request Checklist

```
□ Trigger tests pass: bash core/tests/skills/test-skill-triggering.sh → PASS
□ Hook tests pass: bash core/tests/hooks/run-hook-tests.sh → all pass
□ Skills-lock updated: bash core/scripts/verify-skills-lock.sh → no drift
□ No secrets in diff: bash core/skills/leak-check/ pattern applied
□ Skill ≤ 220 lines (if adding a skill)
□ MANIFEST + plugin.json + marketplace.json counts updated
□ No hardcoded hex colors in any frontend code
□ Attribution: origin field in frontmatter if adapted from external source
```

---

## License

By contributing, you agree your contributions are licensed under MIT.
All adapted content must retain original attribution in the `origin` frontmatter field.

---

## Questions?

Open a GitHub Issue with label `question`. Response within 48h.
