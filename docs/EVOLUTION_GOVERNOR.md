# Evolution Governor

**Status:** Draft — design only, not implemented. Part of
`docs/YANA-CONTROL-PLANES.md`'s Governance Plane.

## Purpose

Reads the actual state of the Yana AI project and proposes the correct
development order according to real system health and real absorption
capacity — not the maintainer's latest idea, and not a feature wishlist.
Anh's own framing: "phân tích xử lý luồng dữ liệu, file, tệp dự án, cấu
trúc để đưa ra kế hoạch chuẩn" — analyze the real data flow, files,
project structure, to produce a canonical plan.

## What it must not do

- Must not simply execute the maintainer's latest idea.
- Must not automatically merge code.
- Must not independently expand stable scope.
- Only anh approves moving an item from NEXT to NOW.

## Relationship to what already exists

**This is not a new process — it is ADS v1, generalized across the
whole project instead of one Program at a time.**
`docs/programs/ADS-v1.md` already defines 16 phases (Input →
Specification → Capability Inventory → Architecture → Workflow →
Readiness → ADR → Research → Design Review → Implementation Plan →
Implementation → Review → Benchmark → Evaluation → Documentation →
Continuous Improvement) and a 10-item Readiness Matrix. It has already
run for real, in full, on Program J (see
`docs/programs/PROGRAM-J-SKELETON.md` — Phases 0-9 complete, Readiness
85%, verified with real benchmark numbers, not estimates).

What ADS v1 does not do today: read live repo state automatically, or
operate across *multiple* Programs at once to decide which one the
project can actually absorb right now. It's a template a human/AI fills
in by hand, one Program at a time. Evolution Governor is that same
rigor, applied to the portfolio level, with automated data-gathering
where the data is mechanically checkable (file counts, test results,
CI status) and human judgment kept where it belongs (mission alignment,
absorption capacity policy, NOW/NEXT/LATER approval).

**Repository substrate reused, not rebuilt:** Local Embodiment
Runtime's Repository Observer (see `LOCAL_EMBODIMENT_RUNTIME.md`) is
the same read-only scanning layer this Governor needs for its Capability
and Health maps. One observer, two consumers — see
`docs/YANA-CONTROL-PLANES.md`'s non-goals ("no separate scanner for
each subsystem").

## Required analysis inputs

Directory/module structure; manifests and dependencies
(`MANIFEST.json`, `.claude-plugin/plugin.json` — both of which this
session already found drifted from disk and fixed, see commit
`e1c06aa2`, a live example of exactly the kind of drift this Governor
should catch automatically going forward); Rust/Python/Shell/JavaScript
and Desktop boundaries; adapters (`core/adapters/`); public
commands/APIs; CI workflow state (`.github/workflows/ci.yml`);
passing/failing/missing/flaky tests; documentation drift (found live
this session: `docs/ARCHITECTURE.md` describes a pre-Rust-runtime
version of the project); release/packaging state; version drift across
axes (Desktop/Rust/Python/product); capabilities; feature flags;
incidents; audit evidence; subsystem duplication (found live this
session: `src/chat/tools/read_file.rs` vs. `src/capability::read_file`
— two independent implementations of the same read); orphaned/
experimental components; maintenance burden; relation to Yana AI's
mission.

## Required generated models

1. **Capability Map** — what exists, status, owner, entrypoints, tests,
   dependencies, mission alignment.
2. **Dependency Map** — what depends on what, so a change in one place
   doesn't silently break three others.
3. **Health Map** — per component: `HEALTHY` / `DEGRADED` /
   `UNVERIFIED` / `DUPLICATED` / `ORPHANED` / `EXPERIMENTAL` /
   `BLOCKED`.
4. **Risk Map** — safety regression risk, release failure risk, version
   drift, missing contract tests, cross-runtime duplication, unowned
   modules, undocumented public surface, features with no removal path.
5. **Absorption Capacity** — explicit, not implied:
   ```yaml
   mode: convergence
   capacity:
     max_active_programs: 2
     max_architecture_changes: 0
     max_new_dependencies: 0
     max_active_experiments: 1
   allocation:
     consolidation: 70
     onboarding_and_packaging: 20
     experiments: 10
   ```
   Proposed default policy, not silently hard-coded — anh reviews and
   can change these numbers.
6. **Roadmap** — NOW / NEXT / LATER only, three tiers:
   - **NOW** — max 1-2 items (matches the 5-priority freeze already in
     effect, `docs/ARCHITECTURE-HEALTH-2026-08.md`'s "5 việc quan
     trọng nhất")
   - **NEXT** — approved in principle, capacity not yet available
   - **LATER** — reasonable, wrong time

## Priority order for the roadmap

```
P0 - Safety regressions
P1 - Broken golden path
P2 - Release and packaging failures
P3 - Maintenance debt blocking development
P4 - Proven user requirements
P5 - Controlled experiments
P6 - Architectural improvements without evidence
```

Valid roadmap actions: `BUILD`, `EXTEND`, `CONSOLIDATE`, `REMOVE`,
`STABILIZE`, `VERIFY`, `DOCUMENT` — not just "build." Consolidating the
`read_file` duplication found this session is a real `CONSOLIDATE`
candidate for this roadmap, not an afterthought.

Every roadmap item carries: objective, evidence, scope, out-of-scope,
dependencies, risks, deliverables, owner/reviewer, acceptance criteria,
exit criteria, definition of done, rollback/removal path — the same
shape ADS v1 already requires per-Program, applied per roadmap item
here.

## Example output shape

```
VERDICT: ACCEPTED_BUT_DEFERRED
Ý tưởng phù hợp với định hướng dài hạn.
Tuy nhiên, Yana hiện còn:
- src/capability chưa merge vào main (Program J, unmerged);
- src/chat/tools/read_file.rs trùng logic với src/capability;
- 2 chương trình đang hoạt động, đạt giới hạn 2/2.
Xếp vào NEXT.
Chuyển sang NOW sau khi:
1. src/capability được merge hoặc quyết định rebuild;
2. duplication ở read_file.rs được consolidate;
3. golden-path E2E ổn định.
```

## Two planners, kept separate

- **Runtime Task Planner** — plans one task ("fix this failing test").
  Already exists informally in `yana-ai chat`'s turn loop
  (`src/chat/tui.rs`).
- **Evolution Governor** — plans the evolution of the whole system.
  New; this document.

Neither merges code. Neither bypasses the canonical executor. Only the
Builder plane (Claude/Codex/Cursor/Antigravity, working from an
approved `BUILD_READY` contract) implements, and only the existing
guard/approval/executor chain mutates anything.

## Non-goals

- Not a feature-list generator — every item has the full field set
  above or it doesn't go on the roadmap.
- Does not auto-merge or auto-expand scope.
- Does not replace ADS v1 — it's the same standard, read across the
  whole portfolio instead of one Program.

See also: `docs/YANA-CONTROL-PLANES.md`, `docs/IDEA_CHALLENGER.md`,
`docs/programs/ADS-v1.md`, `docs/ARCHITECTURE-HEALTH-2026-08.md`.
