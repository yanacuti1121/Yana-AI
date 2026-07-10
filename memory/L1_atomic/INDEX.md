# Yana AI L1 Atomic Memory — Index

Auto-updated by `core/scripts/add-fact.sh` when a new fact is added.
Do not edit manually — run `bash core/scripts/add-fact.sh` instead.

Schema: `memory/L1_atomic/SCHEMA.md`

---

## Facts

| ID | Type | Scope | Confidence | Statement (truncated) | File |
|----|------|-------|------------|----------------------|------|
| fact-scope-boundary | constraint | both | high | Yana AI-scoped tasks must not edit app/ components/ lib/ db/ migrations/… | [fact-scope-boundary.md](fact-scope-boundary.md) |
| fact-truth-gate | fact | Yana AI | high | Truth Gate (L3) is enforced by AI prompt + runtime Stop hook truth-gate-guard.sh… | [fact-truth-gate.md](fact-truth-gate.md) |
| fact-hermes-integration-paused | decision | Yana AI | high | hermes_adapted integration: Phase 0 done, Phases 1-5 designed but not started… | [fact-hermes-integration-paused.md](fact-hermes-integration-paused.md) |
| fact-hook-exit-codes | fact | Yana AI | high | Hooks use exit 0 to allow, exit 0 + stdout to warn, JSON + exit 2 to block… | [fact-hook-exit-codes.md](fact-hook-exit-codes.md) |
| fact-confidence-rule | constraint | Yana AI | high | L1 fact confidence must be promoted manually only — never auto-promoted… | [fact-confidence-rule.md](fact-confidence-rule.md) |

<!-- add-fact.sh appends rows above this line -->
| fact-20260710-220852 | constraint | Yana AI | unverified | Claude Code rule-scoping frontmatter key is paths: (list of … | [fact-20260710-220852.md](fact-20260710-220852.md) |
| fact-20260710-220901 | constraint | Yana AI | unverified | 54-bft-consensus-law.md two-reviewer dispatch does not trans… | [fact-20260710-220901.md](fact-20260710-220901.md) |
<!-- END INDEX -->
