# Program K — Phase 2 Capability Inventory

**Phase:** ADS v1 Phase 2 — Capability Inventory
**Status:** Complete for the current repository snapshot
**Date:** 2026-08-11
**Scope:** Repository evidence only; this document does not approve new code or
expand Phase 1 into supervision, scheduling, secret storage, or kernel resource
control.

## Classification

- **Available:** production path exists and can be reused now.
- **Candidate:** implemented on `codex/yana-os-phase-1`, not merged.
- **Partial:** useful implementation exists, but it does not satisfy the whole
  Yana OS capability.
- **Gap:** no production implementation was found.
- **Deferred:** intentionally outside the approved Phase 1 boundary.

Priority means architectural importance to Yana OS, not permission to implement:

- **P0:** required for a safe management plane.
- **P1:** required before supervision/beta scope.
- **P2:** later platform capability.

`Owner` names the subsystem that should own the contract. Human approval remains
the governance owner for destructive or externally visible actions.

## Capability Matrix

| Name | Purpose | Input | Output | Dependency | Priority | Owner | Status |
|---|---|---|---|---|---|---|---|
| Versioned OS state | Persist one local management-plane schema safely | Project root + validated mutation | `.yana-ai/os/state.json` schema v1 | ADR-008 `flock-v1`, atomic rename | P0 | `yana-rt/os/state` | **Candidate** — private permissions, symlink rejection, corruption fails loud |
| Agent identity registry | Give a managed agent a stable provider-neutral identity | Name, provider, optional model/session/owner | UUID-backed agent record | Versioned OS state | P0 | `yana-rt/os/agent` | **Candidate** — metadata identity only, not an OS process identity |
| Agent lifecycle metadata | Record explicit lifecycle state and liveness evidence | Agent id, transition, heartbeat | `registered/running/stopped/failed` + timestamp | Agent registry | P0 | `yana-rt/os/agent` | **Candidate / Partial** — forward-only transitions; heartbeat is cooperative, not proof of life |
| Chat session persistence | Save and restore user/model conversations | Session metadata + message/tool events | JSONL history, metadata, workspace state | `yana-rt/chat/history` | P0 | `yana-rt/chat` | **Available** — save/load/rename/delete/export and root-aware inventory |
| Agent-to-session association | Relate management identity to a chat/execution session | Agent registration + optional session id | Stable reference in agent record | Agent registry, chat sessions | P1 | `yana-rt/os/agent` | **Candidate / Partial** — reference is accepted but referential integrity is not enforced |
| Mission/task orchestration | Model dependency-aware multi-agent work | Mission, tasks, owns/consumes/produces, evidence | Ready waves, task briefs, mission status | `yana-rt/mission`, ADR-008 lock | P1 | `yana-rt/mission` | **Available** — orchestration metadata; does not launch or supervise a process |
| Process launch and kill switch | Start bounded agent commands and stop one/all | Agent/task list, concurrency, target name | PID registry, logs, exit state | Bash, host signals | P1 | Future Yana OS supervisor | **Partial** — `multi-agent-launch.sh` exists separately; wrapper/process identity and daemonization are not unified with OS state |
| Process supervision | Prove liveness, reap children, forward signals, recover crashes | Managed executable/process identity | Authoritative running/exited/orphan state | Platform process APIs | P1 | Future Yana OS supervisor | **Gap / Deferred** — cooperative heartbeat is deliberately not supervision |
| Scheduling | Run approved work at a declared time/interval | Schedule, command/capability, policy | Durable scheduled execution + result | Supervisor, policy, persistence | P2 | Future Yana OS scheduler | **Gap / Deferred** — UI fragments and adapted reference code are not a production scheduler |
| Agent/capability catalog | Discover available agents, skills, commands and bounded tools | Canonical repository sources | Deterministic catalog | `core/agents`, skills, commands, `src/capability` | P1 | Program J capability runtime + Yana OS view | **Partial** — source catalogs and nine bounded host/repo functions exist; no single OS registry contract |
| Capability authorization | Decide which identity may invoke which capability | Agent identity, capability, policy, context | Allow/deny + reason | Identity, policy engine, capability catalog | P0 | Guard/policy layer | **Partial** — command/tool guards exist, but they are not keyed to the new managed-agent identity |
| Task routing | Classify work and recommend execution path/agents | Task description + sensitivity markers | Route decision, tier, suggested agents | `yana-rt/route`, agent routing config | P1 | `yana-rt/route` | **Available / Partial** — task routing exists; it is not a scheduler or authoritative model router |
| Provider abstraction | Keep UI/runtime independent of one model backend | Provider/model request | Health, models, streamed events, usage | `ChatProvider` | P0 | `yana-rt/chat/provider` | **Available** — Anthropic, OpenAI, Kimi, Ollama, LM Studio, llama.cpp, Turbofieldfare |
| Runtime/model health | Show whether a provider/model is usable | Provider + optional credential | Ready/unavailable/model metadata | Provider abstraction | P1 | `yana-rt/chat/provider` | **Partial** — trait and chat flows exist; aggregate OS status does not actively probe them |
| Credential presence inventory | Report credential configuration without exposing values | Canonical provider catalog + process environment | Presence-only human/JSON status | Provider abstraction | P0 | `yana-rt/os/credential` | **Candidate** — local/keyless providers included; empty env values are not treated as configured |
| Credential vault and OAuth lifecycle | Store, scope, rotate and revoke secrets securely | Credential material + identity + scope | Encrypted reference/token lifecycle | Security ADR, platform key store | P1 | Future credential service | **Gap / Deferred** — rules and security skills are not a runtime vault |
| Explicit resource policy | Persist declared concurrency/token/cost limits | Human-set limits | Versioned policy | OS state | P0 | `yana-rt/os/resource` | **Candidate** — missing policy fails closed |
| Resource preflight | Decide whether estimated work fits policy | Requested agents, token/cost estimate, current state | Allow/deny with reasons | Resource policy, cost ledger | P0 | `yana-rt/os/resource` | **Candidate** — concurrency/token/daily cost only; invalid ledger fails closed |
| Cost accounting | Record and summarize real token/cost usage | Model/tier/token usage event | `.yana-ai/ledger.jsonl`, totals/breakdowns | `yana-rt/cost`, bus payloads | P0 | `yana-rt/cost` | **Available / Partial** — append/report exists; OS currently owns a second strict reader that should converge in Phase 3 |
| Token budget and circuit breaker | Stop repetitive or over-budget tool loops | Tool identity, token/attempt state | Allow/deny, circuit state, fast-tier guidance | Rust guard, shared lock | P0 | `yana-rt/guard` | **Available** — cross-language state uses ADR-008; not yet represented in OS aggregate status |
| CPU/RAM/process limits | Enforce host resources per managed process | Process + hard limits | Kernel-enforced containment/accounting | Supervisor, platform sandbox APIs | P1 | Future supervisor/sandbox | **Partial / Deferred** — `sandbox-exec.sh` supports Docker/nsjail/ulimit, but no per-agent authoritative accounting |
| Sandboxed command execution | Run approved commands with bounded isolation | Validated argv + selected sandbox mode | Exit status, output, sandbox audit | Guard verdict, human approval, sandbox runtime | P0 | Guard + sandbox layer | **Available / Partial** — terminal tool path is wired; hook wrapping is opt-in and ulimit has no filesystem isolation |
| Human approval gate | Prevent model output from becoming automatic execution | Proposed command + guard verdict + key input | Approve/deny/acknowledge | Terminal TUI, destructive guard | P0 | `yana-rt/chat/tui` | **Available** — denied commands have no approval bypass path |
| Shared mutation locking | Serialize cross-language critical sections | Canonical resource/key + timeout | Kernel-held lock guard | ADR-008 `flock-v1` | P0 | `yana-rt/flock_v1` | **Available** on macOS/Linux; marker and maintenance gate fail closed |
| Memory services | Persist facts across sessions and promote knowledge | Key/value/tags/agent/confidence/scope | L3 facts and promoted L1 notes | `yana-rt/memory`, memory schemas | P1 | Memory subsystem | **Available / Partial** — not integrated with managed-agent lifecycle or OS policy |
| Agent event/message bus | Exchange addressed events and replies | From/to/type/payload | JSONL events, inbox/read/reply views | `yana-rt/bus` | P1 | Bus subsystem | **Available / Partial** — no delivery acknowledgement, retention contract or OS identity binding |
| Audit evidence chain | Preserve tamper-evident tool activity | Hook/tool event | Hash-chained audit log + verification | Audit hooks/scripts, shared lock | P0 | Audit subsystem | **Available** — integrity verification is separate from the OS status summary |
| Operational observability | Show activity, health, performance and failures | Audit/runtime/process/resource events | Human/JSON dashboards and alerts | Audit, supervisor, metrics | P0 | Observability subsystem | **Partial** — audit counts/breakdowns exist; no authoritative process, latency, CPU/RAM or scheduler metrics |
| Human identity and privilege tiers | Gate sensitive commands by authenticated operator tier | Claimed identity + credential/tier | Allow/deny | Identity gate, require-tier | P1 | Governance layer | **Partial** — shell-level sovereign/operator/guest model is not bound to managed-agent identities |
| Cross-engine enforcement | Apply the same active governance surfaces in Claude/Codex/etc. | Engine-native lifecycle/tool event | Shared guarded-hook decision | Adapter generation, hook mirrors | P0 | Adapter/governance layer | **Available / Partial** — Claude↔Codex active-hook parity is 23/23; other engine semantics remain adapter-dependent |
| State migration and rollback | Upgrade or revert schema/protocol without data loss | Current version + target version + quiesced runtime | Verified migrated/rolled-back state | Version gates, backups, maintenance mode | P0 | Yana OS state owner | **Partial** — locking cutover tooling exists; OS schema v1 rejects mismatch but has no state migrator yet |
| Platform portability | Provide the same safe contract on supported hosts | OS/architecture/runtime availability | Supported or actionable fail-closed result | Rust/Python/Bash packaging | P1 | Runtime/release layer | **Partial** — flock mutations are macOS/Linux only; Windows management mutation is unsupported |

## Existing-System Ownership Conflicts

Phase 3 must choose one authoritative owner for each conflict; running both as
independent writers would create split-brain state.

| Conflict | Existing owners | Required Phase 3 decision |
|---|---|---|
| Agent execution state | Yana OS agent registry; `multi-agent-launch.sh` PID registry | Supervisor becomes authoritative or launcher remains explicitly external; never silently merge statuses |
| Work lifecycle | Yana OS agent status; mission task status | Define whether a mission task owns an agent, references one, or remains an independent planning object |
| Session identity | Chat session UUID; managed-agent UUID; mission/task ids | Define typed relationships and lifecycle, not string conventions |
| Resource/cost data | `yana-rt/cost` ledger reader; OS strict daily-cost reader; token-budget state | One typed accounting API with explicit corruption and concurrency behavior |
| Capability discovery | Canonical agents/skills/commands; `src/capability`; Program J MCP | Program J owns execution capability registry; Yana OS consumes policy/status views rather than duplicating it |
| Human/agent authorization | identity-tier gates; command guards; managed-agent owner field | Define principal model and policy evaluation order before credential vault or supervision |

## Confirmed Gaps

1. No authoritative process supervisor or process-to-agent identity binding.
2. No production scheduler.
3. No encrypted credential vault, OAuth lifecycle or per-agent secret scope.
4. No kernel-enforced CPU/RAM accounting tied to managed agents.
5. No single typed resource/cost/accounting API.
6. No capability authorization keyed to managed-agent identity.
7. No OS-level health aggregation for providers, locks, audit integrity,
   memory, bus or token-budget circuits.
8. No schema migration/rollback implementation for OS state.
9. No Windows-safe mutation protocol.

## Evidence Map

| Area | Repository evidence |
|---|---|
| Phase 1 management plane | `src/os/`, `docs/adr/ADR-011-yana-os-phase-1-management-plane.md` |
| Locking | `src/flock_v1.rs`, `src/guard/lock.rs`, `core/lib/locking.sh`, ADR-008 |
| Sessions/providers/tools | `src/chat/history.rs`, `src/chat/provider.rs`, `src/chat/openai_compat.rs`, `src/chat/tools/` |
| Orchestration/execution | `src/mission/mod.rs`, `core/scripts/multi-agent-launch.sh` |
| Resource/cost/budget | `src/cost.rs`, `src/guard/token_budget.rs`, `core/hooks/budget-sentinel.sh` |
| Sandbox/governance | `core/scripts/sandbox-exec.sh`, `core/hooks/sandbox-wrap.sh`, `src/chat/tui/approval.rs` |
| Memory/bus/observability | `src/memory.rs`, `src/bus.rs`, `src/observability.rs` |
| Capability/runtime | `src/capability/mod.rs`, `src/route.rs`, `src/mcp.rs` |
| Identity/audit/adapters | `core/gates/identity-gate.sh`, `core/gates/require-tier.sh`, audit-chain scripts, engine parity tests |

## Phase 2 Exit Criteria

- [x] Every Phase 0 management area is represented.
- [x] Every capability has Name, Purpose, Input, Output, Dependency, Priority,
  Owner and Status.
- [x] Existing implementations are separated from candidates and gaps.
- [x] Duplicate ownership risks are explicit.
- [x] Deferred features are not presented as working.
- [x] Phase 3 inputs and blocking decisions are identified.

**Phase 2 result: COMPLETE.** This inventory unlocks Phase 3 architecture
design only; it does not authorize implementation of confirmed gaps.
