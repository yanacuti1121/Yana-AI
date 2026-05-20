---
description: Print a readable map of all 19 agents — what each does, when to use it, and which agents should NOT be combined. Reads from agent-routing-map.json and core/agents/. No arguments needed.
argument-hint: (no arguments)
---

You are printing the YAMTAM agent map.

Read these files:
1. `core/config/agent-routing-map.json` — routing rules (match keywords → agent)
2. All files in `core/agents/` — agent definitions (name, description, tools)

Then produce the following output. Do not add commentary — just the map.

---

## YAMTAM Agent Map

### All Agents

For each agent in `core/agents/`, print one row:

```
| Agent | Purpose (from description field) | Tools |
```

Sort alphabetically by agent name.

---

### Routing Rules (from agent-routing-map.json)

For each rule, print:

```
Keywords: [match list]
  → Primary:  <agent>
  → Verify:   <verify_with agent>
```

---

### Combination Rules

After printing the routing table, state:

**Never combine:**
- Same agent for implementation AND verification (always use a different agent to verify)
- `prompt-firewall` with any write-capable agent in the same routing step

**Always pair:**
- Any implementation agent → verify with `qa-engineer` or `spec-verifier`
- Any commit/deploy step → route through `tool-router` first

---

### Quick Reference

Print a compact table:

| Task type | Use this agent | Do NOT use |
|-----------|---------------|------------|
| Write backend code | backend-developer | frontend-developer |
| Write frontend code | frontend-developer | backend-developer |
| Review code | qa-engineer | the agent that wrote it |
| Security concern | prompt-firewall | any write agent |
| DB / migration | database-expert | backend-developer alone |
| CI / deploy config | cicd-engineer | systems-architect alone |
| Unclear routing | tool-router | any specialist directly |
| Prune duplicate agents | agent-gardener | — |
| Reduce token burn | token-guard | — |

---

After printing, add one line:
> Source: `core/config/agent-routing-map.json` · `core/agents/` · v1.3.26
