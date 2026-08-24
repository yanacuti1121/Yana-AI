# Project history — from Claude template to the Yana ecosystem

A genealogy of every named version/state this project has gone through: the
Claude Code lineage it started from, the "YAMTAM Engine" era, the reset to
product-style `v0.x` numbering, the rename to Yana AI, and the branches that
grew out of it (`yana-rt`, `yana-web`, Desktop, `yana-robot`).

## Verification status — read this first

This document was assembled from archived version names and release notes,
not reconstructed fresh from `git log` line by line. Before it was added
here, the core claims were spot-checked against this repo's actual commit
and tag history:

- **Confirmed real.** "YAMTAM" is a genuine former name of this project —
  found verbatim in real commit messages (`docs: clarify YAMTAM scaffold
  roadmap status`, `feat: import YAMTAM runtime assets`). The overall shape
  — YAMTAM Engine `v1.x` → reset to product-style `v0.x` → rename to Yana AI
  — matches the real tag order in this repo.
- **Corrected: the pace was much faster than the narrative implies.**
  Sections I–VI below read like a multi-week or multi-month progression.
  Real tag timestamps put the entire span — first commit through the
  `v0.x` product reset — inside about **13 days** (2026-05-17 to
  2026-05-30). Treat each "era" as a fast, likely AI-assisted iteration
  cycle, not a slow, deliberated saga.
- **Minor date drift.** The `v1.0.0` tag's actual commit is dated
  2026-07-26 (JST), not 27/07 as written below — a one-day difference,
  most likely a timezone artifact.
- **Not independently verified.** Feature-level detail for `v1.3.0`–
  `v1.3.11`, `v1.3.40`–`v1.3.53`, and product `v0.6`–`v0.13` — the document
  itself flags these as version names it could confirm existed without
  being able to confirm what each one actually shipped. Treat those rows as
  "this version existed," not "this version did exactly this."
- **Out of this repo's git history entirely.** The `yana-web`, Chat
  Terminal, capability-runtime-experiments, and robotics branches
  (Sections XII–XV) live in separate repositories/artifacts this repo's own
  `git log` can't confirm or refute.

## I. Pre-YAMTAM — Claude Code lineage

| Version | What changed |
|---|---|
| Claude Development Template | Initial foundation: agents, hooks, rules, MCP, PRD/project workflow. |
| GitNexus integration | Added code intelligence/context; became a core part of the pre-YAMTAM branch. |
| claude-code v3.0 | Early debug discipline, workflow/guard basics; ~69 files. |
| v4.0 | Automation layer: Context Synthesizer, BRAIN_DUMP, Auto-QA. |
| v5.0 | Shift toward spec-driven development: spec planner → executor → verifier; added context monitoring. |
| v6.0 | Tool-attention layer; managed MCP/tool usage and "MCP Tax" context cost. |
| v7.0 | Persistent memory; added coding guideline/engineering rules. |
| v8.0 | Memory architecture grew into a multi-tier system. |
| v9.0 | Quality-control agent layer: prompt-firewall, token-guard, tool-router, config-doctor, agent-gardener. |
| v9 GitNexus variants | Integration/audit snapshots of GitNexus; includes `gitnexus-v9`, `v9-real`, and a dedicated agent pack. |
| v10.0 | Reliability focus over just adding agents: `/resume`, `/route`, `/verify-pack`, memory router, session checkpoint, audit/fix. |
| `gitnexus-v10-audited` | Audited snapshot of v10; became the direct base for YAMTAM ENGINE v1.0. |
| `claude-code-v1.2-enhanced` | Branch between the Claude-era and YAMTAM-era; not yet traced to specific features. |

**Transition point:** `claude-code-v10.0` → `YAMTAM_ENGINE_v1.0_school-stable_from-gitnexus-v10-audited`. Two archived artifacts share the same size/snapshot lineage, marking this as roughly where the identity shifted from "Claude Code" to "YAMTAM Engine."

## II. YAMTAM Genesis — v1.0 → v1.2.9

| Version | What it does |
|---|---|
| YAMTAM ENGINE v1.0 | Packaged the Claude/GitNexus system as YAMTAM ENGINE. |
| v1.1 | Continued architecture development; archive also has a combined `v1.0_v1.1_plans`. |
| v1.2 | A distinct safety/control system starts forming, beyond a plain agent pack. |
| v1.2.1 | Truthful Cost Guard — reliable cost tracking/display. |
| v1.2.2 | Budget Mode Switch — budget-based mode switching. |
| v1.2.3 | Scope Lock — restricts what the AI is allowed to change. |
| v1.2.4 | Local Audit Log — local activity trail. |
| v1.2.5 | E2E Safety — safety for end-to-end flows. |
| v1.2.6 | Handoff Mode — context/work handoff between sessions/agents. |
| v1.2.7 | Replit Incident Defense / Production Protection — guards against dangerous production actions. |
| v1.2.8 | PocketOS Incident Defense / API Destruction Guard — extended protection for destructive API operations. |
| v1.2.8-fixed | Hardening/fix pass on v1.2.8. |
| v1.2.9 | Wrapped up this safety round before the standalone transition. |
| v1.2.9-fixed | Hook Test Suite + Release QA, the last build of this phase; old docs record 13/13 tests passing. |

An older handover document records this exact `1.2.1 → 1.2.9-fixed` chain and warns that the internal `v10`/`v11`/`v12` line is a *separate* numbering scheme (`JNMT_YAMTAM_HANDOVER_ALL_IN_ONE_v2.md`).

## III. YAMTAM splits into a standalone engine

Architectural states rather than SemVer releases:

| State | What it does |
|---|---|
| repo-scaffold | Split YAMTAM out of the old project's `.claude/` into its own repository/engine. |
| scaffold update #1 | Clarified roadmap and standalone status. |
| scaffold update #2 | Agent OS gates, prompts, behavior examples. |
| scaffold metadata | Finalized metadata/changelog. |
| `yamtam-engine-main` snapshots | Continuous snapshots of the standalone engine; many same-named archives at different sizes. |

This is when a `core/ gates/ prompts/ docs/ releases/` layout started to matter more than the old `.claude/` structure.

## IV. YAMTAM v1.3.x — the explosive phase

The hardest stretch to trace precisely — versions moved fast and a single SemVer tag could have multiple rebuilds.

| Version | What was found |
|---|---|
| 1.3.0-fixed | Early standalone stabilization. |
| 1.3.1 | Iteration after standalone. |
| 1.3.2–1.3.10 | Very fast fixed/stabilization chain; not enough evidence to attribute exact features per version. |
| 1.3.11-fixed | Multiple builds/rebuilds under this version; don't treat as one single artifact. |
| 1.3.12 | Superpowers integration. |
| 1.3.13 | TDD workflow. |
| 1.3.14 | Checkpoint + Handoff. |
| 1.3.15-clean | Clean distribution/build. |
| 1.3.16 | Claude Code Harness. |
| 1.3.16-fixed | Fix for the Harness release. |
| 1.3.17 | Command Suite; agent count jumped roughly 19 → 42. |
| 1.3.18 | Large agent/skill import; roughly 42 → 83 agents. |
| 1.3.19 | Command import/expansion. |
| 1.3.20 | YAMTAM-native governance. |
| 1.3.21 | Conflict Resolution. |
| 1.3.22 | Skill + hook review/hardening. |
| 1.3.23-clean | Clean build. |
| 1.3.23-fixed | Fixed build. |
| 1.3.24 | Claude Forge. |
| 1.3.25-clean | Clean distribution. |
| 1.3.25 rebuild | A rebuild under the same SemVer. |
| 1.3.26 | Continued expansion. |
| 1.3.26-fixed | Fixed artifact — one of the archives recovered. |
| 1.3.27 | Continued engine development. |
| 1.3.27-fixed | Fixed artifact, recovered. |
| 1.3.28 | Continued engine development. |
| 1.3.28-fixed | Fixed artifact, recovered. |
| 1.3.28 rebuild | A different artifact, same 1.3.28 family. |
| 1.3.29 | Next iteration. |
| 1.3.30 | Next iteration. |
| 1.3.31 | Marker before the very fast 32–56 release run. |
| 1.3.32–1.3.38 | Versions that existed but were tagged retroactively. |
| 1.3.39 | Backfilled tags for 1.3.32–1.3.38. |
| 1.3.40–1.3.48 | Rapid iteration; not attributing features without more evidence. |
| 1.3.49 → 1.3.50 | Traces suggest these two version-states sit very close to, possibly within, the same commit context. |
| 1.3.51–1.3.53 | Rapid evolution. |
| 1.3.54 | +15 agentic-AI skills, total skill count roughly 306 → 321. |
| 1.3.55 | Next iteration. |
| 1.3.56 | End of the confirmed 1.3.x chain. |

A later retention/cleanup commit deleted a large batch of old `v1.3.x` ZIP archives, so git history still shows these versions but the artifacts themselves are largely gone — the main reason so many "lost builds" show up in this era.

## V. Late YAMTAM

| Version | Role |
|---|---|
| v1.4.00 | Moved off the 1.3.x rapid-release line. |
| v1.4.20 | A release artifact still referenced in history. |
| v1.5.0 | Engine evolution. |
| v1.6.0 | Major iteration. |
| v1.6.1 | Patch. |
| v1.7.0 | Major iteration. |
| v1.7.1 | Patch. |
| v1.7.2 | Patch. |
| v1.7.3 | Late 1.7 artifact. |
| v1.8.0 | One of the last markers of the old YAMTAM release-pack numbering. |

> YAMTAM's `1.4.x` here is **not** the same axis as Yana Product `1.4.x` from August — these are two unrelated version lines.

## VI. Productization — reset to `v0.x`

```
YAMTAM Engine v1.x
        │
   Product architecture
        │
        v0.1.x
```

| Version | What happened |
|---|---|
| v0.1–0.2 | Early productization. |
| v0.3 | Policy Kit. |
| v0.4 | Guard Installer. |
| v0.5 | Runtime/task/eval development. |
| v0.6–0.13 | Product architecture developed quickly; needs more commit archaeology to attribute individual features. |
| v0.14.0 | Graph-related development. |
| v0.14.1 | Imported roughly +423 skills. |
| v0.14.2 | Imported roughly +1,048 skills. |
| v0.15.0 | Skill/design/hunt expansion; a `2.0.0` metadata value showed up on one component — a version-drift artifact. |
| v0.16.0 | Product line continued to stabilize. |
| v0.17.0 | CLI/product wired to `yamtam-rt v1.0.0`. |
| v0.18.0 | Ephemeral/unreleased state; later formally marked SKIPPED. |
| v0.22.4 | A version trace exists but it isn't yet clear which axis (product/component/internal) it belongs to. |
| v0.40.0 | Replaced v0.18.0; a large jump in product numbering. |

## VII. `yamtam-rt` → `yana-rt`

This is where the Rust runtime became its own independent version axis:

| Runtime | Meaning |
|---|---|
| `yamtam-rt` 0.7 | Early Rust runtime. |
| 0.8 | Runtime iteration. |
| 0.9 | Pre-1.0 runtime. |
| 1.0.0 | Runtime stability boundary; wired into the CLI by Product v0.17. |
| → `yana-rt` | Renamed alongside YAMTAM → Yana. |
| `yana-rt` 1.1.x | Independent runtime development. |
| 1.3.2 | Runtime axis continues independently of Product. |
| 1.3.3 | Runtime release around the same time as Product 1.0.0. |
| 1.4.0 | Newer runtime generation; Product 1.3.2 could still ship with runtime 1.4.0. |

This is the concrete reason Product version and runtime version must never be read as the same number — see [`VERSIONING.md`](../../VERSIONING.md) for how this repo keeps the axes independent today.

## VIII. Proto-Yana / the rename era

The name "Yana" actually showed up before the formal rename. In roughly early-to-mid June:

```
yana-router → yana-web → yana-desktop
```

Then the formal rename, **2026-06-15**:

```
YAMTAM ENGINE → Yana AI
yamtam-engine → yana-ai
yamtam-rt     → yana-rt
YAMTAM_*      → YANA_*
.yamtam/      → .yana/
bin/yamtam    → bin/yana
```

The migration itself took several more days, since identifiers/packages/references still carried the YAMTAM name for a while after. Read `2026-06-15` as the rename *event*, and roughly `2026-06-15` to `2026-06-25` as the migration *window*, not a single clean cutover.

## IX. Early Yana v0.x

| Version | What it does |
|---|---|
| 0.40.0 | Final bridge between YAMTAM and Yana. |
| 0.41.0–0.41.2 | Early Yana product development. |
| 0.41.3 | Confirmed product state as of 2026-06-13. |
| 0.42.0 | Product state before the binary distribution workflow existed. |
| 0.42.1 | First binary release — not just a patch, it changed how Yana was distributed. |
| 0.42.2 | WASM + publish pipeline. |
| 0.42.3 | Stabilization/pre-0.43 state. |
| 0.43.0 | Onboarding + conversation-history era. |
| 0.43.1 | Caught CI forcing Product/Rust/Python onto the same version number → formalized independent version axes. |
| 0.43.2 | One of the last pre-1.0 product states. |

## X. Yana Stable

| Product | Meaning |
|---|---|
| v1.0.0 — 2026-07-26/27 | First stable product-axis 1.0 release. Not the project's birth date. |
| v1.1.0 — 2026-07-30 | Next stable product release + Desktop development. |
| v1.2.0 | Product axis was **skipped** — `1.2` shows up on other surfaces/components, not as a real Product release. |
| v1.3.0 — 2026-08-01 | Product version re-synced after a Desktop/version-display drift. |
| v1.3.1 — 2026-08-02 | Stabilization/patch. |
| v1.3.2 — 2026-08-11 | Product 1.3.2, `yana-rt` 1.4.0, Python 0.42.5; safety/SSRF/runtime hardening well underway. |
| v1.4.0 — 2026-08-16 | Capability Runtime, OS/service/provider expansion, safety hardening. |
| v1.4.1 — 2026-08-20 | Patch/stabilization after 1.4.0. |

## XI. Desktop

Desktop should be treated as its own axis/component:

| Version | Role |
|---|---|
| 0.1.0 metadata era | Package metadata was stuck at a very old version number for a while. |
| 1.1.0 | Desktop release. |
| 1.2.0 | Desktop/release-surface version — one reason it's easy to wrongly assume Product also had a 1.2.0. |
| 1.3.0 | Desktop version that preceded/influenced syncing the Product display version. |

## XII. Yana-AI-Chat_Terminal

Several distinct archived artifacts, not one single repo:

| Artifact | What it does |
|---|---|
| `Yana-AI-Chat_Teminal-main.zip` | Main Chat Terminal snapshot. |
| `...main (1).zip` | Another snapshot of the same branch. |
| `Yana-AI-Chat-Terminal-14-UI-Engines.zip` | Experiment/design exploring 14 UI engines. |
| `...Compose-ZeroMemory.zip` | "Compose/ZeroMemory" direction. |
| `...Visible-UI-Patch.zip` | UI visibility patch. |

## XIII. Capability Runtime experiments

Shows the runtime architecture didn't jump straight to its final implementation:

```
yana-local-capability-runtime-design-v1
                ↓
              v2
                ↓
yana-runtime-design-v3
                ↓
              v4
                ↓
yana-runtime-foundation-final
                ↓
yana-program-j-capability-runtime-rust
                ↓
        Yana runtime implementation
```

These are architectural prototypes, not Product releases.

## XIV. `yana-web`

The web/UI branch. It showed up *before* the formal rename finished — meaning the "Yana" identity was already in use for new components while the core was still called YAMTAM:

```
YAMTAM core
    │
Proto-Yana
    ├── yana-router
    ├── yana-web
    └── yana-desktop
            │
        Yana AI
```

Not `Yana 1.0 → yana-web` — `yana-web` predates the 1.0 product release.

## XV. Robotics

Where Yana left software-only territory:

```
Yana ecosystem
      │
      └── yana-wheelbot
                │
                └────► yana-robot
                         ▲
                         │
                    xiaozhi-esp32
                    external DNA
```

`yana-wheelbot` is the physical-control/robotics branch. `yana-robot` goes further: ESP32-S3 firmware, web/mobile control, local real-time safety, ToF sensing, motor/servo control, LED/display, and AI/MCP semantic control — importing code lineage from the external `xiaozhi-esp32` project, making it a hybrid descendant rather than a pure Yana-AI fork.

## Full lineage, condensed

```
Claude Development Template
        ↓
GitNexus
        ↓
claude-code v3
 ↓ v4
 ↓ v5   Spec-driven
 ↓ v6   Tool attention
 ↓ v7   Persistent memory
 ↓ v8   Memory architecture
 ↓ v9   Quality agents
 ↓ v10  Reliability
        ↓
╔══════════════════╗
║ YAMTAM ENGINE 1.0║
╚══════════════════╝
        ↓
1.1 → 1.2
        ↓
1.2.1 Cost Guard
1.2.2 Budget
1.2.3 Scope Lock
1.2.4 Audit
1.2.5 E2E Safety
1.2.6 Handoff
1.2.7 Production Defense
1.2.8 API Defense
1.2.9 Release QA
        ↓
STANDALONE ENGINE
        ↓
1.3.0 → ... → 1.3.56
        ↓
1.4 → 1.5 → 1.6 → 1.7 → 1.8
        ↓
──────── PRODUCT RESET ────────
        ↓
0.1 → ... → 0.17
        │
        ├──── yamtam-rt
        │
        ↓
0.18 [ephemeral/skipped]
        ↓
0.40 → 0.41 → 0.42 → 0.43
        ↓
════ YAMTAM → YANA ════
        ↓
              YANA AI
      ┌─────────┼─────────┐
      ↓         ↓         ↓
   yana-rt    Python    Desktop
      │
      ├───────────────┐
      ↓               ↓
  yana-web       Chat Terminal
                      │
               runtime experiments
             YANA ECOSYSTEM
                    │
                    ↓
              yana-wheelbot
                    ↓
               yana-robot
                    ↑
              xiaozhi-esp32
```

The biggest remaining gaps are feature-level detail for `v1.3.0`–`1.3.11`, `v1.3.40`–`53`, and Product `v0.6`–`0.13` — these version/states are known to exist, but nothing here should be read as "this version added X" without commit-level evidence backing it up.
