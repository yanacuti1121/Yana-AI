**Rule:** agent-excessive-agency-law
**Status:** REVIEWED
**Gate:** L1 — every agent action scope check
**Source:** OWASP/www-project-top-10-for-large-language-model-applications (LLM08: Excessive Agency), anthropic/model-spec (minimal footprint principle), NIST AI RMF (GOVERN-1.2)

---

# OWASP LLM08: Excessive Agency Law

## Principle

An agent must operate with the minimum permissions, scope, and reversibility
required to complete its stated task. Any action beyond that scope is blocked.

## Permission tiers

```
Tier R (Read-only):    read files, query APIs, search — no side effects
Tier W (Write-local):  edit files in workspace — reversible via git
Tier X (Execute):      run scripts, install packages — requires human gate
Tier P (Publish):      push, deploy, send external — requires explicit auth per action
```

## Scope enforcement rules

```
Tier A — exit 1, block action:
  - Agent reads files outside declared workspace (path-traversal rule applies)
  - Agent installs packages without dependency-vetting-law check
  - Agent self-modifies its own rules or memory without L2 review
  - Agent spawns sub-agents beyond declared delegation depth (max: 3 levels)
  - Agent takes irreversible action without YAMTAM_IRREVERSIBLE_OK=1

Tier B — log + human confirmation:
  - Action would affect > 5 files outside current task scope
  - Action would contact external endpoint not in task brief
  - Agent reuses credentials from prior session context
```

## Minimal footprint checks

```markdown
Before any action, agent must answer:
  1. Is this action within the scope stated in the current task brief?
  2. Is this the lowest-permission way to accomplish the goal?
  3. Is this reversible? If not — does YAMTAM_IRREVERSIBLE_OK=1 exist?
  4. Does completing this action require spawning a sub-agent?
     If yes: is delegation depth < 3?

If any answer fails → pause and surface to human.
```

## Sub-agent delegation depth

```
Root agent (depth=0) → spawns agent A (depth=1) → spawns agent B (depth=2) → depth=3 MAX
                                                   ↳ agent B cannot spawn further

Enforcement: YAMTAM_AGENT_DEPTH env var tracked in safe-run.sh wrapper
export YAMTAM_AGENT_DEPTH=$((${YAMTAM_AGENT_DEPTH:-0} + 1))
[[ $YAMTAM_AGENT_DEPTH -gt 3 ]] && { echo "BLOCKED: agent depth > 3"; exit 1; }
```

## Irreversible action gate

```bash
# Any action that cannot be undone by git revert requires explicit flag
IRREVERSIBLE_ACTIONS=(
  "git push"
  "npm publish"
  "kubectl delete"
  "DROP TABLE"
  "send email"
  "stripe charge"
)

for action in "${IRREVERSIBLE_ACTIONS[@]}"; do
  if [[ "$COMMAND" == *"$action"* ]]; then
    [[ "${YAMTAM_IRREVERSIBLE_OK:-0}" != "1" ]] && {
      echo "[LLM08] BLOCKED: irreversible action requires YAMTAM_IRREVERSIBLE_OK=1"
      exit 1
    }
  fi
done
```

## Anti-Pattern Checklist

```
❌ Agent granted admin/root permissions "for convenience"
❌ Agent self-delegates to sub-agent with equal or higher permissions
❌ Irreversible action (push, publish, delete) without explicit per-action auth
❌ Agent stores credentials from prior task in L2 for reuse
❌ Sub-agent chain depth > 3 (runaway orchestration)
❌ Agent scope not declared at task start (undeclared = read-only by default)
```
