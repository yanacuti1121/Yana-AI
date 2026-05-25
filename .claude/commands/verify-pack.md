---
description: Verify the Claude Code template pack integrity: agents, commands, hooks, routing map, lock files, and hook health. Usage: /verify-pack
---

Run the real verifier, do not summarize from memory:

```bash
.claude/scripts/verify-claude-pack.sh
```

Then report:

1. Failure count and exact failure lines.
2. Warning count and exact warning lines.
3. Whether the pack is safe to use.
4. If failures exist, fix only the failing config/template files. Do not add new agents or rewrite unrelated files.

Rules:
- Do not claim the pack is valid unless the script exits successfully.
- Do not ignore hook syntax failures.
- Do not call placeholder/scaffold work complete.
