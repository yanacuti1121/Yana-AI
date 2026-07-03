**Rule:** agent-hierarchy-law
**Status:** REVIEWED
**Gate:** L1 — infrastructure-write review requirement
**Source:** yana-ai (rewritten 2026-07-03 — see [[54-bft-consensus-law]] for the mechanism this rule now points to)

---

# Agent Hierarchy Law

## Tier disambiguation (read this first)

This repo uses the word "tier" for three separate, unrelated things. Before this rewrite, this file added a fourth. It doesn't anymore — there are two:

1. **Rule-priority tiers** (`00-meta-rule-enforcer.md`, Tier 0–5) — which *rule* wins when two rules conflict. Nothing to do with agents.
2. **Operator-privilege tiers** (`core/gates/require-tier.sh`, guest/operator/sovereign) — a real, working, human-identity gate. Nothing to do with agents either; it gates what the *human* is authenticated to authorize.

There is no third, agent-authority tier system. The "TIER 1 security-team / TIER 2 core-development / ..." hierarchy this file used to define was never enforced by any code — `swarm-orchestrator.sh` is a manual CLI, not something any hook invokes automatically — and inventing a fourth meaning for "tier" only made the other two harder to find. What this file actually needs (independent review before a risky write, blocking power for a serious finding) doesn't require a tier system at all — see below.

## Principle

Before a change lands in critical infrastructure, it gets read by someone other than the agent that wrote it. That's the whole requirement. The mechanism is: the main agent dispatches independent review subagents (per [[54-bft-consensus-law]]'s category table) and a Safety-severity finding from either one blocks the write until a human resolves it.

## Review Roles

Not an authority hierarchy — a mapping of *which* existing, already-read-only agent persona reviews *which kind* of change. Full trigger-path table lives in [[54-bft-consensus-law]] (single source, not duplicated here); the roles it draws from:

```
security-team/security-auditor.md   — reviews every category (rules, hooks/gates,
                                       agent personas, integrity files) — the one
                                       constant across all four
architecture-auditor.md             — paired reviewer for rules and agent personas
code-auditor.md                     — paired reviewer for hooks/gates and
                                       integrity-file-triggering changes
```

All three are already read-only per [[subagent-policy]] — there's no separate "can this agent write" question to answer, subagent-policy.md already settled it for every subagent regardless of which persona is dispatched.

## Blocking rule

Any Safety-severity finding (per [[conflict-resolution]]'s existing Safety > Correctness > Performance > Style order) from a dispatched reviewer blocks the write. The main agent does not proceed, does not "note it and continue," and does not let a second reviewer's clean report override the first one's Safety finding — Safety wins regardless of what else was reported. Resolve via [[conflict-resolution]] Strategy C (human escalation), same procedure already used for any other direct conflict between subagent recommendations.

Correctness-severity findings that break an existing enforced gate or test are also blocking, by the same [[conflict-resolution]] priority order. Performance/Style findings are advisory — they don't invent a new severity scale here, they use the one that already exists.

## What actually backstops this today

Not a fabricated file-access-by-tier ACL — three real mechanisms already enforce most of what that table used to claim:

```
subagent-policy.md            — every subagent, regardless of persona, cannot
                                 Write/Edit/commit/push/run-hooks; this is a
                                 categorical block, not a tier-conditional one
git-push-enforcement.md       — human gate before anything reaches origin,
                                 independent of who/what proposed the change
67-core-integrity-lock-law.md — core/ files are SHA-256-pinned in
                                 core-lock.json; an out-of-band change to a
                                 pinned file is detected on the next verify,
                                 not prevented by an agent-side permission check
```

## Anti-Pattern Checklist

```
❌ Proceeding with an infra write after a reviewer returns a Safety-severity
   finding, because a second reviewer's report looked clean
❌ Dispatching only one reviewer when 54-bft-consensus-law.md's category
   table calls for two
❌ Treating an advisory (Performance/Style) finding as blocking, or a
   blocking finding as advisory — conflict-resolution.md's priority order
   already answers which is which
❌ Re-introducing a tier/authority vocabulary for agents — if a future
   change genuinely needs one, it needs a fresh design, not a revival of
   this file's old async-voting model
❌ Skipping the review step because the change "is small" — see
   54-bft-consensus-law.md's trigger-path table; if the path matches,
   the size of the diff isn't the gate
```
