---
id: fact-truth-gate
type: fact
statement: Truth Gate (L3) is enforced by both AI prompt template and runtime Stop hook truth-gate-guard.sh as of v1.3.0.
source: file:core/hooks/truth-gate-guard.sh
confidence: high
scope: YAMTAM
tags: [hook, truth-gate, claim-verb]
forbidden_assumptions:
  - Do not assume the hook blocks responses — it warns only (exit 0)
  - Do not assume evidence in a previous turn satisfies the current turn
evidence: core/hooks/truth-gate-guard.sh, gates/truth_gate.md
---

Claim verbs that require evidence: done, finished, complete, completed, passed,
passing, clean, working, fixed, resolved, ready, merged, pushed, deployed,
released, shipped, verified, confirmed, tested, validated.

Fallback phrasings when evidence unavailable: claimed / reportedly / expected / unverified.
Bypass: YAMTAM_TRUTH_GATE_BYPASS=1.
