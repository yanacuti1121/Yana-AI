---
name: run-e2e
description: Run real Playwright E2E commands through the safe YAMTAM wrapper. Defaults to list-only to avoid accidental full-suite burns.
argument-hint: list | smoke | grep <pattern> | spec <file> | full
---

Run real E2E checks only. This command never creates simulated reports.

Recommended low-cost modes:

```bash
.claude/scripts/run-e2e-tests.sh list
.claude/scripts/run-e2e-tests.sh spec tests/e2e/korean-learning.spec.ts --workers=1
.claude/scripts/run-e2e-tests.sh grep "login|announcement" --workers=1
```

Full suite is blocked in Codespaces unless intentionally allowed:

```bash
YAMTAM_ALLOW_FULL_E2E=1 .claude/scripts/run-e2e-tests.sh full
```
