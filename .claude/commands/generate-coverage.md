---
name: generate-coverage
description: Run the real project coverage script if configured. Fake coverage reports are forbidden.
---

This command only runs a real `test:coverage` script from `package.json`.
It does not generate simulated coverage.

```bash
.claude/scripts/generate-coverage-report.sh
```

If no coverage script exists, add a real coverage tool first.
