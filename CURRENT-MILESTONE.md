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
| 1 | **Capability Runtime canonical** (`src/capability/` used by Chat, MCP, and Desktop alike — no per-client duplicate logic) | 🟡 In progress | MCP delegates its repo/git/host/process tools to `src/capability/`. Chat now delegates `read_file` through `read_file_observation` and `run_command` through `validate_command`/`execute_command`; the earlier duplicate implementations are gone. **Remaining**: Desktop launches `yana-rt chat`, but its file-tree IPC still owns separate path-resolution/listing logic in `tools/yana-desktop/main.js`. |
| 2 | **Local model tool calling** (Gemma/Qwen/etc. via `yana-ai chat` must actually read the repo through the runtime, not just chat) | 🟡 In progress | Chat has provider tool-call parsing, dispatch, approval and persisted tool-result turns, and its tools now use the canonical capability runtime. **Remaining proof gap**: there is no Golden E2E covering local provider → tool call → capability → tool result → final answer with a deterministic mock provider. |
| 3 | **Unified mutation pipeline** (one canonical executor, not a separate one per client) | 🟡 In progress | Chat command execution now delegates to `capability::validate_command` and `capability::execute_command`. MCP remains observation/check-only and Desktop uses the embedded `yana-rt chat`; any future Desktop/MCP mutation surface must use the same executor rather than add a client-local implementation. |
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

## Exit gate (decided 2026-08-28)

This milestone does not end by starting a new roadmap alongside it, and
is not overridden by a good new idea arriving mid-cycle — it ends when
all 5 of the following are true, verified with evidence, not declared
because the underlying modules now exist in the codebase:

- [ ] **Golden E2E proven**: local model → tool selection → canonical
  capability → execution/result → final model answer, working end to
  end with a deterministic test, not just each piece existing in
  isolation (closes priority #2 above).
- [ ] **Mutation uniqueness**: no production client (Chat, Desktop, MCP)
  has its own separate mutation executor — all go through the one
  canonical pipeline (closes priority #3).
- [ ] **Authority proof**: every production mutation path actually runs
  through `RuntimeAuthority` with canonical approval semantics, verified
  as wired, not just present as a type (extends priority #1).
- [ ] **Source-of-truth check**: generated/runtime/provider/version
  manifests have zero drift (closes priority #4).
- [ ] `docs/ARCHITECTURE-HEALTH-2026-08.md` is marked CLOSED/SUPERSEDED
  and this file points to the next milestone as current (priority #5 —
  the milestone-discipline habit itself is permanent and carries
  forward unchanged into whatever comes next).

Once all 5 are checked, this milestone closes and
**`docs/MILESTONE-AUTHORITY-DEPTH.md`** becomes the current milestone.
That successor is scoped now — deepen the authority primitives that
already exist (capability lease, delegation, intent contract, causal
evidence) rather than add new subsystems — so it does not need to be
re-derived from scratch when this one closes. It does not start early;
starting it before this gate closes is exactly the failure pattern this
file exists to prevent.

## Updating this file

Update the Status/Evidence columns as work lands — this is a living
document, not a snapshot. Use the exit-gate checklist above, not "all 5
priority rows say ✅," as the actual completion signal — a priority row
can look done because the module exists while the corresponding E2E/
uniqueness/proof gate item above is still unverified.

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
