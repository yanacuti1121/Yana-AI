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
npm run metadata:check                 # canonical filesystem-derived counts,
                                          # inventories, and current banners
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

`drift-check.sh`, `validate-counts.sh`, and `validate-manifest.sh --fix`
all route metadata decisions through `core/scripts/check_counts.py`.
Use `npm run metadata:sync` after adding or removing a managed component,
then review the generated diff before updating `core-lock.json`.

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

## Step 6 — Sứ Giả re-verifies the docs/README surfaces automatically

Added 2026-08-21, after the exact class of incident Step 2's own
2026-07-23 note describes recurred once more — `docs/index.html` stuck
at `v1.1.0` while `MANIFEST.json` said `1.4.1`, caught only by chance
during unrelated work, not by any gate. `core/scripts/check_counts.py`
now also owns the Product-version display (in addition to the component
counts it already owned) across `docs/index.html`, `docs/commands.html`,
and each `README*.md`'s Versioning table — exposed as `bin/yana su-gia`
(check mode) / `bin/yana su-gia --fix`, callable identically local or in
CI, by a human or by any AI agent.

This closes most of the gap already at Step 2 time (a version bump
without a matching docs update now fails "Hook Tests" — via
`drift-check.sh`'s existing Check 6 — on the push that introduces the
drift, before any tag exists). `.github/workflows/herald.yml` is
defense-in-depth on top of that: it re-runs `bin/yana su-gia` on every
`v*` tag push, and if anything still drifted (a tag pushed against a
stale/unreviewed commit, a manual force-tag), it opens a PR with the
mechanical fixes and fails its own check so the drift is visible on the
tag itself, not just buried in a prior CI run. It does not auto-fix
narrative prose (e.g. a "### What's new in vX.Y.Z" section) — that stays
a human call.

**Known, deliberate gap:** `docs/desktop.html`'s version badge and
download links are *not* covered by `su-gia` — they track the Desktop
app's own most-recently-*published* release, which is only equal to the
Product version once that specific tag's desktop build/publish job has
actually succeeded (not simply "whenever a `v*` tag exists"). Auto-
syncing it the same way risks advertising a download that doesn't exist
yet. Needs its own investigation before automating.

**2026-08-23 update — closing the "found by chance" gap directly.** Every
drift incident above (this section's own opening example, plus PyPI's
`yana-ai` 0.42.5 publish silently failing the same day) was found
reactively, by a human asking a direct question, because nothing in this
repo ever ran on its own schedule — confirmed by grep: zero
`schedule:`-triggered workflows existed anywhere before this date.
`herald.yml` now also runs on a daily `schedule:` cron (in addition to the
existing tag-push trigger), and `open-fix-pr` fires on drift found by
either trigger, not just a tag push — so drift introduced between tags
(a doc hand-edited, a mirror never resynced) gets the same auto-fix-PR
treatment. `su-gia` itself gained two checks it didn't have before:
- **Byte-identical mirror check** between `docs/{index,desktop}.html` and
  their `.claude/docs/` runtime copies — the two previously could (and
  did) diverge invisibly, since every existing check greeps each file's
  counts independently and never compared the files to each other. This
  is exactly how `.claude/docs/desktop.html` was found frozen on an
  entire prior visual redesign.
- `core/scripts/generate-stats.py` (a second, independent counter that
  used a different aggregation method — `max(core/*, .claude/*)` instead
  of this file's `core/*`-only counting — and could legitimately disagree
  with `check_counts.py` on the same number) is retired; its three unique
  checks (`core-lock.json` file count, `yana-rt` subcommand count,
  `docs/reference/architecture.md`'s specific count patterns) are folded
  into `check_counts.py`/`su-gia`, which now also gives `architecture.md`
  real `--fix` support for the first time.

A new, separate job `publish-parity` in the same workflow checks that
PyPI's `yana-ai` and crates.io's `yana-rt` actually match their latest
`py-v*`/`rt-v*` git tags (`core/scripts/check_publish_parity.py`) — this
would have caught the hatchling/PyPI incident the same day it happened,
not hours later when a human happened to ask. It has no `--fix`: a broken
publish needs a human to investigate and re-run, not an auto-generated
commit.

## Anti-patterns (each of these has a real incident behind it)

```
❌ Editing repeated count fields by hand instead of running
   `npm run metadata:sync` and reviewing its deterministic diff
❌ Tagging before running drift-check.sh — ships stale bundled counts
   under a new version number (found live 2026-07-23: hooks stale at 60
   vs actual 61 in six doc files, unrelated to the version bump itself)
❌ Adding a new metadata counter outside `check_counts.py` — this recreates
   independent source-of-truth logic and lets validators disagree again
❌ Tagging all three axes "to keep them in sync" when only one changed —
   defeats the entire point of independent axes (see VERSIONING.md)
❌ Treating a green publish.yml run as proof the registry updated —
   verify Step 5 for real
❌ Ignoring a herald.yml failure because the release already published —
   the fix PR it opened is the whole point; merge it, don't dismiss it
```

## References

- `VERSIONING.md` — why three independent axes, the design rationale
- `CHANGELOG.md` — existing per-release entry format to follow
- `.github/workflows/publish.yml` — the three per-axis publish jobs
- `.github/workflows/release.yml` — yana-rt binary build (the known gap)
- `core/scripts/drift-check.sh` — the CI-wired drift/count/overclaim gate
- `core/scripts/check_counts.py` (`bin/yana su-gia`) — Sứ Giả's underlying
  check/fix logic, version-anchor + component-count sync + docs mirror
  byte-diff
- `core/scripts/check_publish_parity.py` — PyPI/crates.io vs. latest tag,
  read-only, no `--fix`
- `.github/workflows/herald.yml` — tag- and schedule-triggered
  re-verification + auto-PR, plus the independent `publish-parity` job
