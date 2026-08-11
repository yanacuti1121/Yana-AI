# ADR-011 — Yana OS Phase 1 Is a Local Management Plane

**Status:** Accepted for Phase 1 implementation
**Date:** 2026-08-11

## Decision

Implement Yana OS Phase 1 as a versioned local management plane inside
`yana-rt`. It stores agent metadata and explicit resource policy under
`.yana-ai/os/`, reads provider credential presence and the existing cost/chat
sources, and exposes human-readable plus JSON CLI output.

State mutations use ADR-008 `flock-v1` and atomic file replacement. The state
schema never contains credential values.

## Problem

Phase 0 exposes three disconnected read-only commands. It does not provide a
stable agent identity, lifecycle evidence, explicit resource policy, safe
concurrent mutation, machine-readable status, or a coherent management-plane
contract.

## Alternatives

1. **Build a daemon now.** Rejected: supervision, recovery and platform
   security are not specified.
2. **Store API keys in OS state.** Rejected: this needs its own credential
   threat model and encryption/key-management design.
3. **Use a database.** Rejected: a local versioned file is sufficient for the
   Phase 1 scale and keeps installation dependency-free.
4. **Keep three read-only wrappers.** Rejected: it does not advance the
   management-plane goals.

## Trade-offs

- Heartbeats are cooperative evidence, not proof that a process is alive.
- Resource checks enforce declared concurrency/token/cost policy only; they do
  not claim CPU/RAM kernel enforcement.
- `flock-v1` means mutations are currently supported on macOS/Linux. Other
  platforms receive an actionable unsupported error rather than unsafe writes.

## Consequences

- Yana OS gains a real, testable contract without bypassing `yana-rt`.
- Later supervision and credential-vault ADRs can build on a stable schema.
- Legacy Phase 0 commands remain available during migration.
- No mixed locking protocol or new third-party dependency is introduced.
