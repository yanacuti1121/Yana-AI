# YAMTAM ENGINE — Git Push Enforcement
# Source: github/ruleset-recipes bypass/enforcement structure + yamtam action gate

**Status:** Active  
**Enforced by:** action_gate.md, PreToolUse hook, all agents  
**Related gate:** `gates/action_gate.md`  
**Related rule:** `git-workflow-v2.md`

---

## Hard Law

> **No agent may execute `git push` unless ALL test checks pass AND explicit human authorization is given for the current session.**

---

## Push Pre-flight Checklist

Before ANY `git push`, ALL of the following must be GREEN:

```bash
# Gate 1 — Trigger tests
bash core/tests/skills/test-skill-triggering.sh
# Expected: "Result: PASS" — if FAIL, push is BLOCKED

# Gate 2 — Hook tests (if hooks were modified)
bash core/tests/hooks/run-hook-tests.sh
# Expected: all assertions pass

# Gate 3 — Skills lock consistency
bash core/scripts/verify-skills-lock.sh
# Expected: no drift detected

# Gate 4 — Uncommitted changes
git status --short
# Expected: empty or only intentional staged changes
```

**One FAIL = push blocked. No exceptions.**

---

## Push Authorization Levels

| Action | Required authorization |
|---|---|
| `git push` to feature branch | Human approval in current session |
| `git push` to `main` | Explicit "push to main" instruction |
| `git push --force` | **NEVER** — hard prohibited |
| `git push --force-with-lease` | Explicit instruction + reason stated |
| `gh release create` | Explicit "cut release" instruction |

---

## Auto-Trigger /smart-fix on Failure

If any gate fails before push, the agent MUST:

```
1. NOT proceed with push
2. Report which gate failed + extract the failing assertions
3. Invoke: /smart-fix  or  bash core/scripts/feedback-loop.sh "<failed-cmd>" 3
4. Re-run all gates after fix
5. Only push after all gates pass
```

---

## Branch Protection Rules (GitHub Ruleset)

Apply to `main` branch:

```yaml
# .github/rulesets/main-protection.json (conceptual — apply via GitHub API)
{
  "name": "main-branch-protection",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"] } },
  "rules": [
    { "type": "deletion" },                    # no force-delete of main
    { "type": "non_fast_forward" },            # no force-push
    { "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          { "context": "skill-trigger-tests" },
          { "context": "hook-tests" }
        ],
        "strict_required_status_checks_policy": true
      }
    }
  ],
  "bypass_actors": []   # NO bypasses — not even the repo owner
}
```

---

## Prohibited Push Patterns

```bash
# ❌ HARD PROHIBITED — agent must refuse these
git push --force origin main
git push --force origin HEAD:main
git push -f

# ❌ PROHIBITED without explicit instruction
git push origin main     # without running gate checks first

# ✅ Allowed after all gates pass + human authorization
git push
git push origin feature/my-branch
```

---

## Rollback Protocol

If a bad push was made (gate was skipped):

```bash
# 1. Identify the last known-good commit
git log --oneline -10

# 2. Create a revert commit (do NOT force-push)
git revert HEAD --no-edit
git push

# 3. Document the incident in L1
bash core/scripts/add-fact.sh "incident" \
  "Bad push at $(date): <description>. Reverted with $(git rev-parse HEAD). Root cause: <cause>." \
  "high"
```
