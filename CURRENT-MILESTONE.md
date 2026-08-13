# Current Milestone

**Status:** Active
**Started:** 2026-08-07 (anh's Architecture Health Report)
**Target:** 2-3 months from start (per the report's own estimate — no fixed date, evidence-gated instead)

---

## Why this file exists

`docs/ARCHITECTURE-HEALTH-2026-08.md` (item 4, "Chưa có Current Milestone")
named the absence of this exact file as a blocker: too many ideas, no
single place saying "what are we doing this cycle" — so neither anh nor
an AI session working on the repo could tell a good-but-off-milestone
idea apart from the actual current work without re-deriving it from
scratch each time.

`feedback_architecture_health_freeze_2026_08` (session memory) makes this
file's role explicit: before starting any new Yana AI subsystem, feature,
or exploratory work, check it against the 5 priorities below. If it isn't
one of the 5, flag it and defer — regardless of how good the idea is.

## The 5 priorities (source: `docs/ARCHITECTURE-HEALTH-2026-08.md`, "5 việc quan trọng nhất")

| # | Priority | Status | Evidence |
|---|---|---|---|
| 1 | **Capability Runtime canonical** (`src/capability/` used by Chat, MCP, and Desktop alike — no per-client duplicate logic) | 🟡 In progress | `src/capability/mod.rs` (318 lines, 9 functions) merged via PR #134 (2026-08-08) — already the sole implementation behind `src/mcp.rs`'s 9 tools (grep-confirmed, 9/9 call sites). **Not yet done**: `src/chat/tools/read_file.rs` (115 lines) and `run_command.rs` (150 lines) still reimplement the same logic independently rather than calling `capability::*`. Desktop's tool-execution path not yet audited. |
| 2 | **Local model tool calling** (Gemma/Qwen/etc. via `yana-ai chat` must actually read the repo through the runtime, not just chat) | 🟡 In progress | `yana chat`'s `run_command`/`read_file` tools work today (per `src/chat/mod.rs`'s module doc, confirmed 2026-07-24 with `qwen2.5-coder:14b`), but they're the duplicate implementation named in #1, not routed through the canonical runtime — this priority and #1 will very likely close together. |
| 3 | **Unified mutation pipeline** (one canonical executor, not a separate one per client) | ⚪ Not started | No evidence found yet of a Desktop or MCP-side mutation (write/exec) executor to compare against Chat's `run_command`. Needs its own audit before work starts. |
| 4 | **Source-of-truth cleanup** (version, provider, manifest counts, generated output) | 🟡 Ongoing, incremental | `core/scripts/check_counts.py --fix` + `core/scripts/drift-check.sh` already enforce agent/skill/rule/script counts in CI. Found and fixed one instance 2026-08-13: `core/config/agent-routing-map.json` had 3 stale agent references (`copywriter-seo`, `react-native-developer`, `release` — none existed), now covered by a regression test. Likely more instances exist elsewhere — no full audit done yet. |
| 5 | **`CURRENT-MILESTONE.md` + `ARCHITECTURE-DEBT` register** | ✅ Done (this file + `ARCHITECTURE-DEBT.md`, 2026-08-13) | — |

Status legend: ⚪ not started · 🟡 in progress · ✅ done · 🔴 blocked (blocker noted in Evidence)

## Scope discipline

Per the freeze memory: **a good idea that isn't one of the 5 above still
gets deferred.** "Hay" (interesting) is not a sufficient reason on its
own. New subsystems (Vision, Memory expansion, a new adapter, a new
"plane," etc.) are explicitly named as the failure pattern this file
exists to catch.

If a new idea comes up mid-cycle:
1. Check it against the 5 priorities above.
2. If it serves one of them directly, it's in scope — proceed.
3. If it doesn't, name it explicitly, add it to `ARCHITECTURE-DEBT.md` or
   a backlog note, and defer. Don't silently start it.

## Updating this file

Update the Status/Evidence columns as work lands — this is a living
document, not a snapshot. When all 5 rows are ✅, that's the signal this
milestone is complete and a new one should be declared (per
`docs/YANA-CONTROL-PLANES.md`'s Evolution Governor concept — NOW/NEXT/
LATER capacity tracking, not yet built as running code).

## Related

- `docs/ARCHITECTURE-HEALTH-2026-08.md` — full report (50 items), the
  source this file distills.
- `ARCHITECTURE-DEBT.md` — the technical-debt register (items 11-30 of
  the health report), companion to this file per priority #5.
- `docs/YANA-CONTROL-PLANES.md` — the governance architecture (Challenger
  / Governor / Local Embodiment Runtime) that this file operationalizes
  a first, manual slice of.
- `docs/programs/PROGRAM-J-SKELETON.md` — Program J (Universal Capability
  Runtime), the design doc priorities #1 and #2 extend directly.
