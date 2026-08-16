# B5 — Workflow permissions / supply-chain exceptions / evidence binding / escalation (Workstream B / CI-CD Assurance)

Companion to `B5-invariant-registry.md`. Covers the remaining B5
sub-items: workflow permissions (least privilege), supply-chain
exceptions registry, evidence binding, CI secret safety, CI cost, and
change-based escalation.

## Workflow permissions audit

Read the actual `permissions:` block (or its absence) in every job
across all 7 workflow files, cross-referenced against what each job's
steps actually do (not just what the block claims).

| Workflow / job | Declared permissions | Actually needs | Verdict |
|---|---|---|---|
| `ci.yml` (workflow-level) | `contents: read`, `checks: write` | matches usage | OK |
| `ci.yml` `self-audit` job | `contents: read`, `security-events: write` | SARIF upload requires `security-events: write` | OK, correctly scoped |
| `demo-gif.yml` | `contents: write` (workflow-level) | commits `docs/demo.gif` back to the repo | OK — `workflow_dispatch`-only trigger limits blast radius further |
| `desktop.yml` | `contents: write` (workflow-level) | `softprops/action-gh-release` attaches installers to a Release when tag-triggered (confirmed by reading the full file — the release step is later in the file than where I first checked, corrected during this audit) | OK, needed |
| `publish.yml` `publish-pypi` | `contents: read` (job-level) | checkout only; PyPI auth via `secrets.PYPI_TOKEN`, not `GITHUB_TOKEN` | OK |
| `publish.yml` `publish-crates` | **none, before this pass** | checkout only; crates.io auth via `CARGO_REGISTRY_TOKEN` (separate secret) | **GAP, fixed this pass** — added explicit `permissions: contents: read`, matching its sibling job. Confirmed via `gh api repos/.../actions/permissions/workflow` that the repo's actual default is already `read`, so this was defense-in-depth (explicit > implicit, and a future repo-default change shouldn't silently widen this job) rather than a closing a live over-grant |
| `release.yml` | `contents: write` (workflow-level) | `softprops/action-gh-release` creates the Release and uploads binaries + manifests | OK, needed |
| `sandbox.yml` (workflow-level) | `contents: read` | matches | OK |
| `sandbox.yml` job-level | `contents: read`, `packages: write` | pushes the sandbox image to GHCR | OK, `packages: write` is the minimum for a registry push |
| `yana-audit.yml` | `contents: read`, `security-events: write` (both levels) | SARIF upload | OK — separately flagged in B4 as a housekeeping question (should this file even be running in this repo), not a permissions issue |

**Net result: 1 real gap found and fixed** (`publish-crates` missing
explicit permissions), everything else already matched least-privilege
on inspection. No fork-PR-specific privilege-escalation path found —
none of the workflows here use `pull_request_target` (the trigger type
that actually runs with write-level secrets against fork-authored code,
the highest-risk fork-PR pattern); all PR triggers use plain
`pull_request`, which runs with read-only, fork-safe permissions by
default.

## Supply-chain exceptions registry

Formalizes the CVEs already found and deliberately left unfixed during
B1, using the program document's required fields (advisory, reason,
owner, created, expiry/review date). Previously these existed only as
prose in commit messages — this is the first structured registry entry
for them.

| Advisory | Component | Status | Enforcement mechanism | Reason for exception | Owner | Created | Review by |
|---|---|---|---|---|---|---|---|
| RUSTSEC-2026-0185 | `quinn-proto` (HIGH, DoS) | **RESOLVED 2026-08-16** | n/a — no longer an exception | Was: fix required dependency-tree investigation, needed Workstream A / runtime-owner triage. Workstream A's PR #214 (`fix(deps): bump quinn-proto to 0.11.15`) fixed it — verified real by reading the PR directly (`gh pr view 214`), not assumed from its title. Applied the identical fix (`cargo update -p quinn-proto --precise 0.11.15`) to this branch: 2-line `Cargo.lock` diff, matches #214's own diff exactly; `cargo audit` now exits 0 for this advisory (verified locally); `cargo build --features cli` still succeeds | — | 2026-08-16 (finding) | — resolved, closed |
| PYSEC-2026-1845 | `pytest` 8.3.5 (predictable `/tmp/pytest-of-{user}` path) | **ACTIVE — now enforced, not prose-only** | `pip-audit --ignore-vuln PYSEC-2026-1845` in `ci.yml`'s `dependency-audit` job (the dev/test-tooling pip-audit step only — the runtime-requirements step has no `--ignore-vuln`, since pytest isn't a published-package runtime dependency and any vulnerability there still fails the job) | GitHub-hosted runners are ephemeral, single-tenant — real-world exposure for this repo's own CI is low; fix is a major-version bump (pytest 9.0.3) needing a compatibility pass across several hundred test files. **Correction, 2026-08-16:** this row previously listed the reasoning as an exception but the CI step still ran plain `pip-audit` with no `--ignore-vuln` — meaning the job failed on every run regardless of this table's contents. A prose exception does not make a tool pass; verified locally (`pip-audit --ignore-vuln PYSEC-2026-1845` on a fresh install) that the flag is scoped to exactly this advisory ID before wiring it into CI, not a blanket suppression | Whoever owns the test suite / dev tooling | 2026-08-16 | Re-review when a pytest 9.x compatibility pass is scheduled, not tied to a hard date |
| (unnamed — `npm audit` finding) | `tar` / `electron-builder` transitive (9 high, 1 critical) | ACTIVE, prose-documented (not CI-enforced — `npm audit` has no equivalent per-advisory allowlist wired in here) | none — `dependency-audit`'s npm steps use `--omit=dev`, which already excludes this devDependency-only finding from failing the job; no `--ignore-vuln`-equivalent is needed since the job doesn't fail on it in the first place | devDependency only (`npm audit --omit=dev` is clean; findings don't ship in the built app); fix requires `--force`, which npm itself flags as a breaking `electron-builder@26.15.3` bump, needing a real 5-platform build verification before landing | Workstream A or whoever owns `tools/yana-desktop`'s build pipeline | 2026-08-16 | Re-review before the next `yana-desktop` release cut, or whenever electron-builder needs a bump for other reasons |

All three already had their reasoning recorded in commit messages
(B1's `pr212_commit3_msg.txt`/`commit4_msg.txt`, evidenced in this
branch's history) — this table doesn't add new reasoning, it makes the
existing reasoning queryable as a registry instead of requiring someone
to dig through commit history to reconstruct why each RED check is
intentional.

## Evidence binding

The program document asks that important CI results bind: commit SHA,
workspace state, platform, architecture, toolchain, feature flags, test
command.

- **Release artifacts: satisfied.** The B3 release-manifest addition
  captures exactly this field set (commit SHA, product/yana-rt version,
  target triple, Rust toolchain, feature flags, Cargo.lock digest,
  artifact SHA256, timestamp, CI run identity) per artifact.
- **Ordinary PR/push CI test runs: not separately bound.** A passing
  `rust-tests` or `system-health-monitor` run is traceable to a commit
  SHA via GitHub's own UI (every check run is associated with the
  commit it ran against), but there's no artifact that bundles
  platform/toolchain/feature-flags/test-command together the way the
  release manifest does for shipped binaries. This is a real gap, but a
  lower-severity one than the release-artifact case — GitHub's own
  UI already provides the commit-SHA binding for free, whereas a
  downloaded release binary has no such automatic association.
- **Local-agent-verification fingerprinting** (`fingerprint A → verify
  → fingerprint B`, `PASS + STALE = NOT VERIFIED`): this describes
  agent-session verification discipline, not a CI artifact — it's
  already the exact model `core/rules/verification.md`'s Iron Law
  enforces ("no completion claims without fresh verification evidence
  run in this message"). Not a new CI mechanism to build; noting the
  overlap rather than duplicating the rule here.

## CI secret safety

Spot-checked audit-report and error-body-truncation code paths for
secret leakage risk, since these are the ones most likely to echo
unexpected content into an artifact or log:

- `src/model/provider.rs::read_error_body()` (found during B3's
  fuzz-target search) bounds the read to 2048 bytes specifically so "a
  misbehaving upstream can't make a single failed request print
  megabytes of garbage" — already defensive by the code's own doc
  comment, not something this pass needed to add.
- No workflow step in any of the 7 files dumps `env` or prints secret
  values directly (`grep -rn "echo.*\$\{\{ secrets\." .github/workflows/`
  — none of the secret references are echoed, only passed as `with:`
  inputs or env vars to actions that consume them directly).

## CI cost

Not measured in this pass — this repo has no historical CI-duration
data source wired up (no existing dashboard/export), and fabricating
cost numbers would violate this program's own categorical-scorecard
rule against invented figures. Recording as **not yet instrumented**
rather than guessing at PR duration / slowest-job / cache-hit numbers.

## Change-based escalation

Document's stated policy: docs → T1; core runtime → T1+T2;
platform/process/evidence → T1+T2+T3+relevant T4; release →
T1+T2+T3+release assurance; T5 stays scheduled.

Current actual state (already established in B4): **every required
check runs on every push regardless of what changed** — there is no
change-based escalation logic implemented, so by construction this
policy is satisfied in the trivial "always run everything" sense but
not implemented as an actual escalation *ladder*. Not changed in this
pass, same reasoning as B4: introducing real change-based conditionals
on the required-check set is a behavior change to what blocks merges,
better done deliberately than as a side effect of a registry-writing
pass.
