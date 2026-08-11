# Program K — Yana OS — Skeleton

**Status:** ADS v1 Phases 3–15 complete for the readiness-approved accounting
and aggregate-health hardening slice. The Phase 1 management plane remains a
candidate; process supervision, secret storage, scheduling, kernel resource
control and Windows mutation remain blocked below 80% readiness.
**Created:** 2026-08-09
**Phase 0 answered by anh Tâm:** 2026-08-09

> Tên "Program K" và chữ cái K vẫn là suy đoán hợp lý, CHƯA xác nhận
> (D/F/G/H/J đã có tên hoặc file; E/K chưa thấy dùng ở đâu trong repo tại
> thời điểm tạo file này). Anh Tâm đã xác nhận đây là một Program hoàn
> toàn mới, khác với "Program G — Universal AI Platform" đã được nhắc
> tên sẵn trong `ADS-v1.md`.
>
> Phase 0 dưới đây là nguyên văn câu trả lời của anh Tâm (2026-08-09),
> không phải paraphrase của AI — theo đúng luật "AI không tự suy diễn
> nội dung Program" ở đầu `README.md` trong thư mục này.

## Vision

Yana OS is **not** a general-purpose operating system.

Yana OS is an **AI Agent Operating System**: a local-first execution and
governance platform that provides a consistent runtime environment for
AI agents.

Its responsibility is to manage agent lifecycle, identity, capabilities,
execution sessions, policies, sandboxing, memory, scheduling and
observability, while delegating deterministic enforcement to `yana-rt`.

The goal is to make different AI providers (Claude, Codex, Cursor, local
models, future providers) operate under one unified execution model.

## Relationship to Yana AI

Yana AI remains the product users interact with.

Yana OS is the underlying platform that powers Yana AI.

- **Yana AI** focuses on user experience, workflows and orchestration.
- **Yana OS** focuses on runtime, governance, execution environment and
  system services.

## Relationship to yana-rt

`yana-rt` is the deterministic runtime core.

Yana OS does **not** replace `yana-rt`.

Instead, Yana OS builds on top of `yana-rt` and uses it for policy
enforcement, capability validation, guard execution and deterministic
runtime behavior.

## Research Reference

`cloudflare-os` (github.com/cloudflare/cloudflare-os, Apache 2.0, v2
rewrite) is used **only** as architectural inspiration — not a code
source, not something Yana OS contributes back to (they state "not
seeking outside contribution").

Yana OS will be designed independently around **local-first,
provider-neutral, and deterministic execution** principles.
Cloudflare-specific infrastructure assumptions (Workers, Durable
Objects, cloud services, etc.) are **not** architectural dependencies.

Specific point of interest carried over from the 2026-08-09 discussion
that prompted this Program: `cloudflare-os`'s per-Gatekeeper
OAuth/credential model (each external service — GitHub, Google, Slack,
Notion — has its own setup flow) is worth studying for how Yana OS
handles provider/service credentials, but the concrete design is not
yet specified (see Open Questions).

## Scope (explicit, 2026-08-09)

**Phase 0 only defines architecture.** No implementation, migration, or
refactoring should be proposed until the architecture, ADRs, and
boundaries are approved. This applies to AI-side work in future
sessions too, not just this one.

## Management Infrastructure — three areas (explicit, 2026-08-09)

Anh Tâm confirmed all three of the following are in scope for Yana OS's
"management infrastructure" layer (asked as a follow-up to Vision, to
sharpen what "manage agent lifecycle... policies..." concretely covers).
At that time this was Phase 0-level only (naming the areas, not designing
them). The Phase 1 management-plane boundary and Phase 2 inventory below now
record the approved design and the remaining gaps:

1. **Agent management** — lifecycle, identity, execution sessions (the
   "agent lifecycle, identity... execution sessions" already named in
   Vision — this confirms it as one of the three concrete management
   areas, not just prose).
2. **Credential management** — API keys / OAuth per provider or
   external service, in the spirit of `cloudflare-os`'s per-Gatekeeper
   credential model referenced above.
3. **Resource management** — system resources agents consume (CPU/RAM/
   quota/cost), i.e. governing what an agent is allowed to spend, not
   just what it's allowed to touch.

## Implementation

This session flagged that "code now" contradicted the Scope note above (no
implementation before architecture/ADR/boundaries are approved). Anh Tâm
confirmed explicitly, via AskUserQuestion: "Có, anh muốn huỷ scope lock,
code ngay" — a deliberate override, recorded here rather than silently
acted on, per this repo's own rule that AI must not invent or quietly skip
Program process on its own judgment.

The original 2026-08-09 Phase 0 slice added three read-only compatibility
commands after the explicit override above:

- `os agent-list` — lists known agent chat sessions from
  `.yana-ai/chat-history/*.jsonl` (id, provider, model, turn count, last
  activity). Read-only; reuses `chat::history::list_recent_sessions`.
- `os credential-status` — reports which providers have an API key
  configured via environment variable, presence only, value never printed.
- `os resource-status` — thin wrapper over the existing `cost` ledger
  (`yana-rt cost show`).

The 2026-08-11 Phase 1 management-plane implementation advances that baseline:

- Versioned state in `.yana-ai/os/state.json`, protected by ADR-008
  `flock-v1`, private permissions, symlink rejection and atomic replacement.
- Stable managed-agent identities with provider/model/session/owner metadata,
  validated forward-only lifecycle transitions and cooperative heartbeat
  evidence.
- One canonical chat-provider catalog shared with credential status, including
  Ollama, LM Studio, llama.cpp and Turbofieldfare local runtimes.
- Explicit concurrency, per-request token and daily-cost policy. Preflight
  denies when policy is absent, rejects corrupt ledger data rather than
  under-counting it, and uses only real ledger cost plus caller estimates.
- Root-aware human and JSON CLI output. `--dir` never changes process-global
  working directory.

What this is **not**: no daemon, process start/kill, secret vault, scheduler,
CPU/RAM enforcement or autonomous action. Heartbeats are cooperative metadata,
not proof of process liveness. Mutating commands require the repository's
`flock-v1` protocol marker and fail closed if the protocol is unavailable.

## Design Goals

1. One local management namespace built on `yana-rt`, not a second runtime.
2. Persistent, versioned state under `.yana-ai/os/` with atomic writes and the
   repository's canonical `flock-v1` protocol.
3. Provider-neutral agent identity and lifecycle metadata.
4. Credential visibility without storing or printing credential values.
5. Deterministic resource preflight from explicit user policy and real ledger
   data; missing policy fails closed.
6. Human-readable and JSON output for automation.
7. Backward compatibility for the three Phase 0 read-only commands.

## Non-Goals

- No general-purpose operating system.
- No daemon, scheduler or autonomous process launcher in Phase 1.
- No process termination or signal delivery.
- No API-key/OAuth secret store. Environment/provider vault work requires a
  separate security design and threat model.
- No claimed CPU/RAM enforcement. Phase 1 enforces only declared concurrency,
  estimated token and daily cost preflight limits.
- No replacement for Program J capabilities, chat providers, mission dispatch,
  hooks, or `yana-rt` guards.

## Capability List

The complete ADS v1 Phase 2 matrix is maintained in
`PROGRAM-K-PHASE-2-CAPABILITY-INVENTORY.md`. It inventories 32 capabilities
across the current management-plane candidate and the reusable Rust/Bash/Python
subsystems, with Purpose, Input, Output, Dependency, Priority, Owner and Status
for every row.

Phase 2 confirms nine material gaps: authoritative supervision, scheduling,
credential vault/OAuth lifecycle, per-agent CPU/RAM enforcement, unified typed
accounting, managed-agent authorization, aggregate health, OS-state migration,
and Windows mutation support. It also identifies six ownership conflicts that
Phase 3 must resolve before any further implementation.

## Architecture

```text
yana-rt os CLI
      │
      ├── Agent service ───── chat history (read-only)
      │          │
      ├── Credential service ─ provider catalog + env presence only
      │          │
      └── Resource service ── cost ledger + explicit policy
                 │
          Versioned OS state
                 │
      flock-v1 + atomic file replace
```

The management plane owns metadata and policy. Existing execution paths remain
owned by `yana-rt`; Phase 1 does not route around guards or create a parallel
execution engine.

## Interfaces

- `yana-rt os init`
- `yana-rt os status [--json]`
- `yana-rt os doctor [--json]`
- `yana-rt os agent list|register|heartbeat|transition`
- `yana-rt os credential status [--json]`
- `yana-rt os resource show|set|check`
- Compatibility: `agent-list`, `credential-status`, `resource-status`

## Data Flow

Mutation: CLI input → validate → acquire `flock-v1` → read current schema →
apply one transition → write private temporary file → atomic rename → release.

Read: CLI → load state without mutation → combine only with existing canonical
sources → render human or JSON output. Credential values never enter a result
object.

## Workflow

1. `os init` creates schema v1 with no implicit spend limits.
2. Human sets explicit resource policy.
3. Agent is registered and receives a stable id.
4. Agent/runtime sends heartbeats and explicit lifecycle transitions.
5. `resource check` evaluates policy before work begins; missing policy denies.
6. `os status` exposes evidence for humans and automation.

## ADR References

- `docs/adr/ADR-011-yana-os-phase-1-management-plane.md`
- `docs/adr/ADR-012-yana-os-authoritative-ownership.md`
- `docs/adr/ADR-008-shared-locking-infrastructure.md`

## Readiness Checklist

- [x] Repository — existing `src/os/`, CLI namespace and tests
- [x] Knowledge — Phase 0 vision and explicit three management areas
- [x] Notebook — this Program file records decisions and boundaries
- [x] Memory — versioned local state location defined
- [x] Runtime — `yana-rt` and provider/cost/session sources exist
- [x] Governance — human-controlled mutations; no autonomous kill/start
- [x] Security — no secret values; private state; canonical locking
- [x] Benchmark — 60-run local status/doctor command benchmark recorded
- [x] Cost — reuse real ledger; no new service dependency
- [x] Context — scoped Phase 1 interfaces and non-goals are explicit

**Readiness: 100% (10/10) for the strict-accounting and read-only-doctor
slice.** Scores for the deferred daemon, scheduler, credential vault,
authorization, migration, Windows mutation and kernel resource-control work
remain 40–55% and therefore BLOCKED. Full scoring and Phase 3–15 evidence are
in `PROGRAM-K-PHASES-3-15.md`.

## Open Questions

- Chữ cái "K" có đúng không, hay anh Tâm muốn tên/chữ cái khác?
- Ranh giới cụ thể giữa "Yana OS quản lý execution sessions/sandboxing"
  và Program J (Universal Capability Runtime, đã có MCP Server +
  `src/capability/` spike) — Yana OS có bao trùm Program J, hay Program
  J là một thành phần bên trong Yana OS's "delegates to yana-rt" model?
- Quan hệ với `docs/LOCAL_EMBODIMENT_RUNTIME.md` (2026-08-08, về
  `src/capability/` + MCP 9 tool đọc-only, hiện chưa merge vào main) —
  một phần của Yana OS's capability layer, hay việc riêng?
- Mô hình OAuth/credential-per-service cụ thể: tái dùng
  `66-client-secret-encryption-law.md`'s encryption-at-rest pattern, hay
  cần thiết kế mới cho multi-provider identity mà Vision nhắc tới?
- "Agent lifecycle, identity, sessions, scheduling, observability" —
  phần nào trong số này đã có sẵn rải rác trong repo (vd. session_id
  trong `src/chat/tui.rs`, audit log hash-chain, circuit breaker) và có
  thể tái dùng trực tiếp, phần nào cần xây mới hoàn toàn? (Câu hỏi cho
  Phase 2 Capability Inventory, không cần trả lời ngay ở Phase 0.)
