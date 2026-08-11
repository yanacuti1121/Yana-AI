# ADR-013 — Autonomy Ladder and Sovereign Boundary

**Status:** Accepted for the Yana OS automation foundation
**Date:** 2026-08-11
**Decision owner:** Vũ Văn Tâm
**Implementation:** OpenAI Codex

## Context

Yana's product direction is automatic operation by default. The current system
can observe, guard and plan, but it does not have one typed contract that says
which work may continue automatically and which work must stop for a human.
Scattered prompts and shell gates cannot safely substitute for that contract.

## Decision

Yana uses five ordered autonomy levels:

| Level | Meaning | Default behavior |
|---|---|---|
| Observe | Read state and collect evidence | Automatic |
| Diagnose | Explain failures and produce plans | Automatic |
| Reversible | Apply bounded changes with verification and rollback | Automatic |
| Bounded | Create worktrees/branches, local commits and draft PRs | Automatic |
| Sovereign | Merge protected branches, release/deploy, secrets, destructive persistent-data changes, security-policy changes | Human approval required |

The sovereign level is not configurable as automatic. Disabling automation or
lowering the automatic ceiling makes affected actions wait for approval; it
does not silently discard them.

Verification is mandatory for every reversible or bounded action. A reversible
fix also requires a rollback command. These are safety invariants rather than
operator-tunable switches.

The closed loop is:

`observe -> diagnose -> plan -> enqueue -> execute -> verify -> rollback on failure -> audit`

This first slice owns policy evaluation and durable intent persistence. It does
not execute arbitrary commands. A later executor must independently map typed
operations to an allowlisted capability, re-evaluate policy at execution time,
enforce resource budgets, record evidence and perform rollback. A caller's
claimed level is never sufficient authorization.

## State Ownership

- `.yana-ai/os/autonomy-policy.json` is the operator-configured policy.
- `.yana-ai/os/autonomy-queue.json` is the durable action-intent queue.
- Both are private, atomic regular files protected by ADR-008 kernel flock.
- Existing mission, chat, guard, cost and audit owners remain authoritative for
  their own data. The queue references work; it does not duplicate those stores.

## Consequences

- Routine, reversible work can advance without repeated prompts.
- High-impact actions keep an explicit human boundary.
- A durable queue makes crashes and restarts observable.
- Executor and scheduler work cannot claim production readiness until command
  allowlisting, verification evidence, rollback and platform supervision exist.

## Rejected Alternatives

- **Fully autonomous merge/release:** violates the sovereign boundary and makes
  one classification error irreversible.
- **Prompt-only policy:** is not machine-verifiable and drifts between clients.
- **Route all work through Python:** Python is not guaranteed in every package;
  `yana-rt` remains the deepest runtime owner.
- **Execute user-provided command strings:** rejected; execution must use typed
  argv and a capability allowlist, never shell evaluation.
