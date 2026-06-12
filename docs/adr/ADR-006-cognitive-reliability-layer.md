# ADR-006: Cognitive Reliability Layer (L6)

## Status

Accepted — 2026-06-12, by sovereign decision (Vũ Văn Tâm).

- Behavioral enforcement: **Active** via `core/rules/69-cognitive-reliability-law.md`
- Automated gate tooling (hooks/scripts): **Not yet implemented** — tracked as follow-up
- This ADR is the formal architecture change required by
  `docs/architecture/YAMTAM_LAYER_MODEL.md` § 2 ("Do not introduce L6/L7/L8
  unless architecture is formally changed")

> Note on numbering: this is the repo's first ADR file. ADR-001–005 are
> reserved for retroactive documentation of past major decisions
> (layer model, core-lock, rule 68, release pipeline, marketplace).

## Context

L0–L5 protect against unsafe *actions*: dangerous commands, destructive
operations, prompt injection, supply-chain attacks, unverified execution
claims. They answer: **"can the agent damage the system?"**

Audit of recent session logs (June 2026) showed that ~80% of observed agent
failures were no longer at the action layer. They were at the *perception*
layer — the agent telling a story about the work that was better than the
work itself:

- "100% complete / production ready" while review comments, locale keys,
  and hook errors remained open (evidence: codexmate PR #193 review by
  @ymkiux found 8 missing vi locale keys after a "done" report)
- Assumptions silently converted into facts ("maintainer is waiting")
- System numbers presented without meaning (97 agents, 3,516 skills —
  users read these as 97 running LLMs)
- Scope expanding from "fix UI" into auth + routing + deploy without approval
- Success-only wrap-ups with no failures, risks, or unknowns

No existing layer asks: **"can the agent create a false picture of reality?"**

## Decision

Introduce **L6 — Cognitive Reliability Layer**, a guard family that
constrains agent *reporting and reasoning*, not agent actions.

L6 guards (canonical list — full text in rule 69):

| ID | Guard | Protects against |
|----|-------|------------------|
| L6.0 | Completion Guard | "done" blurring implemented/tested/verified/approved/merged/deployed |
| L6.1 | Claim-Evidence Guard | claims without evidence + confidence |
| L6.2 | Unknown Tracker | hidden uncertainty |
| L6.3 | Scope Drift Guard | silent scope expansion (enforcement: rule 64) |
| L6.4 | Human Confusion Guard | terminology users misread (97 agents ≠ 97 LLMs) |
| L6.5 | Vanity Metric Guard | big numbers without user impact |
| L6.6 | Demo ≠ Production Guard | "works locally" reported as production-ready |
| L6.7 | Success Narrative Guard | wrap-ups with no failures/risks/unknowns |
| L6.8 | Branding Gap Detector | features prioritized over identity/onboarding |
| L6.9 | Creator Intent Guard | complexity optimized over creator's outcomes |
| L6.10 | Assumption Leakage Guard | inference/speculation presented as fact |
| L6.11 | Reviewer Perspective Guard | author-only thinking before PR submission |
| L6.12 | Cognitive Debt Tracker | unexplained terms, missing onboarding/logo |
| L6.13 | Authority Bias Guard | authority statements replacing evidence |
| L6.14 | Recency Bias Guard | recent signals dominating long-term context |
| L6.15 | Survivorship Bias Guard | retrospectives that only observe successes |
| L6.16 | Novelty Bias Guard | new solutions preferred without migration-cost analysis |
| L6.17 | Complexity Tax Guard | benefits counted, complexity cost ignored |
| L6.18 | User Reality Guard | system capability without user value |
| L6.19 | Time Horizon Guard | short-term success over long-term impact |
| L6.20 | Simplicity Preservation Guard | adding faster than removing |

### Output contract (significant work reports)

```
Status: ...          (one of the 8 completion states — see rule 69)
Evidence: ...
Known: ... / Unknown: ... / Assumed: ...
Risks: ...
User Impact: ...
Confidence: 0–100%
```

### Relationship to the layer model

`YAMTAM_LAYER_MODEL.md` defines L1–L5.5 as *execution* guard checkpoints.
L6 is deliberately **outside** that interleaved stack: it does not gate a
command pipeline stage; it gates the agent's reports and decisions across
all stages. The layer model gains one note pointing here; its L1–L5.5
structure is unchanged.

## Consequences

Easier:
- Reports map to reality; "done" regains meaning
- Reviewers and the sovereign can trust status without re-verifying everything
- Differentiator: most agent frameworks ask "can the agent break the machine?"
  — YAMTAM also asks "can the agent believe a false thing convincingly?"

Harder / costs:
- Reports become longer and slower to write (output contract overhead)
- Honest confidence numbers feel less impressive than success narratives
- Until gate tooling exists, enforcement is behavioral (rule-following),
  not mechanical — drift is possible and must be caught in review

Follow-ups (not in this ADR):
- Automated wrap-up linter (reject success-only summaries)
- Completion-state vocabulary check in truth gate
- Cognitive-debt backlog file

## Core principle

> L0–L5 prevent agents from **doing** dangerous things.
> L6 prevents agents from **believing** dangerous things.
>
> The most dangerous failure mode is not always bad code. Often it is a
> convincing but inaccurate understanding of reality.

## References

- `core/rules/69-cognitive-reliability-law.md` — enforcement rule
- `core/rules/verification.md` — evidence-before-claims (L6.1 foundation)
- `core/rules/64-scope-drift-law.md` — scope enforcement (L6.3 mechanism)
- `core/rules/63-autonomous-session-law.md` — session wrap-up duties
- `docs/architecture/YAMTAM_LAYER_MODEL.md` — execution layer model (L1–L5.5)
- Origin: external audit feedback + sovereign postmortem, 2026-06-12
