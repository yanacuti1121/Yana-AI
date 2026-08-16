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
| **A3** State & Evidence Integrity | Kernel flock-v1 unit tests (Rust + Python), cutover regression, cross-language matrix (x5), audit JSON MVP regression; receipt-lock race test (`src/remote/lock.rs`), session-resolution race test (`src/remote/session.rs`), HALT-authority tests (`src/os/supervisor.rs`) | `ci.yml` job `flock-v1-linux`; `ci.yml` job `test` — "Validate audit JSON MVP regression behavior"; `rust-tests` job's "Run unit tests" step (inline `#[test]`s in the files named) | Present. **Updated 2026-08-16**: per `B1-test-the-tests-audit.md`'s refresh, 6 of 7 named priority targets now have real, verified tests (3 closed this session by Workstream A PRs #215/#217/#218, pending merge). Only `src/guard/portable.rs` (multi-byte validator, A2 not A3) remains a genuine gap. |
| **A4** Model / Provider Protocols | Discord feature build+test (added this workstream, B0); Discord bounded-queue regression (Workstream A PR #218, pending merge); Ollama HTTP-status + malformed-body regression, real-socket-tested (Workstream A PR #215, pending merge) | `ci.yml` job `rust-tests` — "Build with discord feature", "Run discord feature tests"; inline tests in `src/remote/discord.rs` and `src/chat/ollama_native.rs` run under "Run unit tests" | **Updated 2026-08-16, was Partial, now effectively closed pending merge** — both named gaps from B1's original audit (queue bound, truthful failure state) are fixed with verified regression tests in open PRs. Re-check after #215/#218 actually merge to `main`; this reflects PR-snapshot verification, not `main`'s current state. |
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
- A3/A4/A6's caveats traced back to `B1-test-the-tests-audit.md`'s
  originally-4 confirmed gaps — **updated 2026-08-16**: 3 of those 4
  closed via Workstream A PRs #215/#217/#218 (pending merge), leaving
  only `src/guard/portable.rs` (multi-byte validator) as a genuine
  remaining gap, now filed under A2 not A3/A4. This table and B1's audit
  still describe the same underlying findings from two angles (taxonomy
  coverage vs. named-target coverage) and should be read together.
