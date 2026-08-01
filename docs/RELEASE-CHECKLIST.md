# Release Checklist

> Companion to `VERSIONING.md` (the *why* — three independent version
> axes). This file is the *how* — the concrete steps for cutting a real
> release without the axes drifting apart or an artifact shipping with
> stale bundled counts. Written 2026-07-23 by tracing `.github/workflows/
> publish.yml` and `release.yml`'s actual behavior — every claim below
> was verified against the workflow files and real git tag history, not
> assumed from how a "normal" semver setup usually works.

## Step 0 — decide which axis(es) actually changed

Per `VERSIONING.md`'s bump table:

| Axis | Changed when | Tag prefix |
|---|---|---|
| Product | rules, hooks, skills, agents, CLI behavior | `v*` |
| `yana-rt` crate | the Rust runtime changed | `rt-v*` |
| Python package | the Python CLI/package changed | `py-v*` |

A single release almost never touches all three — pushing only the
tag(s) for the axis(es) that actually changed is the point of this
scheme (see `VERSIONING.md`'s "Why not one version number for
everything"). Don't tag an axis that didn't change just to "keep
numbers moving together."

## Step 1 — bump the RIGHT files, by axis

**Critical, easy to miss:** CI does **not** update every axis's files
before publish — it depends on the axis.

| Axis | What CI does automatically at publish time | What you must do manually before tagging |
|---|---|---|
| Product (npm) | `npm version "$VERSION"` sets `package.json` from the tag | **`MANIFEST.json`'s `version` field — CI never touches this file.** Forgetting this is exactly the kind of drift `core/scripts/drift-check.sh` exists to catch (see 2026-07-23 fix: `git log` this file's history for the concrete incident) |
| `yana-rt` crate | `sed` sets `Cargo.toml`'s `version` from the tag | Nothing strictly required for publish to succeed (`cargo publish --allow-dirty`) — but keep `Cargo.toml` current between releases so local `cargo build`/`yana-rt --version` reflect reality, not a stale number |
| Python package | `sed` sets `pyproject.toml` **and** `src/yana_ai/__init__.py` from the tag | Same as crate axis — not required by CI, but keep both files in sync with each other locally (this is the one axis with two files that must already agree, per `VERSIONING.md`'s "same axis reporting two different numbers" bug class) |

For the product axis specifically, also re-run the count/drift gates
(Step 2) **before** bumping `MANIFEST.json`'s version — a version bump on
top of already-stale counts just ships the staleness under a new number.

## Step 2 — run the drift gates

All three must be clean before tagging (product axis) or before any
axis if hooks/scripts/rules were touched this cycle:

```bash
bash core/scripts/drift-check.sh        # CI-wired — task drift, README
                                          # overclaim, stale L1 facts,
                                          # MANIFEST/plugin/marketplace
                                          # cross-count, AND marketing-copy
                                          # prose numbers (docs/*.html,
                                          # SKILL.md) as of 2026-07-23
bash core/scripts/verify-core-lock.sh   # core/rules,gates,hooks,scripts
                                          # SHA-256 pin — must be intentional
bash core/scripts/verify-skills-lock.sh
bash core/tests/skills/test-skill-triggering.sh
bash core/tests/hooks/run-hook-tests.sh # includes verify-hook-mirrors.sh's
                                          # live check as of 2026-07-23
```

If the Rust runtime changed:

```bash
cargo test --bin yana-rt -- --test-threads=1
cargo test --test integration_runtime -- --test-threads=4
```

`validate-manifest.sh` and `validate-counts.sh` are not wired into CI
(see their own header comments) but are safe, fast, and worth running by
hand as a second opinion — they should already agree with
`drift-check.sh` since all three use the same find patterns
(reconciled 2026-07-13).

## Step 3 — update CHANGELOG.md

Follow the existing format (see the `v0.43.1` entry): state which
axis/axes this release touches and why the others are unchanged, not
just a bullet list of changes. A reader should be able to tell from the
changelog entry alone whether they need to update their npm install,
their `cargo install yana-rt`, or their `pip install yana-ai` — or none
of the above.

## Step 4 — tag and push

```bash
# Product axis
git tag v0.43.3 -m "..."
git push origin v0.43.3

# yana-rt crate axis (independent — only if the crate changed)
git tag rt-v1.3.4 -m "..."
git push origin rt-v1.3.4

# Python package axis (independent — only if the package changed)
git tag py-v0.42.4 -m "..."
git push origin py-v0.42.4
```

Pushing a tag is the actual trigger — `publish.yml`'s jobs are each
scoped to their own prefix (`v*` excluding `rt-v*`/`py-v*` for npm,
`rt-v*` for crates, `py-v*` for PyPI), so pushing one axis's tag will
not accidentally publish the other two.

**Known gap, not yet fixed (see `VERSIONING.md`'s "Known residual
gap"):** `release.yml` triggers a full 4-platform `yana-rt` binary build
on *any* `v*` tag, even a product-only release where Rust didn't change.
This doesn't corrupt anything (it builds from whatever `Cargo.toml`
already says) but expect an extra build + GitHub Release page after
every product tag, not just crate releases.

## Step 5 — verify the publish actually landed

```bash
npm view yana-ai version                       # after a v* tag
curl -s https://crates.io/api/v1/crates/yana-rt | python3 -c "import json,sys; print(json.load(sys.stdin)['crate']['max_version'])"  # after rt-v*
curl -s https://pypi.org/pypi/yana-ai/json | python3 -c "import json,sys; print(json.load(sys.stdin)['info']['version'])"  # after py-v*
```

Confirm the version matches what was just tagged — a publish job
succeeding in CI's UI is not the same as the registry actually showing
the new version (skip-existing/idempotency logic in these jobs means a
job can report green without having published anything new).

## Anti-patterns (each of these has a real incident behind it)

```
❌ Bumping package.json without MANIFEST.json — CI only auto-syncs the
   former; the latter needs a manual step every single time
❌ Tagging before running drift-check.sh — ships stale bundled counts
   under a new version number (found live 2026-07-23: hooks stale at 60
   vs actual 61 in six doc files, unrelated to the version bump itself)
❌ Assuming validate-manifest.sh/validate-counts.sh passing means
   drift-check.sh (the one CI actually runs) would also pass — true as
   of 2026-07-23's reconciliation, but re-verify if any of the three
   scripts' find patterns are ever edited independently again
❌ Tagging all three axes "to keep them in sync" when only one changed —
   defeats the entire point of independent axes (see VERSIONING.md)
❌ Treating a green publish.yml run as proof the registry updated —
   verify Step 5 for real
```

## References

- `VERSIONING.md` — why three independent axes, the design rationale
- `CHANGELOG.md` — existing per-release entry format to follow
- `.github/workflows/publish.yml` — the three per-axis publish jobs
- `.github/workflows/release.yml` — yana-rt binary build (the known gap)
- `core/scripts/drift-check.sh` — the CI-wired drift/count/overclaim gate
