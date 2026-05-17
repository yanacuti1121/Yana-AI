---
id: fact-hook-exit-codes
type: fact
statement: YAMTAM hooks use exit 0 to allow, exit 0 + stdout to warn, and JSON + exit 2 to block a tool call.
source: file:core/hooks/guard-destructive.sh
confidence: high
scope: YAMTAM
tags: [hook, exit-code, format]
forbidden_assumptions:
  - Do not assume non-zero exit always blocks — only exit 2 with JSON blocks
  - Do not assume plain stdout output on exit 0 is ignored — Claude Code shows it as context
evidence: core/hooks/guard-destructive.sh (deny pattern), core/hooks/validate-completion.sh (warn pattern)
---

Pattern reference:
  Allow:  exit 0              (no output)
  Warn:   exit 0              (plain text on stdout — shown to Claude as post-turn context)
  Block:  JSON to stdout      (hookSpecificOutput.permissionDecision = "deny") + exit 2

Advisory hooks (token-scope-guard, scope-guard, truth-gate-guard) always exit 0.
