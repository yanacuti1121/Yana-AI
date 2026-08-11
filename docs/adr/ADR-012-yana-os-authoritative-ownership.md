# ADR-012 — Yana OS Authoritative Ownership and Staged Expansion

**Status:** Accepted for Program K Phases 3–10
**Date:** 2026-08-11
**Decision owner:** Human project owner; implemented by `yana-rt` maintainers

## Context

Program K Phase 2 found six places where multiple subsystems describe the same
thing. Treating those descriptions as interchangeable would create split-brain
agent status, ambiguous authorization and contradictory accounting. Yana OS
also has nine gaps whose safe implementation depends on platform-specific
process, secret and resource controls.

## Decision

Yana OS is the authoritative **management-plane metadata and policy view**. It
does not become a second executor.

| Contract | Authoritative owner | Yana OS relationship |
|---|---|---|
| Managed-agent identity and declared lifecycle | `src/os/` | Owns versioned records; lifecycle is cooperative until a supervisor exists |
| Conversation/session state and provider protocol | `src/chat/` | References sessions and consumes provider summaries; never rewrites chat history |
| Mission/task dependency state | `src/mission/` | References managed-agent ids when a future typed link is approved; remains the planning owner |
| Capability discovery and execution | Program J / `src/capability/` | OS consumes catalog/status and supplies policy; it does not duplicate execution adapters |
| Command/capability decisions | Guard and governance layers | OS supplies principal and policy context only after an identity ADR exists |
| Cost ledger and accounting semantics | `src/cost.rs` | OS resource preflight consumes the typed, strict accounting API |
| Token/circuit decisions | `src/guard/` | OS health reports evidence only; it never mutates guard decisions |
| Audit chain | Audit subsystem | OS health reports file/integrity evidence only; verification remains with audit tooling |
| Process lifecycle and kernel resources | Future supervisor | No OS record may claim authoritative liveness before this owner exists |
| Secrets and OAuth tokens | Future credential service | Current OS surface remains presence-only and never stores values |

Every mutable fact has exactly one writer contract. Read models may aggregate
facts, but must label unprobed, cooperative, missing and corrupt states rather
than infer health.

## Approved Phase 10 Slice

Only these capabilities passed the Phase 5 readiness threshold:

1. Move strict daily-ledger reading into the canonical `src/cost.rs` owner and
   make OS resource preflight consume it.
2. Add a read-only aggregate `os doctor` report over protocol marker, OS state,
   policy, ledger, guard state, audit evidence and credential presence.

The report performs no provider network probe and therefore says
`not-probed`, not `ready`. It does not repair, create or delete evidence.

## Deferred Decisions

- Supervisor/process-tree semantics need a platform contract for Linux cgroup
  v2, macOS, and Windows Job Objects.
- Credential storage needs a threat model, least-privilege scopes, rotation,
  revocation, audit and platform key-store decision.
- CPU/RAM enforcement depends on the supervisor and cannot be represented by
  caller estimates.
- Managed-agent authorization needs a principal model and policy evaluation
  order.
- Schema migration needs backup, version transition and rollback contracts.

## Consequences

### Positive

- No mixed ownership or second execution engine.
- Resource denial reads the same strict ledger semantics as the canonical cost
  owner.
- Operators get one truthful, automation-friendly health snapshot.
- Deferred features remain visibly blocked instead of appearing partially
  functional.

### Negative

- Cooperative heartbeats remain weaker than process supervision.
- Provider availability is not established by `os doctor`.
- Platform resource controls and secret lifecycle remain unavailable.

## Alternatives Rejected

- **Make Yana OS own all state:** rejected because it duplicates mission,
  chat, capability, guard and audit writers.
- **Route every operation through Python:** rejected because Rust already owns
  deterministic runtime contracts and a Python runtime is not guaranteed in
  every packaging path.
- **Implement supervisor/vault now:** rejected because readiness is below 80%
  and platform/security contracts are incomplete.
- **Best-effort health:** rejected because missing or corrupt evidence must not
  be reported as healthy.

## References

- `docs/programs/PROGRAM-K-PHASE-2-CAPABILITY-INVENTORY.md`
- `docs/programs/PROGRAM-K-PHASES-3-15.md`
- `docs/adr/ADR-008-shared-locking-infrastructure.md`
- Linux cgroup v2: https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html
- Windows Job Objects: https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- OWASP Secrets Management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- MCP architecture: https://modelcontextprotocol.io/specification/2025-06-18/architecture
- OpenTelemetry logs: https://opentelemetry.io/docs/specs/otel/logs/
