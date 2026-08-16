# B4 — Execution tiers / domain matrix / required checks (Workstream B / CI-CD Assurance)

Canonical tiers per program document: T1 FAST, T2 FULL, T3 PLATFORM, T4
ADVERSARIAL, T5 NIGHTLY/SOAK. This maps every job in this repo's 7
workflow files onto a tier and a governance classification (REQUIRED FOR
MERGE / ADVISORY / NIGHTLY / RELEASE-ONLY), cross-referenced against
B2's domain mapping. Governance classification below is read directly
from GitHub's actual branch-protection API response for `main`
(`gh api repos/.../branches/main/protection --jq
'.required_status_checks.contexts'`), not assumed from workflow file
contents — a job can exist and run without being enforced, and that gap
is exactly what this table is for catching.

## Job-by-job classification

| Job (workflow) | Domain(s) (B2) | Tier | Governance | Notes |
|---|---|---|---|---|
| Hook Tests (`ci.yml`) | A1, A2 | T1 FAST | **REQUIRED FOR MERGE** | fmt/schema/drift-style checks + hook test suite; matches T1's own description almost exactly |
| Kernel flock-v1 (Ubuntu) (`ci.yml`) | A3, A6 | T2 FULL / T3 PLATFORM (partial) | **REQUIRED FOR MERGE** | Job name says "(Ubuntu)" only — there is no macOS/Windows equivalent for flock-v1, so this domain's T3 PLATFORM coverage is Linux-only despite locks/concurrency being named platform-sensitive concerns in the doc's own T3 list |
| Rust Integration Tests (yana-rt) (`ci.yml`) | A3, A4, A6 | T2 FULL | **REQUIRED FOR MERGE** | Includes the discord feature build+test added in B0 |
| System Health Monitor (3-OS matrix) (`ci.yml`) | A5, A6 | T3 PLATFORM | **REQUIRED FOR MERGE** (all 3 OS legs) | The one job that actually achieves true 3-platform coverage as a required check |
| Yana AI Self-Audit (`ci.yml`) | A1 | T1/T2 hybrid | **REQUIRED FOR MERGE** | Real in-repo dogfooding (scanner/*.yml against this repo) |
| Dependency Vulnerability Audit (`ci.yml`) | A8 | T1 FAST | **ADVISORY (corrected — was briefly, incorrectly REQUIRED FOR MERGE on `main`)** | Added this workstream (B1), currently RED by design (real unpatched `quinn-proto`/`pytest` CVEs) — see B1 audit. **Real bug, found by independent fresh-context review and fixed 2026-08-16**: this table originally read the job's status from `main`'s actual branch-protection API response and correctly found it listed as required — but the job *definition* only exists in this branch (`ci.yml`'s `dependency-audit` job), not yet on `main`. A required-check name with no workflow on the base branch that can ever produce it blocks every other PR against `main` permanently (GitHub waits forever for a check that will never report) — confirmed live: PR #211 was `mergeStateStatus: BLOCKED` for exactly this reason, went to `CLEAN` immediately after removing this one context via `gh api .../required_status_checks` `PATCH`. Fixed by removing it from `main`'s required contexts until this branch (which adds the job) actually merges — at which point re-adding it as required is the correct next step, not a permanent downgrade. |
| Sandbox Image (`sandbox.yml`) | A2 | — | **ADVISORY** (runs on PR when `core/sandbox/**` changes, but not in the required-checks list) | Backwards from ideal: this is the one job that's actually path-scoped to its relevant domain, yet it's the one NOT enforced |
| Yana AI Audit (`yana-audit.yml`) | A1 (nominally) | — | **ADVISORY** (runs on every push, not required) | **Housekeeping finding, not fixed here:** this file's own header comment says "Example workflow — copy this into YOUR repo (not the yana-ai repo itself)". It is nonetheless present in this repo's own `.github/workflows/` and executes on every push, duplicating `ci.yml`'s real self-audit job under a different, non-required name. Flagging for a decision (remove from this repo's own workflow directory, or update the header if it's intentionally also dogfooded) rather than unilaterally deleting a workflow file as part of a taxonomy pass. |
| demo-gif (`demo-gif.yml`) | — (no domain — regenerates a docs GIF) | — | **ADVISORY** (`workflow_dispatch` only, manual) | Not a test; excluded from the domain table entirely, listed here only for completeness |
| Desktop Build (`desktop.yml`) | A8 | — | **RELEASE-ONLY** | Tag-triggered + manual dispatch; binary smoke test added this workstream (B1) |
| Release (`release.yml`) | A8 | — | **RELEASE-ONLY** | Tag-triggered; binary smoke test + release manifest both added this workstream (B1/B3) |
| Publish to PyPI + crates.io (`publish.yml`) | A8 | — | **RELEASE-ONLY** | Tag-triggered, per-axis (crates.io tag vs. PyPI tag, independent per `VERSIONING.md`) |

## Tier coverage gaps (cross-referencing B1/B2/B3's prior findings — not new work, just now placed on the tier axis)

- **T4 ADVERSARIAL: no dedicated tier exists.** The adversarial-flavored
  testing that does exist (flock-v1's "cross-language matrix five times"
  repetition, the receipt/session race tests) is embedded *inside* T2/T3
  required jobs, not run as its own tier with its own governance
  classification. There is no job whose stated purpose is races/failure
  injection/corruption/queue saturation/worker panic/restart storm/
  duplicate events/lock contention/timeout behavior as a category.
- **T5 NIGHTLY/SOAK: does not exist**, confirmed already in
  `B1-governance-observability-audit.md` — no `schedule:` trigger
  anywhere in this repo's workflows.
- These two gaps are the same ones already recorded in B1; this table's
  contribution is placing them precisely on the tier axis so a future
  T4/T5 design (if picked up) knows exactly which existing tests it
  could lift into a dedicated tier vs. which need to be written new.

## Deterministic path/subsystem → domain → required-tests mapping

The program document asks for this mapping, and for `uncertain → broader
assurance`, never `uncertain → skip`. **Current actual state: there is
no path-based conditional logic on any REQUIRED check.** All 6 required
jobs run unconditionally on every push/PR, regardless of which files
changed — this trivially satisfies "never skip" (nothing is ever
skipped) but doesn't implement the "deterministic path → domain" mapping
the document also asks for, because there's no mapping logic at all, just
"run everything, always."

The one job that *is* path-filtered (`sandbox.yml`, scoped to
`core/sandbox/**`) is the one that is **not** required — meaning the
only existing example of path-based scoping in this repo is on a
non-enforced check, which is the reverse of a risk-based required-check
system. **No new conditional logic was added in this pass**: introducing
path-based skip conditions on the 6 currently-unconditional required
checks would be a real behavior change to what blocks merges, and given
this repo's current small number of required jobs (6) and their already-
fast aggregate runtime, "run everything always" is a defensible, safe
default that doesn't need replacing on the strength of a taxonomy
exercise alone — recorded here as the accurate current state, not as a
gap demanding immediate action.

## Domain owner note

Program document: "every domain needs a canonical module/document/test
owner." Per the parallel-work ownership contract at the top of the
program document, Workstream A owns Runtime (which is where A3-A7's
actual subsystem code lives) and this workstream (B) owns the CI/CD
assurance plane that tests it. A per-domain named owner below crate
level (e.g., "who owns A4 Model/Provider Protocols specifically") isn't
established anywhere in the repo today and isn't something this
workstream can assign unilaterally — recording as an open item for
whoever finalizes the two workstreams' handoff.
