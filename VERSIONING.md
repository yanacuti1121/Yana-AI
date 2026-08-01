# Versioning

Yana AI ships to three independent registries, each with its own version
number. This is deliberate, not drift — each axis tracks a different
artifact with its own release cadence, and forcing one global version
number across all of them would either block a release on an unrelated
component or require lockstep bumps that don't reflect what actually
changed.

| Axis | Source of truth | Registry | Bumped when |
|---|---|---|---|
| **Product version** | `package.json`, `MANIFEST.json` (kept in sync) | [npmjs.com/package/@yanacuti/yana-ai](https://www.npmjs.com/package/@yanacuti/yana-ai) — scoped, see "Why product is a scoped npm package" below | The overall Yana AI framework changes — rules, hooks, skills, agents, CLI behavior |
| **Runtime crate version** | `Cargo.toml` | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) | `yana-rt`, the Rust runtime, changes — independent of the product version, since the crate can gain/fix functionality without every framework release needing a new crate publish |
| **Python package version** | `pyproject.toml`, `src/yana_ai/__init__.py` (kept in sync) | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) | The Python CLI/package changes |

## Why product is a scoped npm package

Through 2026-07, the product axis published to npm as the unscoped
`yana-ai`. That name is retired for npm purposes: the account publishing
it (`yanacuti`) hit a persistent 403 on every publish attempt despite
full read-write access, reported to npm support repeatedly with no
resolution at the time (see `CHANGELOG.md`'s v1.0.0 entry). A replacement
account and a different scoped name (`@vutam-yana-ai/yana-ai`) were tried
next, but that account's very first publish attempt hit a *separate* 403
— a new-account anti-abuse hold, confirmed via the registry's own request
log (two clean 404 existence checks, then a flat 403 on the PUT, no
OTP/EOTP error of the kind npm returns for a real 2FA-related rejection).
Given both attempts failed, npm distribution was dropped entirely as of
2026-07-30 and `package.json` was marked `"private": true`.

**2026-08-01: npm distribution reinstated**, after npm/GitHub support
confirmed (in response to the original ticket) that the 403 coincided
with two separate npm registry incidents
(status.npmjs.org/incidents/nwz55wql2vlc, .../r3v0vxwksk7s) rather than a
permanent block on the account. Re-tested directly against the
*original* `yanacuti` account (not the replacement one that hit the
new-account hold) — the publish attempt got past the point the old 403
used to occur and hit only the `"private": true` guard, confirming the
account itself is healthy. Rather than reclaim the unscoped `yana-ai`
name (unpublished 2026-07-30 and now unowned, but npm's anti-abuse
policy can block re-registering an unpublished name, sometimes
permanently, even for the original owner — reclaiming it was judged not
worth that risk), the product now publishes as **`@yanacuti/yana-ai`** —
same, already-established account, new scoped name, avoiding both
failure modes above: no unscoped-name reclaim risk, and no new-account
anti-abuse hold since the account isn't new.

`package.json` no longer has `"private": true` and instead sets
`"publishConfig": { "access": "public" }`, since npm scoped packages
default to restricted/private access otherwise. The product version
number in `package.json`/`MANIFEST.json` is bumped for the same reasons
as before and tracked in `CHANGELOG.md`.

`.github/workflows/publish.yml` sets each registry's version from the git
tag at release time (`sed` against the relevant file), so a tagged
release is internally consistent for whichever axis it actually touches:
it does not force both files to the same number. Each axis has its own
tag prefix (`rt-v*` for the crate, `py-v*` for the Python package,
`npm-v*` for the npm package) and each publish job only runs for its own
prefix, fixed 2026-07-05 after finding the jobs previously ran
unconditionally on any `v*`-shaped tag.

**Known residual gap:** `.github/workflows/release.yml` (builds and
attaches `yana-rt` binaries to a GitHub Release) still triggers on any
plain `v*` tag with no axis check, so a product-only release (tag `v*`)
also kicks off a `yana-rt` binary build even when no Rust code changed
this cycle. It doesn't corrupt any published version number, since it
builds from whatever `Cargo.toml` already says, but it's an unnecessary
build and a release page that implies a `yana-rt` change happened when
it didn't. Not fixed as part of the 2026-07-05 `publish.yml` fix; noted
here so it isn't assumed closed.

**If you see three different version numbers across this repo, that's
expected.** What should never happen: the *same* axis reporting two
different numbers for itself (e.g. `Cargo.toml` says one thing and
`yana-rt --version` prints another — that would be a real bug, not
axis drift). `yana-rt --version` reads `CARGO_PKG_VERSION` directly from
`Cargo.toml` at compile time for exactly this reason.

## Why not one version number for everything

Considered and rejected: a single version bumped on every release,
applied identically to all three files (product, crate, Python — this
predates npm distribution being dropped and applied just as much when
there were three real registries). Rejected because:

- The registries have historically released on different schedules (the
  crate has been published ahead of framework releases and vice versa).
- Lockstep versioning would mean every crates.io publish requires a
  simultaneous PyPI publish even when neither changed, or the files
  silently drift apart anyway the first time a maintainer forgets one —
  which is a worse failure mode than clearly-labeled, independently-
  correct axes.
