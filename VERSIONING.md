# Versioning

Yana AI ships to two independent registries, each with its own version
number, plus a product axis that is tracked but no longer distributed
anywhere. This is deliberate, not drift — each axis tracks a different
artifact with its own release cadence, and forcing one global version
number across all of them would either block a release on an unrelated
component or require lockstep bumps that don't reflect what actually
changed.

| Axis | Source of truth | Registry | Bumped when |
|---|---|---|---|
| **Product version** | `package.json`, `MANIFEST.json` (kept in sync) | None — not distributed via npm. See "Why product has no registry" below. | The overall Yana AI framework changes — rules, hooks, skills, agents, CLI behavior |
| **Runtime crate version** | `Cargo.toml` | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) | `yana-rt`, the Rust runtime, changes — independent of the product version, since the crate can gain/fix functionality without every framework release needing a new crate publish |
| **Python package version** | `pyproject.toml`, `src/yana_ai/__init__.py` (kept in sync) | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) | The Python CLI/package changes |

## Why product has no registry

Through 2026-07, the product axis published to npm (`npmjs.com/package/
yana-ai`). That distribution channel is discontinued as of 2026-07-30:
the original npm account hit a persistent, unresolved account-level
publish block (403 on every publish attempt despite full read-write
access, reported to npm support repeatedly with no resolution — see
`CHANGELOG.md`'s v1.0.0 entry). A replacement account and a scoped
package name (`@vutam-yana-ai/yana-ai`) were set up, but its very first
publish attempt hit a separate 403 (a new-account anti-abuse hold,
confirmed via the registry's own request log: two clean 404 existence
checks followed by a flat 403 on the actual PUT, with no OTP/EOTP error
of the kind npm returns for a real 2FA-related rejection). Given the
identical, unresolved history with npm support on the first account,
further npm distribution was dropped rather than pursued again.

`package.json` still exists and is still versioned — it backs local
tooling (`npm test`, `npm run deploy`, the Electron build scripts,
`postinstall`) — but it is marked `"private": true` so it can never be
published, by accident or otherwise. The product version number in
`package.json`/`MANIFEST.json` is bumped for the same reasons as before
and tracked in `CHANGELOG.md`; it simply has no external registry to
push to.

**2026-08-01: tried a third time, same result — treat this as closed.**
npm/GitHub support had suggested the original 403 coincided with two npm
registry incidents rather than a permanent block, so a scoped
`@yanacuti/yana-ai` package (same, already-established account, avoiding
the new-account anti-abuse hold that sank the second attempt) was set up
and tag-pushed to trigger a real CI publish. It reached the actual
registry PUT this time — the tarball built and uploaded correctly — and
still got a 403, with the same generic message as every prior attempt.
The earlier optimism (a local `npm publish` dry run getting past the
`EPRIVATE` check) turned out to be a false signal: `EPRIVATE` is a
client-side check that fires *before* any network call, so passing it
never actually validated the account against the registry — the CI run
was the first time a real PUT ever reached npm for this account since
the original block. All npm-facing config from that attempt has been
reverted. **Do not re-attempt npm distribution again without new,
concrete evidence from npm support that the account-level block is
actually lifted** — a local dry-run passing a client-side check is not
that evidence, as this entry documents.

`.github/workflows/publish.yml` sets each registry's version from the git
tag at release time (`sed` against the relevant file), so a tagged
release is internally consistent for whichever axis it actually touches:
it does not force both files to the same number. Each axis has its own
tag prefix (`rt-v*` for the crate, `py-v*` for the Python package) and
each publish job only runs for its own prefix, fixed 2026-07-05 after
finding the jobs previously ran unconditionally on any `v*`-shaped tag
(back when a third, `v*`-prefixed npm job also existed).

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

**Product-axis freshness (added 2026-08-21):** the Product axis's own
version number reporting stale in a *display surface* (not the axis
itself disagreeing with itself, the bug above — a doc page simply not
having been updated when `MANIFEST.json`'s `version` moved) is a
different, real failure mode that happened in practice (`docs/index.html`
stuck at `v1.1.0` for three product releases). `core/scripts/
check_counts.py` (`bin/yana su-gia`) now checks and fixes this across
`docs/index.html`, `docs/commands.html`, and each `README*.md`'s
Versioning table, and `.github/workflows/herald.yml` re-runs it on every
`v*` tag push as defense-in-depth. See `docs/RELEASE-CHECKLIST.md`'s
Step 6 for the full mechanism, including the deliberate gap
(`docs/desktop.html` is not covered — different release cadence, see
that section).

**Scheduled re-verification, and publish parity (added 2026-08-23):**
`herald.yml` no longer only fires on a tag push -- it also runs daily, so
drift introduced between tags (not just at tag time) still gets caught
and auto-fixed. Separately, a new independent job checks that PyPI's
`yana-ai` and crates.io's `yana-rt` actually match their latest
`py-v*`/`rt-v*` tags (`core/scripts/check_publish_parity.py`) -- each
axis checked against its own tag prefix only, never cross-referenced
against the other axes, consistent with this document's core rule above.
See `docs/RELEASE-CHECKLIST.md` Step 6.

**Python-axis one-time catch-up (2026-08-26):** the Python package had
drifted onto a pre-1.0-looking number (`0.42.5`) while the product and
crate axes were both in the `1.4.x` generation, which read as "the
Python package is far less mature" rather than "an independently
numbered axis that happens to use different digits" — confusing enough
in practice that it was worth a one-time correction. `pyproject.toml`
and `src/yana_ai/__init__.py` were bumped straight to `1.4.2` with no
Python-specific code change behind that jump; it is a display/branding
correction, not a claim that the Python package changed. **This is not
a policy change.** The rejection below still holds: axes are not
lockstepped going forward.

**Crate-axis catch-up publish (2026-08-26):** separately, `Cargo.toml`
had already moved to `1.4.1` as part of the v1.4.2 product release, but
nobody had tagged and pushed `rt-v1.4.1` — crates.io was still serving
`1.4.0`, a real publish gap rather than intentional axis drift (see
"publish parity" above). Fixed by publishing straight to `1.4.2` to
match the product axis's current number at the time, not by catching up
to the skipped `1.4.1`. Also a one-time realignment, not a policy
change — the next crate-only change still bumps only the crate axis,
independent of product and Python.

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

## Compatibility across axes

The Python package (PyPI `yana-ai`) and the Rust runtime (crates.io
`yana-rt`) are independently versioned and independently released, but
they are not independent at runtime: `src/yana_ai/rt.py` is a thin
`subprocess` wrapper that resolves and forwards every command straight
to a `yana-rt` binary (`$YANA_RT_BIN`, `$PATH`, a bundled pre-built
binary, or a local `cargo build`, in that order — see that file's own
module doc). A user who ends up with an old `yana-rt` binary on that
resolution path (stale `$PATH` entry, an old `$YANA_RT_BIN` override,
etc.) gets confusing "unrecognized subcommand" errors that have nothing
to do with the command they actually typed — the same stale-binary
confusion class `core/rules/71-entry-point-verify-law.md` already
documents for a different entry point.

`rt.py` checks the resolved binary's own `--version` output against
`_MIN_YANA_RT_VERSION` (currently `1.0.0`) and prints an advisory
warning to stderr if it's older — **advisory only, never blocking**:
the wrapper is pure passthrough with no version-specific behavior of
its own, so refusing to run an old-but-still-working binary would be a
new failure mode invented ahead of any evidenced need. Any failure in
the check itself (binary doesn't support `--version`, times out,
unparseable output) is silently ignored — the command still runs.

Bump `_MIN_YANA_RT_VERSION` when a `yana-rt` release changes CLI
surface in a way this wrapper's users would actually notice (a
subcommand renamed or removed) — not on every crate patch release.
There is currently no known floor above `1.0.0`; it's set there as a
baseline below "pre-stabilization," not because anything specific
breaks below some higher number.
