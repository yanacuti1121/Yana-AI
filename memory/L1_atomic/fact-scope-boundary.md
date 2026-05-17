---
id: fact-scope-boundary
type: constraint
statement: YAMTAM-scoped tasks must not edit app/ components/ lib/ db/ migrations/ public/ or any .env* file without explicit cross-scope approval from the user in the current session.
source: file:gates/action_gate.md
confidence: high
scope: both
tags: [scope, gate, cross-scope]
forbidden_assumptions:
  - Do not assume approval from a previous session carries over
  - Do not assume YAMTAM scope equals product scope
  - Do not assume silence = approval
evidence: gates/action_gate.md § Scope Rules
---

Cross-scope approval must be an explicit user statement in the current session:
"approved to cross scope into <path>". Approval applies only to the named path,
not the entire product codebase. Enforced at runtime by core/hooks/scope-guard.sh.
