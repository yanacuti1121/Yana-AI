# Program K — Yana OS — Skeleton

**Status:** Draft — Phase 0 (Input) complete, Phase 1-9 explicitly skipped by
anh Tâm's override (see Implementation section below); a first read-only
implementation slice exists in `src/os/`
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
Still Phase 0-level (naming the areas, not designing them — Design
Goals/Architecture for each stays TODO until Phase 1+):

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

## Implementation (started 2026-08-09 — ADS v1 Phase 1-9 explicitly skipped)

This session flagged that "code now" contradicted the Scope note above (no
implementation before architecture/ADR/boundaries are approved). Anh Tâm
confirmed explicitly, via AskUserQuestion: "Có, anh muốn huỷ scope lock,
code ngay" — a deliberate override, recorded here rather than silently
acted on, per this repo's own rule that AI must not invent or quietly skip
Program process on its own judgment.

What exists as of this commit, in `src/os/` (`yana-rt os <subcommand>`):

- `os agent-list` — lists known agent chat sessions from
  `.yana-ai/chat-history/*.jsonl` (id, provider, model, turn count, last
  activity). Read-only; reuses `chat::history::list_recent_sessions`.
- `os credential-status` — reports which providers have an API key
  configured via environment variable, presence only, value never printed.
- `os resource-status` — thin wrapper over the existing `cost` ledger
  (`yana-rt cost show`).

What this is **not**: it does not constitute Phase 1 Specification, Phase 2
Capability Inventory, Phase 3 Architecture, or any ADR for the three
management areas. It does not add any new capability, mutation, sandboxing,
scheduling, or policy-enforcement logic — only read-only visibility over
state that already existed elsewhere in the crate (`chat::history`, the
provider env-var list, `cost`). Real design for agent lifecycle
management, a per-Gatekeeper credential model, and resource *enforcement*
(not just reporting) is still open — see Open Questions, unchanged.

Verification: `cargo build --release --features cli --bin yana-rt` (0
errors, 0 new warnings), `cargo test --release --features cli --bin
yana-rt -- --test-threads=1` (237/237 passed), plus a manual run of all
three subcommands against this repo's real `.yana-ai/chat-history/` and
cost ledger data.

## Design Goals

_(TODO — Phase 1, chưa điền)_

## Non-Goals

_(TODO — Phase 1, chưa điền)_

## Capability List

_(TODO — Phase 2, chưa điền)_

## Architecture

_(TODO — Phase 3, chưa điền. Không đề xuất trước theo đúng Scope ở trên.)_

## ADR References

_(TODO — Phase 6, chưa điền)_

## Readiness Checklist

- [ ] Repository Readiness
- [ ] Memory Readiness
- [ ] Runtime Readiness
- [ ] Governance Readiness
- [ ] Cost Readiness

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
