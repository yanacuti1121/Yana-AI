# B8 — Target CI/CD architecture and workflow hardening audit (Workstream B / CI-CD Assurance)

## Directory layout — not forced, per the document's own instruction

The document explicitly says "do not force a directory layout before
inspecting conventions" and offers `.github/workflows/ci-fast.yml` /
`ci-full.yml` / etc. + `core/ci/impact-map.*` only as a "possible
direction." This workstream has not restructured the existing single
`ci.yml` into split fast/full/platform/adversarial/nightly files, and
has kept every new audit document inside the pre-existing `core/ci/`
directory (which already held `check-pinned-actions.sh` before this
workstream started) rather than inventing a new top-level location.
Recorded as a deliberate non-action, not an oversight — B4 already
established there's no T4/T5 tier to split workflows around yet, so
splitting `ci.yml` now would be organizing around tiers that don't
exist.

## `|| true` and `continue-on-error: true` audit

**Clean.** `grep -n "|| true" .github/workflows/*.yml` returns zero
hits. `grep -n "continue-on-error" .github/workflows/*.yml` returns
exactly one hit, and it's this workstream's own comment in
`release.yml` explaining why `continue-on-error` was deliberately
*not* used for the `x86_64-apple-darwin` smoke-test exclusion — not an
actual failure-suppression mechanism. No workflow in this repo silently
swallows a command failure via either pattern.

## Adversarial review of this workstream's own CI changes

Applied the document's own adversarial-review checklist ("can a
critical test silently skip? can a job succeed after command failure?
can permissions be abused? can artifacts leak secrets? can a required
gate be bypassed?") retroactively to every change this workstream has
made so far, rather than only to future changes:

- **Binary smoke tests** (`release.yml`, `desktop.yml`): run under
  `set -euo pipefail` (release manifest step) or as a bare `run:` line
  that fails on non-zero exit by default — a crashing binary fails the
  step, not silently passes. No `if: success()` gate that could be
  satisfied trivially.
- **Dependency Audit job**: correctly REQUIRED FOR MERGE (B4), and its
  current RED state (real CVEs) is genuine, not a misconfigured
  always-green check — verified in B1 by actually running `cargo
  audit`/`pip-audit`/`npm audit` locally before wiring them in, not by
  trusting the tool names alone.
- **Release manifest generation**: uses a `sha256`/`sha256sum` fallback
  function (portability fix, B3) — checked whether a missing `python3`
  or `sha256sum`/`shasum` would fail loudly: yes, under `set -euo
  pipefail`, an unresolved command in the `sha256()` function body
  exits non-zero and fails the step, doesn't silently emit an empty
  hash into the manifest.
- **`publish-crates` permissions fix** (B5): reduces privilege
  (explicit `contents: read` where nothing was declared before), the
  direction adversarial review should always prefer — a permissions
  *addition* here would deserve more scrutiny than a *restriction*.
- **No artifact from any of this workstream's new steps includes
  secret values** — the release manifest's fields are all non-secret
  (SHA hashes, version strings, toolchain string, commit SHA, CI run
  ID); re-checked this specifically since B5's CI-secret-safety pass
  didn't examine the manifest step (it postdated that check) —
  confirmed clean now.

No finding from this self-review required a fix; recorded as verified
evidence that this workstream's own additions pass its own bar, not
asserted without having actually re-checked them against the checklist.

## Critical prerequisite contract

Every new step this workstream added (`python3`, `sha256sum`/`shasum`,
`file`, `rustc`) runs under a shell with `set -euo pipefail` (or, for
bare single-line `run:` steps, GitHub Actions' own default of failing
the step on non-zero exit). A missing tool produces a normal "command
not found" failure (exit 127) that fails the step visibly — never a
silently-empty or silently-skipped result. `python3`, `file`, and
`sha256sum`/`shasum` are all standard, always-present tools on
GitHub-hosted runner images (not obscure dependencies needing an
explicit existence check); no gap found here.

## Should `.github/workflows/` be under core-lock? — real finding, not implemented

Checked directly: `grep -c "\.github/workflows" core/config/core-lock.json`
→ **0**. `67-core-integrity-lock-law.md`'s pinned surface
(`LOCKED_DIRS`) covers `core/rules/`, `core/hooks/`, `core/gates/`,
`core/scripts/` — not `.github/workflows/`. This means an out-of-band
change to any workflow file (including everything this workstream has
hardened this session — SHA-pinned actions, the Dependency Audit
required check, the release manifest, the `publish-crates` permissions
fix) would **not** be caught by the core-lock drift detector the way a
change to `core/hooks/` would be. The rationale `49-immutable-
infrastructure-law.md` gives for locking `core/` — "a compromised agent
that can write directly to core can inject malicious rules" — applies
identically to workflow files: an out-of-band edit to `ci.yml` could
silently remove the Dependency Audit requirement or un-pin an action,
and nothing in this repo's current tooling would flag it as drift.

**Not implemented in this pass.** Extending `LOCKED_DIRS` requires
editing `core/scripts/update-core-lock.sh`, itself a Tier-1 protected
path — per `54-bft-consensus-law.md`'s category table, a change to
enforcement code under `core/scripts/` requires a fresh-context
security-auditor + code-auditor dispatch before it can be committed,
which this workstream's CI/docs-focused work so far hasn't needed to
invoke. Recording this as a well-evidenced, concrete recommendation for
a follow-up pass (or for the sovereign to authorize directly) rather
than triggering that review process inside what was scoped as a
CI-hardening documentation pass.

## Classifier / impact-map / benchmark items — deferred, consistent with prior findings

Classifier test scenarios (single file, multiple domains, rename,
delete, generated file, unknown path, new directory, workflow change),
resource-metric artifact format, and "authority-code test selection is
fail-closed and subsystem-based, not LOC-based" all depend on the
change-classifier / impact-map infrastructure already confirmed absent
in B4/B5/B7 (no path-based conditional logic exists on any required
check today). Not re-derived here — same underlying gap, already
recorded three times from three angles; a fourth restatement wouldn't
add evidence.
