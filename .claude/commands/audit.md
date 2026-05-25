---
description: Lightweight system audit using 5 quality-control agents (gardener, firewall, token-guard, doctor, router). Reports issues without making changes. Run before /fix.
---

Run a lightweight V9 audit without replacing the existing V8 agent system.

Use these agents in order:

1. agent-gardener
   - Count all current agents.
   - Detect duplicated or overlapping roles.
   - Do not delete anything yet.

2. prompt-firewall
   - Check for fake claims, stub-only features, dead files, and overconfident docs.

3. token-guard
   - Find token leaks, repeated context dumps, and bloated prompts.

4. config-doctor
   - Verify .claude/agents, .claude/commands, settings, hooks, and CLAUDE.md are valid.

5. tool-router
   - Recommend the safest next action.

Output one report:
- PASS/WARN/FAIL
- Top 5 problems
- Exact files involved
- Minimal patch plan
- What not to change
