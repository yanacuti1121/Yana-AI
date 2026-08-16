# B2 — Canonical assurance taxonomy (Workstream B / CI-CD Assurance)

Per the program document: CI is two-dimensional — **Assurance Domain**
(what invariant is protected) x **Execution Tier** (when/how deeply it
runs). This document fixes the 8 canonical domains verbatim from the
program document and maps this repo's *current* CI surface onto them, so
later sections (B3 for A7/A8 specifically, B4 for execution tiers) build
on a real map instead of a fresh guess each time.

No new top-level domain was needed — every existing CI job/step mapped
onto one of the eight without forcing.

## The 8 domains (canonical, per program document — not redefined here)

A1 Authority & Governance · A2 Capability & Isolation · A3 State &
Evidence Integrity · A4 Model / Provider Protocols · A5 Resource &
Liveness · A6 Platform & Concurrency · A7 Memory / Parser Security · A8
Release & Supply Chain.

## Current CI surface, mapped

| Domain | What's already covered | Where (workflow / job / step) | Coverage |
|---|---|---|---|
| **A1** Authority & Governance | Hook test suite (safety/governance hooks — risk-scorer, tool-validator, blast-radius, etc.), install-script executability, agent routing map regression, compiled scanner rule drift | `ci.yml` job `test` ("Hook Tests") — steps "Run hook test suite", "Verify install script is executable", "Check compiled scanner rule drift", "Validate agent routing map regression behavior" | Present |
| **A2** Capability & Isolation | `.yana-aiignore` regression, spec-command regression, context-pack checker regression, validator JSON schema contract | `ci.yml` job `test` — steps "Validate .yana-aiignore regression behavior", "Validate spec command regression behavior", "Validate context-pack checker regression behavior", "Validate validator JSON schema contract" | Present |
| **A3** State & Evidence Integrity | Kernel flock-v1 unit tests (Rust + Python), cutover regression, cross-language matrix (x5), audit JSON MVP regression; receipt-lock race test (`src/remote/lock.rs`), session-resolution race test (`src/remote/session.rs`), HALT-authority tests (`src/os/supervisor.rs`) | `ci.yml` job `flock-v1-linux`; `ci.yml` job `test` — "Validate audit JSON MVP regression behavior"; `rust-tests` job's "Run unit tests" step (inline `#[test]`s in the files named) | Present, but see `B1-test-the-tests-audit.md` — 2 of the named A3-relevant race/state targets are confirmed real, but this is the domain the 4 Test-the-tests gaps (queue bound, multi-byte, Ollama failure state, AirLLM admission) also mostly fall under |
| **A4** Model / Provider Protocols | Discord feature build+test (added this workstream, B0), Ollama parsing/formatting unit tests (fixture-only, see B1 audit) | `ci.yml` job `rust-tests` — "Build with discord feature", "Run discord feature tests"; inline tests in `src/chat/ollama_native.rs` run under "Run unit tests" | Partial — Discord and Ollama both have *some* coverage, but B1's audit already flagged both as having real gaps against their named failure modes (queue bound, truthful failure state) |
| **A5** Resource & Liveness | System Health Monitor job — dedicated, cross-platform | `ci.yml` job `system-health-monitor` (matrix over `${{ matrix.os }}`) | Present |
| **A6** Platform & Concurrency | System Health Monitor's OS matrix; flock-v1's cross-language matrix (x5 runs — repetition specifically targets concurrency flakiness); HALT/receipt/session race tests (also counted under A3 — state integrity and concurrency are the same tests here, different lens) | `ci.yml` jobs `system-health-monitor`, `flock-v1-linux` | Present |
| **A7** Memory / Parser Security | **None.** | — | **Absent.** No Miri job, no `cargo fuzz` / fuzz target directory anywhere in the repo (`find . -iname "*fuzz*"` returns nothing; `grep -i miri` across all workflow files returns nothing). This is exactly what B3's "A7 Memory / Parser Security" section (Miri, Fuzzing subsections) exists to build — confirmed here as a from-zero gap, not a partial one. |
| **A8** Release & Supply Chain | cargo-audit + pip-audit + npm-audit (this workstream, B1); SHA-pinned actions across all 7 workflow files (this workstream, B0); binary smoke tests before publish in `release.yml`/`desktop.yml` (this workstream, B1) | `ci.yml` job `dependency-audit`; `release.yml`, `desktop.yml` | Present — the domain this workstream has done the most direct work in so far, per B0/B1 |

## What this means for later sections

- **B3** (A7 / A8 specialist assurance) has real, confirmed work to do on
  A7 from a standing start — no existing Miri/fuzz infrastructure to
  build on top of, so B3's A7 work is greenfield, not a gap-fill.
- **B4** (execution tiers) can reuse this table directly: every domain
  already has *a* home in the current CI surface except A7, which tells
  B4 where a brand-new tier assignment is needed rather than just slotting
  an existing job into T1-T5.
- A3/A4/A6 all show "Present, but ..." caveats that trace straight back
  to the 4 confirmed gaps in `B1-test-the-tests-audit.md` — this table
  and that audit describe the same underlying gaps from two different
  angles (taxonomy coverage vs. named-target coverage) and should be read
  together, not as two separate problem lists.
