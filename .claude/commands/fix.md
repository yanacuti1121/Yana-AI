---
description: Apply minimal patches based on the latest /audit report. Requires explicit human approval before each change.
---

Apply a minimal V9 fix pass without replacing the existing V8 agent system.

Rules:
- Do not create TypeScript/Python app scaffolds.
- Do not rename existing V8 agents unless needed.
- Do not delete agents unless the overlap is proven.
- Keep only the 5 V9-lite agents as additions:
  - prompt-firewall
  - token-guard
  - config-doctor
  - agent-gardener
  - tool-router
- Preserve memory frontmatter fields.
- Prefer small edits to .claude files.

Process:
1. Run agent-gardener to find duplicates.
2. Run prompt-firewall to catch fake claims.
3. Run token-guard to reduce token waste.
4. Run config-doctor to patch broken config.
5. Run tool-router to choose the next safest verification step.

End with:
- Files changed
- Why changed
- Verification checklist
- Remaining risks
