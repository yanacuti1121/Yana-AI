# ADR-014 — Unified Runtime and Authority Hierarchy

**Status:** Proposed — Phase 3 governed Desktop adapter implemented for review  
**Date:** 2026-08-25  
**Decision owner:** Human project owner

## Context

Yana already has a Rust model plane, provider implementations, capability
runtime, autonomy policy, approval UI, resident Giám Thị, chat clients and
remote adapters. Their contracts are real, but turn orchestration still lives
inside individual clients. Adding a second imported agent core beside
`yana-rt` would preserve that split and create two execution authorities.

The project owner requires a stronger hierarchy:

1. Giám Thị is the root safety authority.
2. Yana owns policy, approval, identity, audit and autonomy.
3. One unified Rust runtime performs model turns and capability execution.
4. Providers, agents and tools are execution components, never authorities.

## Decision

Yana will absorb useful provider and agent-runtime patterns into its existing
Rust architecture. It will not ship a Goose sidecar, require Goose at runtime,
or place an imported core beside `yana-rt`.

```text
Giám Thị
  └─ Yana control plane
       └─ canonical turn runtime
            ├─ model/provider plane
            └─ capability execution plane
```

The initial contract is implemented in `src/runtime/`:

- a client-neutral `TurnRequest` and typed `RuntimeEvent` stream;
- one bounded provider/tool loop;
- cancellation that preserves partial output;
- a pause outcome for human approval rather than executing or denying a
  mutating capability implicitly;
- a fail-closed authority preflight before the provider is invoked;
- a second fail-closed authority check immediately before an approved
  mutating capability executes;
- canonical capability lookup for provider-facing tool names.

Provider-neutral tool protocol types belong to `src/model/tool.rs`. Chat keeps
only a compatibility re-export, so Desktop, remote adapters and future clients
do not depend on terminal ownership of provider protocol.

## Authority Order

### 1. Giám Thị

The runtime checks `.claude/state/GIAMTHI_HALT.lock` before any provider turn.
Any filesystem entry at that path means HALT. Failure to verify the path also
denies execution. Yana policy cannot override this decision.

### 2. Yana control plane

Tool names must resolve through `capability::Manifest`. Availability and
approval requirements come from the canonical descriptor:

- unavailable or unregistered capability: deny;
- read-only/no-approval capability: allow;
- mutating per-call capability: return `AwaitingApproval`;
- no client may convert `AwaitingApproval` into `Allow` without an explicit
  human approval event.

### 3. Unified runtime

The runtime may orchestrate providers, stream events and execute an already
authorized capability. It may not mint capability descriptors, remove HALT,
raise autonomy ceilings or write approval evidence on behalf of a human.

### 4. Providers and agents

Providers return text, usage and tool proposals. A model-proposed tool name is
untrusted input. It has no execution meaning until the Yana control plane maps
it to a canonical capability.

## Provider Expansion

Provider expansion uses one registry and protocol-family implementations. New
OpenAI-compatible services should normally add registration/configuration, not
duplicate streaming parsers. Providers with genuinely different wire formats
receive native implementations behind the same model-plane trait.

Provider count is not an authority boundary: local models, cloud APIs, Claude,
Codex and future runtimes all enter the same turn and capability pipeline.

## Migration Sequence

1. Establish runtime/model/capability contracts and tests. **Implemented.**
2. Adapt terminal chat to consume runtime events while preserving its existing
   approval interaction and persistence behavior. **Implemented.**
3. Adapt remote adapters to the same runtime. **Discord plain chat implemented.**
4. Adapt Desktop to the same runtime. **Implemented for all 17 configured
   providers, including Gemini and supported vision turns.**
5. Move provider wire implementations from chat ownership into model/provider
   ownership without changing request semantics.
6. Add protocol families and provider registrations in reviewed batches.
7. Remove remaining client-specific turn loops only after parity tests prove
   the shared runtime preserves cancellation, history, cost and approval behavior.

No mixed execution protocol is accepted during a client cutover: each client is
migrated atomically from its old complete loop to the new complete loop.

## Alternatives Rejected

- **Run Goose beside Yana:** two cores and ambiguous ownership.
- **Make Goose the executor and wrap it with hooks:** enforcement would sit
  outside the deepest execution boundary.
- **Route all providers through Python:** weakens packaging and duplicates the
  existing Rust model plane.
- **Let each client keep its own turn loop:** repeats the current architectural
  debt and makes governance inconsistent.
- **Make Giám Thị another runtime policy check:** a compromised runtime could
  then bypass or reorder the highest authority.

## Known Phase 3 Limits

- Electron Desktop turns use a stdin/NDJSON `yana-rt chat --headless` adapter
  and therefore cross the canonical runtime and authority chain. Image payloads
  are bounded and MIME-checked before entering a vision-capable provider.
  Browser-only yana-web deployments intentionally retain their JS gateway
  because they do not bundle a local Rust binary.
- Simultaneous multi-tool proposals still fail loudly rather than dropping a
  call; batching needs an approval UX and continuation contract first.
- Interactive terminal credentials keep their environment-variable behavior;
  Desktop sends its per-request key over child stdin, never process argv.
- OAuth remains a later slice. OpenAI-compatible Desktop providers share one
  Rust protocol implementation; Gemini uses its distinct native Rust adapter.
- Runtime events are in-process or local NDJSON; durable audit correlation is
  a subsequent integration step.

These limits are intentionally visible. None may be presented as implemented
until a client is wired through the runtime and its end-to-end tests pass.
