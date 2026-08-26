# Yana Control Planes — Challenger, Governor, Local Embodiment Runtime

> **Implementation update (2026-08-26):** this document preserves the original
> control-plane design and gap analysis. Several “not implemented” statements
> below are now historical: the canonical capability runtime, Yana OS state and
> governor foundations, resident supervision, unified turn runtime, local/cloud
> provider plane, Desktop/packaged-Web adapter, Discord plain-chat adapter, and
> MCP capability/workspace adapters now exist. Current execution authority and
> interface boundaries are defined by
> [`ADR-014`](adr/ADR-014-unified-runtime-authority-hierarchy.md). Keep reading
> this document for design intent, not current implementation status.

**Status:** Draft — preserved 2026-08-08 per anh's explicit mandate
(saved verbatim in the assistant's persistent memory,
`feedback_control_planes_preservation_mandate_2026_08`). This document
consolidates the design; none of the three systems are implemented yet.
Documentation-only pass — no code, no dependencies, no production
changes.

**Read this first if you're new to the idea:** anh's own framing,
2026-08-07 — not two independent new branches, but a governance layer
sitting on top of infrastructure that (mostly) already exists in this
repo. The risk this document exists to prevent: building three
separate AIs, three daemons, three scanners, when in fact all three are
consumers of one shared observation/capability/evidence/guard/audit
layer. Splitting them apart just replaces one tangle with a new one.

## Why now

`docs/ARCHITECTURE-HEALTH-2026-08.md` — anh's 50-item self-assessment —
names the root cause as a development *habit*, not a missing feature:
"thấy hay là nhảy vào" (jumps into a new subsystem the moment it looks
interesting), "khó bỏ ý tưởng" (can't let go of an idea once it exists),
"thiếu cơ chế 'Không'" (no mechanism to say no). The three systems below
are that mechanism, made concrete:

- **Idea Challenger** is the "Không" mechanism for individual proposals.
- **Evolution Governor** is the "Không, not yet — here's the order"
  mechanism for the whole roadmap.
- **Local Embodiment Runtime** is the actual blocked work (Architecture
  Health Report items 🔴 1/2/3/6/7) these two exist to protect while it
  gets built — a local AI still can't read this repo, that is the
  single named blocker, and it is real, not hypothetical.

## What already exists — do not rebuild these

Found during the required Phase 1 investigation (full detail in the
assistant's memory record) — every one of the three systems below leans
on real, running infrastructure already in this codebase:

| Need | Already built | File |
|---|---|---|
| Evidence a command actually ran | HMAC-signed receipt, `yana-rt evidence run` | `src/evidence/mod.rs`, `crypto.rs` |
| Human approval gate before mutation | y/N gate, guard-denial has no override | `src/chat/tui/approval.rs` |
| Typed event bus | `yana-rt bus emit/read/reply/inbox`, JSONL | `src/bus.rs` |
| Long-term structured memory | `L3Fact` (key/value/tags/confidence/scope/promoted) | `src/memory.rs` |
| Session-scoped memory | `L2_session/` | `core/memory/L2_session/` |
| Read-only repo capabilities (tree/read/search/git/host/process) | 9 MCP tools, built | `src/capability/` + `src/mcp.rs` — **built but not merged to `main`**, see Known Gaps below |
| Per-Program development process (spec → research → design review → readiness → roadmap) | ADS v1, 16 phases | `docs/programs/ADS-v1.md` |
| Proposal red-teaming (4-axis: logic/security/UX/scalability) | `/challenge` command | `core/commands/challenge.md` — imported, currently unwired to this repo (see Known Gaps) |
| Overlap-check before creating something new | Pre-creation checklist, scoped to skills/rules today | `.claude/rules/rule-consistency-policy.md` |

## Known gaps (must be closed, not silently worked around)

1. **`src/capability/` + `src/mcp.rs`'s 9 read-only tools exist only on
   the old branch `fix/turbofieldfare-provider-entry` (commit
   `cfdf0d4d`), never merged.** PR #117 only carried 2 unrelated
   commits. An untracked `src/yana-program-j-capability-runtime-rust.zip`
   sits in `src/` — looks like a manual backup of the same code. Before
   any Eyes/Hands work in Local Embodiment Runtime starts, this needs a
   real decision: recover and merge the existing implementation, or
   confirm it should be rebuilt. Do not silently rebuild a third
   version without checking the zip and the old branch first.
2. **`core/commands/challenge.md` references files that don't exist in
   this repo** (`PRD.md`, `SOUL.md`, `docs/technical/DECISIONS.md`) —
   imported from a generic template (commit `430a60b0`) and never
   adapted. Idea Challenger extends this command's structure but must
   point at real Yana AI files (see `IDEA_CHALLENGER.md`).
3. **`src/chat/tools/read_file.rs` independently re-implements file
   reading** instead of calling `src/capability::read_file` — a real,
   already-shipped instance of the exact duplication this whole effort
   exists to stop. Flagged for `EVOLUTION_GOVERNOR.md`'s roadmap as a
   CONSOLIDATE item, not fixed silently here (that would be
   implementation, out of scope for a documentation-only pass).
4. **`docs/ARCHITECTURE.md` describes a pre-`yana-rt` version of Yana
   AI** (no server/daemon/database) that no longer matches reality.
   Not fixed here — flagged as a real, separate source-of-truth gap
   (Health Report item 🟠 22/23).

## Control-plane relationship

```
                 ┌─────────────────────────────┐
                 │           anh (maintainer)   │
                 └──────────────┬──────────────┘
                                │ idea / goal
                                ▼
┌──────────────────────────────────────────────────────────┐
│                   GOVERNANCE PLANE                        │
│  ┌──────────────────┐       ┌─────────────────────────┐   │
│  │ Idea Challenger   │──────▶│ Evolution Governor      │   │
│  │ admission verdict │       │ health + capacity +     │   │
│  │ (REJECT/DEFER/    │       │ NOW/NEXT/LATER roadmap  │   │
│  │  EXTEND/EXPERIMENT│       │                         │   │
│  │  /APPROVE)        │       │                         │   │
│  └──────────────────┘       └────────────┬────────────┘   │
└──────────────────────────────────────────┼─────────────────┘
                                           │ BUILD_READY contract
                                           ▼
┌──────────────────────────────────────────────────────────┐
│                    BUILDER PLANE                           │
│       Claude / Codex / Cursor / Antigravity                │
│       implements only an approved contract                │
└───────────────────────────┬──────────────────────────────┘
                            │ capability requests
                            ▼
┌──────────────────────────────────────────────────────────┐
│              LOCAL EMBODIMENT RUNTIME                      │
│     Eyes ──▶ Reasoning ──▶ Hands / Legs                    │
│       │                         │                           │
│       └──── Memory / Events ◀───┘                           │
│      Guard → Approval → HALT → Audit → Canonical Executor  │
└──────────────────────────────────────────────────────────┘
```

**Two planners, never merged into one:**

- **Runtime Task Planner** — plans a single task ("how do I fix this
  test"). Already exists informally in `yana-ai chat`'s turn loop.
- **Evolution Governor** — plans the evolution of the whole system
  ("what should Yana absorb this cycle"). New.

Neither may bypass the canonical executor. Only the canonical executor
(the one that already backs `run_command.rs` and the guard/approval
chain) mutates anything, regardless of which plane requested it.

## Non-goals (explicit, per mandate)

- Fully autonomous project governance — anh approves NEXT → NOW, always.
- Automatic merging, automatic self-modification.
- An AI council of many debating agents — two roles (Challenger,
  Governor), not a swarm.
- A second event bus, second capability runtime, second mutation
  executor, second evidence format — every one of those already exists
  once (see table above); reuse, don't duplicate.
- Continuous screen capture by default.
- Automatic long-term memory from every observation (observation ≠
  memory — see `LOCAL_EMBODIMENT_RUNTIME.md`).
- Building all three systems at once (see Implementation Waves in
  `LOCAL_EMBODIMENT_RUNTIME.md` — Wave 0 first, nothing in parallel).
- New production dependencies without evidence.

## Core principles

1. Local-first
2. Provider-independent
3. Human-controlled
4. Fail-closed
5. Least privilege
6. Typed and auditable
7. One canonical mutation path
8. Evidence before expansion
9. Extend before creating
10. Capacity before scheduling

## Documents in this set

- `IDEA_CHALLENGER.md` — System A design
- `EVOLUTION_GOVERNOR.md` — System B design
- `LOCAL_EMBODIMENT_RUNTIME.md` — System C design (eyes/hands/legs/memory,
  implementation waves)
- `ARCHITECTURE-HEALTH-2026-08.md` — the 50-item report that motivated
  all three
- `docs/programs/PROGRAM-J-SKELETON.md` — Program J (Universal
  Capability Runtime); System C's Eyes/Hands is a direct continuation
  of this Program's already-built (unmerged) work, not a fresh start
- `docs/programs/ADS-v1.md` — the per-Program process Evolution
  Governor generalizes across the whole project

## Validation (Phase 3)

- Links above point to real paths, checked at write time (2026-08-08).
- No conflict with existing governance docs — none of the 7
  originally-named files existed to conflict with; the 3 that had
  equivalent content (`docs/ARCHITECTURE.md` sections) are linked, not
  duplicated.
- No duplicate canonical source of truth created — this doc explicitly
  points at existing evidence/approval/bus/memory/capability code
  instead of re-describing a new version of any of them.
- No production code changed. No dependency added.
- Files touched by this pass: `docs/YANA-CONTROL-PLANES.md` (new),
  `docs/IDEA_CHALLENGER.md` (new), `docs/EVOLUTION_GOVERNOR.md` (new),
  `docs/LOCAL_EMBODIMENT_RUNTIME.md` (new), `docs/ARCHITECTURE.md`
  (cross-reference added), `docs/programs/PROGRAM-J-SKELETON.md`
  (cross-reference added).
