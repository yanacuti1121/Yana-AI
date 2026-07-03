# Versioning

Yana AI ships to three independent registries, each with its own version
number. This is deliberate, not drift — each axis tracks a different
artifact with its own release cadence, and forcing one global version
number across all three would either block a release on an unrelated
component or require lockstep bumps that don't reflect what actually
changed.

| Axis | Source of truth | Registry | Bumped when |
|---|---|---|---|
| **Product version** | `package.json`, `MANIFEST.json` (kept in sync) | [npmjs.com/package/yana-ai](https://www.npmjs.com/package/yana-ai) | The overall Yana AI framework changes — rules, hooks, skills, agents, CLI behavior |
| **Runtime crate version** | `Cargo.toml` | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) | `yana-rt`, the Rust runtime, changes — independent of the product version, since the crate can gain/fix functionality without every framework release needing a new crate publish |
| **Python package version** | `pyproject.toml`, `src/yana_ai/__init__.py` (kept in sync) | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) | The Python CLI/package changes |

`.github/workflows/publish.yml` sets each registry's version from the git
tag at release time (`sed`/`npm version` against the relevant file), so a
tagged release is internally consistent for whichever axes it actually
touches — it does not force all three files to the same number.

**If you see three different version numbers across this repo, that's
expected.** What should never happen: the *same* axis reporting two
different numbers for itself (e.g. `Cargo.toml` says one thing and
`yana-rt --version` prints another — that would be a real bug, not
axis drift). `yana-rt --version` reads `CARGO_PKG_VERSION` directly from
`Cargo.toml` at compile time for exactly this reason.

## Why not one version number for everything

Considered and rejected: a single version bumped on every release,
applied identically to all three files. Rejected because:

- The three registries have historically released on different
  schedules (the crate has been published ahead of framework releases
  and vice versa).
- Lockstep versioning would mean every crates.io publish requires a
  simultaneous PyPI + npm publish even when neither changed, or the
  three files silently drift apart anyway the first time a maintainer
  forgets one — which is a worse failure mode than three
  clearly-labeled, independently-correct axes.
