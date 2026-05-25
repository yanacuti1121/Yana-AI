---
description: Apply minimal fixes found by /v10-audit. Reliability only: no new agents, no fake kernels, no feature bloat. Usage: /v10-fix
---

You are applying v10 reliability fixes.

Rules:
- Fix only concrete failures from `/v10-audit` or `.claude/scripts/verify-claude-pack.sh`.
- Do not add new agents unless `agent-gardener` proves no existing agent can cover the role.
- Do not add TypeScript kernels, stub tools, demo loops, or unrelated application code.
- Every fix must include a verification step.

Procedure:
1. Run `.claude/scripts/verify-claude-pack.sh`.
2. Fix failures first, warnings second.
3. Re-run the verifier.
4. Report exact files changed and exact verification output.
