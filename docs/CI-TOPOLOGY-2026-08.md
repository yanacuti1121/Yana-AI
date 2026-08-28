# CI Topology — audit note (Authority Hardening item #12)

**Status:** Findings + recommendation only. No restructuring done — see
"Why no split was implemented" below.
**Date:** 2026-08-28

## Current topology (`.github/workflows/ci.yml`, read directly)

7 jobs, all triggered unconditionally on every `push`/`pull_request` to
`main` — confirmed via `grep -n "paths:\|paths-ignore:"
.github/workflows/ci.yml` returning zero matches. There is no fast/slow
split today; every job runs on every PR regardless of what changed.

| Job | What it does | Observed duration (real runs this workstream produced) |
|---|---|---|
| `test` ("Hook Tests") | bash/Python hook regression suite, drift-check, dangling-path check, guard-index check, action-pin check | ~2min |
| `flock-v1-linux` ("Kernel flock-v1") | Rust+Python flock-v1 unit tests, cutover regression, cross-language matrix ×5, packaging surface check | ~5min (the slowest job) |
| `rust-tests` ("Rust Integration Tests") | `cargo build`, dispatch-drift check, unit tests, integration tests, `discord`+`mcp` feature builds | ~2min |
| `system-health-monitor` | native health sampler, matrix ×3 (ubuntu/macos/windows) | ~1-2min per leg |
| `self-audit` ("Yana AI Self-Audit") | dogfoods the scanner against this repo's own `scanner/*.yml` | ~1min |
| `dependency-audit` ("Dependency Vulnerability Audit") | `cargo audit` + `pip-audit` ×2 + `npm audit` ×2 | ~3min |
| `required-checks-drift` | new this workstream (item #10) — manifest/ci.yml consistency check | seconds |

Jobs run in parallel (separate GitHub Actions jobs), so wall-clock PR
latency is bounded by the slowest job plus queue time, not the sum —
roughly 5-6 minutes end to end based on the runs this workstream
produced, not the ~15+ minutes a sequential sum would suggest.

## Why no fast/affected/deep split was implemented here

The workstream's own instruction for this item is explicit about the
failure mode to avoid: "classification failure must be fail-safe: if
impact cannot be determined, run MORE coverage, never less. Security/
authority/core-runtime changes must always pull in the appropriate
required deep checks." A path-filtered fast/affected/deep split is a
real, nontrivial classification system — every one of the 7 jobs above
would need a correct, maintained mapping from file glob to "does this
job need to run," and a wrong mapping fails *silently* (a PR merges with
a security-relevant job never having run, and nothing says so unless
someone notices later).

Building that classification system carries real risk of getting a
mapping wrong in exactly the way that matters most — the current
topology's actual property, "everything runs on every PR," is *already*
the maximally fail-safe answer to that constraint. Trading it for a
faster-but-fallible one is a genuine engineering tradeoff this
workstream did not have strong enough evidence to make well: no PR
velocity complaint was raised as part of this request, and 5-6 minutes
of parallel CI wall-clock is not, on its own, evidence that a
classification system's risk is worth taking on.

## What would change this recommendation

- A concrete, measured PR-velocity complaint (CI queue time consistently
  exceeding some stated threshold), not just "CI could theoretically be
  faster."
- A design for the fast/affected/deep split that names, for each of the
  7 jobs above, the exact file globs that must always trigger it, with
  `required-checks-drift`'s own drift-detection pattern (item #10)
  extended to also catch a job's trigger-path mapping going stale, not
  just its name.
- Explicit sign-off that `flock-v1-linux` and `dependency-audit` — the
  two jobs whose false-negative risk is highest (a locking-protocol
  regression, an unaudited CVE) — are either always in the fast gate
  regardless of path classification, or covered by a scheduled/nightly
  run independent of PR-triggered classification, per the existing
  "a deeper stress/nightly path can be added if the architecture has a
  fitting place for it" allowance in this workstream's own brief.

## References

- `.github/workflows/ci.yml` — the 7 jobs audited above
- `.github/required-checks.json`, `core/scripts/verify-required-checks-drift.sh`
  — item #10's single source of truth, the precedent this note's
  drift-detection suggestion would extend
- `docs/adr/ADR-015-remote-approval-continuation-and-intent-contract.md`
  — the other two items from this workstream resolved as design-only
  rather than code, for a related but distinct reason (missing
  primitives, not restructuring risk)
