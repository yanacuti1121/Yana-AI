# B7 — Documentation / claims / CI self-governance audit (Workstream B / CI-CD Assurance)

## Machine-checked architecture claims

**Already satisfied, pre-existing.** `ci.yml`'s `test` job ("Hook Tests")
already runs exactly this category of check: "Check README/
architecture.md counts against the filesystem", "Check for dangling
paths (package.json cd targets, files[], within-axis versions)", "Check
guards/index.yml drift", "Check compiled scanner rule drift". This isn't
new work — confirming it's real and required (per B4's governance table,
Hook Tests is REQUIRED FOR MERGE) rather than aspirational.

## Release gate vs. PR gate strength — real finding: currently backwards

The document requires the release gate be **stronger** than the PR gate
(critical T1/T2, platform builds, artifact smoke, provenance, dependency
policy, release regressions). Checked `ci.yml`'s actual trigger:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

**`ci.yml` does not trigger on tag pushes at all.** `release.yml`,
`desktop.yml`, and `publish.yml` are all tag-triggered and run
independently — none of them re-run Hook Tests, the Rust test suite,
System Health Monitor, Self-Audit, or Dependency Audit. Release-time
verification today is exactly what this workstream added in B1/B3
(binary smoke test + release manifest) and nothing from the PR-gate T1/T2
suite. The implicit assumption is that a tag is always cut from a commit
on `main` that already passed the required PR checks — but nothing in
this repo's actual configuration enforces or verifies that assumption;
a tag can be pushed against any commit/branch by anyone with push access
and `release.yml` will build and publish it regardless of whether that
commit ever went through `ci.yml`'s required checks. This is the
opposite of "release gate stronger than PR gate" — right now it's
release gate is a strict subset of PR gate's coverage, executed on an
unverified assumption about which commits get tagged.

**Not fixed in this pass** — closing this properly means either adding
a re-run of the critical T1/T2 subset to the release workflows, or
verifying the tagged commit's PR-gate status via the GitHub API before
building, and choosing between those (or another approach) is a real
design decision with CI-time/cost tradeoffs, not a one-line change.
Recording as a concrete, well-evidenced gap for the next pass.

## CI authority model

Document: `Developer/Agent → PR → CI Evidence → Required Gates →
Human/Merge Authority → Release Authority`; CI supplies evidence, it is
not sovereign authority; overrides should be explicit/auditable.

Checked the actual branch protection config
(`gh api repos/.../branches/main/protection`), not assumed:

- `allow_force_pushes: false`, `allow_deletions: false` — matches
  `git-push-enforcement.md`'s force-push prohibition at the platform
  level, not just the agent-behavior level. Good.
- `enforce_admins: false` — **repo admins can merge bypassing all
  required checks.** This is the literal "override" the document asks
  be "explicit/auditable" — it is auditable (GitHub logs admin merges),
  but it is not explicit in the sense of requiring a stated reason each
  time; it's a standing bypass capability. **Flagging as a decision
  point, not changing it**: for a repo with effectively one maintainer
  who is also the admin, this may be an intentional, reasonable
  emergency-override capability rather than an oversight — but it does
  mean the branch-protection work done earlier this session (enabling
  Dependency Audit as REQUIRED with known real CVEs) can be silently
  bypassed by the same person who enabled it. Worth an explicit
  decision either way, not a silent change in either direction.
- `required_pull_request_reviews: null` — **no required approving
  review count.** Read in context: this repository has a single active
  maintainer (per its commit history and this session's own working
  relationship), so a required-reviewer count has no second human to
  satisfy it — treating this as "no reviewer" would functionally block
  all merges, not add safety. Not flagging as a gap for that reason;
  noting it here so the CI-authority-model picture is complete and
  accurate rather than silently omitted.
- `restrictions: null` — no push-restriction allowlist; anyone with
  repo write access can push directly (not just via PR). Consistent
  with a single-maintainer repo; not flagged as a gap for the same
  reason as above.

## Fresh-context reviewer requirement

**Already satisfied, pre-existing, not duplicated here.**
`54-bft-consensus-law.md` already mandates a fresh-context reviewer
(security-auditor + a second, category-specific reviewer) dispatched
via the Task tool before any write to `core/rules/`, `core/hooks/`,
`core/gates/`, `core/agents/`, or integrity-lock files, with the exact
severity vocabulary this document asks for covered by
`conflict-resolution.md`'s Safety > Correctness > Performance > Style
priority order. This document's `BLOCKING/HIGH/MEDIUM/LOW/INFO` severity
scale is finer-grained than that priority order, but the underlying
mechanism (independent reviewer, blocking on a serious finding, human
escalation on genuine conflict) is the same system already enforced.
Not proposing a second, parallel severity taxonomy for the same
mechanism.

## SBOM

**Partial — exists for one artifact type, absent for the others.**
`sandbox.yml:117` sets `sbom: true` (a Docker buildx attestation option)
for the sandbox container image. `release.yml` and `desktop.yml` — the
workflows producing the CLI binary and the Electron desktop app,
respectively, the two artifact types most end users actually download —
generate no SBOM. This is a real, scoped gap: closing it for the Rust
binaries would mean wiring something like `cargo-cyclonedx` or `cargo
sbom` into `release.yml` alongside the manifest step already added in
B3; closing it for the Electron app would mean an `electron-builder`-
compatible SBOM step in `desktop.yml`. Not implemented in this pass —
recording as scoped, actionable follow-up rather than attempting both
in the same pass this finding was discovered in.

## No test-count / workflow-count vanity — spot-checked, not a violation found

Searched `README.md`/`docs/*.md` for bare numeric test/workflow-count
claims. Found several (`docs/AGENT_BEHAVIOR.md:22` "✓ 47 tests passed",
`docs/ARCHITECTURE.md:290` "65 tests, must PASS", per-category counts in
`docs/PHASE1_COMPLETE.md`). Read in context, these read as documentation
of expected command output for a specific named test suite (i.e.,
"running this script should show this"), not standalone vanity badges
claiming overall project quality from a bare number — the document's
actual target ("no test-count vanity") is closer to marketing-style
claims like "1000+ tests!" divorced from what they test. Not treated as
a violation; not exhaustively audited across every doc file in the
repo (a full doc sweep for stale/vanity claims is a larger, separate
effort from this CI-assurance pass).

## Deferred, consistent with prior findings

Nightly-failure-artifact requirements, CI-helper-script testing
(change classifier / test selector / manifest builder / failure
parser), and "release candidate that passes verification should be
exactly the released artifact" all depend on infrastructure this
workstream has already confirmed doesn't exist yet (T5 nightly tier —
B1/B4; no change-classifier logic — B4/B5). Not re-litigated here;
cross-referenced to avoid restating the same gap a fourth time.
