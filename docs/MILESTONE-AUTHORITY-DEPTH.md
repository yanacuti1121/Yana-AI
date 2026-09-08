# Milestone: Authority Depth

**Status:** Work started ahead of `CURRENT-MILESTONE.md`'s exit gate —
an explicit, conscious deviation, not an accident. The project owner
directed starting Capability Lease early ("bắt đầu luôn Capability
Lease"); the "Authority Hardening" workstream below is a direct,
requested continuation of that same started work, auditing and
deepening it rather than opening new scope. `CURRENT-MILESTONE.md`'s
gate is still the formal transition point; this file's `Priority order`
table tracks real progress against it regardless of which file is
"current."

**Authority Hardening workstream (2026-08-28):** an audit-and-harden
pass across everything below, on branches `hardening/authority-lease-
atomicity` (PR #277) and `hardening/ci-authority-coverage` (PR #278,
stacked). Shipped: Capability Lease atomicity (flock-v1 locking, closing
a real lost-update race reproduced live) and token-aware scope matching
(closing a real string-prefix false-positive), `AuthorityDecisionReceipt`,
`ExecutionReceipt`, delegated leases (`Lease.parent_lease_id`,
AND-composition invariant enforcement), a CI feature-matrix gap (`mcp`
never built), a release/publish required-checks single source of truth,
and a golden offline release-artifact smoke test. Designed but not
implemented: the Remote Approval Continuation Protocol and Intent
Contract foundation — see `docs/adr/ADR-015-remote-approval-
continuation-and-intent-contract.md` for why those two specifically
needed a design pass first rather than code.

**Decided:** 2026-08-28, as the explicit successor to the 2026-08-07
architecture-health freeze.

---

## Anh's own statement of the decision (kept verbatim)

> The new roadmap does not replace the existing architecture-health
> freeze. The old milestone must be explicitly closed against its
> remaining E2E, mutation-path, source-of-truth, and documentation exit
> criteria. Once closed, it is superseded by a new "Authority Depth"
> milestone. Capability Lease is the first new architectural priority;
> Intent Contract and causal evidence follow only after their required
> authority/evidence primitives exist. Milestone/debt tracking remains
> a permanent development invariant rather than a completed feature.

## Goal

**Deepen the authority model without increasing the number of execution
authorities.** Not "more features." Every item below extends a
primitive that already exists in `src/runtime/` and `src/capability/`
(`TurnEngine`, `RuntimeAuthority`, the 10-entry canonical capability
registry) — none of them add a new kind of thing that can execute.

## Priority order

| Priority | Work | Status | Why this order |
|---|---|---|---|
| P0 | Capability Lease | ✅ Done + hardened (2026-08-28: atomicity, token-aware scope matching) | most natural next step of authority that already exists |
| P0 | Approval continuation protocol (a Yana Runtime Protocol) | ✅ Done (2026-08-28: `PendingApprovalStore` + `resume_turn`, wired into `chat/headless.rs`, verified end-to-end against a real local model across two process invocations — `ADR-015` Part 1) | opens tools safely for Desktop/Web without inventing a new authority mechanism |
| P1 | Canonical `AuthorityDecisionReceipt` | ✅ Done (2026-08-28) | evidence for *why* a decision was made — item #3 of the audit, done first since `ExecutionReceipt` correlates to it |
| P1 | Canonical `ExecutionReceipt` | ✅ Done (2026-08-28) | foundation every later evidence feature needs |
| P1 | Delegation graph/rules | ✅ Done (2026-08-28: `Lease.parent_lease_id`, AND-composition invariant) | multi-agent gets real authority semantics before Intent Contract needs it |
| P2 | Intent Contract | 🟡 Enforcement done, declaration surface not — `narrow_by_intent` is real and tested (2026-08-28), but no client sets `TurnContext.intent` yet: this repo's multi-agent dispatcher does not exist, so there is no real caller for it, same honest gap `for_subagent` itself already had — `ADR-015` Part 2 | bounded plan execution, but only after delegation/lease exist to intersect against |
| P3 | Causal Evidence Graph | ⚪ Not started (correctly — the receipts feeding it now exist, per the phasing to its right) | built on real receipts, not built first as an empty graph |
| Optional | World State read-model projection | ⚪ Not started | only if UI/ops actually needs it — do not build for elegance alone |

Status legend: ⚪ not started · 🟡 designed, not implemented · ✅ done

Delegation is placed before Intent Contract on purpose: answering "what
does this agent want to do" is meaningless before answering "who
actually delegated what authority to this agent."

## P0 — Capability Lease

**Locked invariant, non-negotiable from the first ADR that implements
this:** a lease is not a cached authority decision. It is evidence
supplied *to* authority. `RuntimeAuthority` remains the sole authority
— a lease never bypasses it, and never lets a call skip the check.

```
Approval → Scoped Approval → Capability Lease
```

Every invocation still runs the full check, every time, even under an
active lease:

```
capability request
       ↓
canonical descriptor
       ↓
authority
       ↓
lease exists? subject matches? scope matches? not expired?
budget remains? HALT inactive? policy still permits?
       ↓
execute
```

A lease issued at 10:00 does not survive a HALT or policy change at
10:05. **Lease ≠ authority. Lease = evidence supplied to authority.**

Lease fields:

```
Lease {
    subject,
    capability,
    scope,
    constraints,
    issued_by,
    issued_at,
    expires_at,
    invocation_budget,
    cost_budget?,
    revocation_id,
}
```

Example shape:

```
Lease #7f21
Subject:      agent:test-fixer
Capability:   command.execute
Scope:        /repo/Yana-AI
Allowed:      cargo test, cargo clippy
Denied:       git push, network, package publish
Expiry:       14:30
Budget:       10 invocations
Issued by:    human
Revocable:    yes
```

## P1 — Canonical `ExecutionReceipt`

Every capability invocation emits one, regardless of outcome:

```
ExecutionReceipt {
    invocation_id,
    turn_id,
    parent_id,
    capability_id,
    subject,
    workspace_id,
    policy_snapshot_hash,
    input_hash,
    output_hash,
    started_at,
    completed_at,
    outcome,
}
```

This is the only piece of P3 (the evidence graph) that gets built now.
Do not build the graph itself until receipts are flowing from real
capabilities — see the phasing under P3 below.

## P1 — Delegation graph/rules

```
Human
  ↓ delegates
Coordinator
  ├── Research Agent
  ├── Code Agent
  └── Test Agent
```

Capability does not auto-inherit down the tree. The graph must enforce:

```
child authority ⊆ delegated parent authority
```

never `child > parent`. A subagent's effective capability set is
whatever its parent explicitly delegated, intersected with the parent's
own set — never a superset of either.

## P2 — Intent Contract

**Known flaw a naive version of this has, and why it's placed after
Lease/Delegation:** don't let the model's own self-declared intent
become the security boundary by itself — a model, or a prompt
injection, could just declare whatever it wants and have that be what
gets approved.

**Fix:** two stages, with the model's declaration explicitly untrusted:

```
MODEL DECLARATION (untrusted)
        ↓
YANA DERIVED ENVELOPE (authoritative maximum)
        ↓
EXECUTION CONTRACT
```

```
EffectiveEnvelope =
    ModelRequested
    ∩ HumanGranted
    ∩ PolicyAllowed
    ∩ DelegatedAuthority
```

The model can only ever shrink its own envelope by what it requests —
never expand it. If the model needs something it forgot to declare
mid-task, that's a pause/renegotiate, not a silent escalation. If it
declares something it was never granted (e.g. `git.push.force`), the
intersection with `HumanGranted`/`PolicyAllowed`/`DelegatedAuthority` is
empty and the request is denied — a prompt injection can *ask* for more
power through this channel, it cannot *grant itself* more power through
it.

## P3 — Causal Evidence Graph

**Known flaw a naive version of this has:** starting with "build a
graph database" produces a large new subsystem before the data feeding
it is trustworthy.

Build the primitives first, in order, until the graph is a natural
consequence of data that already exists rather than a thing built to
be filled later:

```
E0  canonical ExecutionReceipt schema        (this is the P1 item above)
E1  every capability actually emits a receipt
E2  turn ↔ capability correlation
E3  policy/approval correlation
E4  causal edges
E5  graph queries / visualization
```

Once every capability emits a correct receipt, most of what a "causal
graph" needs is already implied by `parent_id` chains across receipts —
E4/E5 become mostly query/visualization work, not new data modeling.

Target end-state query shapes (not a spec, just what this should
eventually answer):

- "Why did this file change?" — walk receipts backward from a mutation
  to the human request that ultimately authorized it.
- "What changed because of this agent?" — walk receipts forward from an
  agent/turn to every mutation it caused.

## Optional — World State read-model

**Explicitly demoted during design review** against `ADR-012`'s "one
mutable fact → one authoritative writer" principle: a CQRS-style
aggregated read-model that lags or has a bug could make a UI present
stale or wrong state while looking authoritative. Only build this if a
concrete UI/observability need shows up — not because the pattern is
elegant.

If it is ever built, the contract is fixed from day one:

```
WorldState is NON-AUTHORITATIVE.
Allowed:
  ✓ dashboards
  ✓ search
  ✓ observability
  ✓ human overview
  ✓ diagnostics
Forbidden:
  ✗ permission decisions
  ✗ approval decisions
  ✗ autonomy decisions
  ✗ mutation preconditions
  ✗ safety decisions
```

Every read carries `observed_at, source_revision, source_owner,
staleness` so a caller can always tell it is looking at a projection,
not the truth. No code path may ever consult World State to make an
authority decision — only `RuntimeAuthority`, querying the actual
owning subsystem, may do that.

## What this milestone deliberately does not include

Per the same scope discipline that produced `CURRENT-MILESTONE.md`: no
new model providers for their own sake, no large batch of new skills,
no new subsystem (vision, a big browser agent, social integrations, a
new scheduler) added because it "sounds good." A candidate feature must
do at least one of:

1. increase canonical power (a real new capability family, reviewed)
2. increase control (lease/delegation/intent — this milestone's actual
   content)
3. increase continuity (mission/memory/workspace — already exists,
   extend rather than duplicate)
4. increase observability/evidence (receipts/causal graph)

Anything that does none of the four goes to `ARCHITECTURE-DEBT.md` or a
backlog note, not into this milestone.

## Related

- `CURRENT-MILESTONE.md` — the milestone this one succeeds, and its
  exit gate this milestone waits behind.
- `docs/ARCHITECTURE-HEALTH-2026-08.md` — the original report; gets
  marked CLOSED/SUPERSEDED as part of `CURRENT-MILESTONE.md`'s exit
  gate, at which point this file becomes current.
- `docs/adr/ADR-012-yana-os-authoritative-ownership.md` — the
  one-writer-per-fact principle the World State section above is
  constrained by.
- `docs/adr/ADR-014-unified-runtime-authority-hierarchy.md` —
  `TurnEngine`/`RuntimeAuthority`/capability chain this milestone
  extends rather than replaces.
- `docs/adr/ADR-015-remote-approval-continuation-and-intent-contract.md`
  — the design (not yet implemented) for the two 🟡 rows above.
