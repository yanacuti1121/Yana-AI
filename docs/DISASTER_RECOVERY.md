# Disaster Recovery — Multi-Forge Failover

**Status:** Design proposal, companion to `docs/MULTI_FORGE_ARCHITECTURE.md`.
Not implemented — no GitLab mirror exists yet to actually fail over to.
This document exists so that when the mirror *does* exist, the procedure
is already written rather than improvised during an actual incident.

**Assumption this document is written for:** GitHub (current `PRIMARY`)
becomes unavailable, inaccessible, or otherwise unsuitable (account
lock, policy change, pricing change, outage) and GitLab (current
`MIRROR`) needs to become the new `PRIMARY`. The same procedure applies
in reverse, and applies to any future third node (`git.yana.link`) —
only the specific commands differ, not the shape of the procedure.

---

## When to invoke this

Not for a routine GitHub outage (GitHub Status shows most incidents
resolve in under an hour). This procedure is for anh to invoke
deliberately, not something automation triggers on its own — promoting a
mirror to canonical is a decision with real consequences (contributor
confusion, split PR history, DNS/link changes), not a reversible toggle
to flip automatically on the first failed health check.

---

## Step 1 — Verify the mirror is actually usable

Before promoting anything, confirm GitLab's copy is real and current:

```
yana-rt forge status          # PROPOSED — see MULTI_FORGE_ARCHITECTURE.md §5
```

Manual fallback if the tool doesn't exist yet or is itself affected by
the outage:

```bash
# On the GitLab side, for each repository in the manifest:
git ls-remote https://gitlab.com/<namespace>/<repo>.git HEAD
# Compare against the last known-good GitHub HEAD SHA (from a local
# clone, a CI log, or a teammate's machine — NOT from GitHub itself if
# GitHub is the thing that's down)
```

If GitLab's `HEAD` matches the last known-good GitHub `HEAD`: proceed to
Step 2. If it doesn't: **stop** — promoting a stale mirror loses commits.
Recover the missing commits from any local clone with a newer `HEAD`
first (every contributor's local `.git` is itself a full backup — this
is git's own inherent resilience, not something this design adds).

## Step 2 — Promote GitLab to canonical

```
Canonical: GitHub  →  Canonical: GitLab
```

Concretely, once `forge-manifest.yml` (proposed, `MULTI_FORGE_ARCHITECTURE.md`
§3) exists:

```yaml
canonical_forge: gitlab   # was: github
```

This is a one-line config change, not a Git history rewrite — the whole
point of keeping `forge-manifest.yml`'s role assignment separate from
the actual Git objects (§4 of the architecture doc). Commit and
distribute this config change through whatever channel is still working
(email, Slack, a pinned message — GitHub being down doesn't have to mean
this specific file can't reach contributors).

## Step 3 — Update remotes

Every contributor with a local clone needs to point their `origin` (or
add a new remote) at GitLab:

```bash
git remote set-url origin https://gitlab.com/<namespace>/<repo>.git
# or, to keep GitHub reachable once it's back:
git remote rename origin github-old
git remote add origin https://gitlab.com/<namespace>/<repo>.git
```

This is a manual, per-contributor step — there is no way to force a
remote change onto someone else's local clone, and this document
doesn't pretend otherwise.

## Step 4 — Switch CI

Per `MULTI_FORGE_ARCHITECTURE.md` §6, GitLab CI's proposed role already
includes "stand ready to take over build/test duties." Promotion means:

1. GitLab CI jobs that were previously secondary (Linux build,
   security scan) become the *only* running CI until GitHub returns.
2. If release/publish needs to happen during the outage: the
   `PYPI_TOKEN`/`CARGO_REGISTRY_TOKEN` secrets (§8 of the architecture
   doc) do **not** exist in GitLab CI variables under the normal-
   operation design — during an actual promotion, these would need to
   be provisioned into GitLab CI variables as an explicit, logged,
   temporary step, then removed again once GitHub is restored and
   publishing moves back. Never leave publish credentials sitting in
   two places indefinitely "just in case."

## Step 5 — Restore release process

`release.yml`/`publish.yml` are GitHub Actions YAML — they don't run on
GitLab. A minimal GitLab CI equivalent (`.gitlab-ci.yml` job that runs
the same underlying `cargo publish`/`python -m build` commands the
GitHub Actions jobs already wrap) would need to exist *before* an
incident, not be written during one — this is a concrete follow-up item
for whoever implements `MULTI_FORGE_ARCHITECTURE.md`, not something to
improvise live. Flagged here as a gap, not silently assumed solved.

## Step 6 — Return to normal

When GitHub is restored:

1. Verify no commits landed on GitLab-as-canonical that GitHub doesn't
   have (`yana-rt forge status` again, or the manual `git ls-remote`
   fallback from Step 1).
2. Push any GitLab-only commits back to GitHub.
3. Flip `canonical_forge` back to `github`.
4. Revoke/remove any publish credentials temporarily added to GitLab CI
   in Step 4.
5. Contributors reverse Step 3's remote change.

**This is intentionally symmetric with Step 1-4** — "returning to
normal" is not a special case, it's the same promotion procedure run in
the other direction. That symmetry is what makes the migration
"reversible" per the architecture doc's principle checklist, rather than
a one-way door.

---

## What this document does not cover

- Provisioning the actual GitLab project/namespace — an infrastructure
  decision for anh, not a technical detail this document can resolve in
  advance.
- Automatic failover (this repo's own `50-financial-deadman-switch-law.md`
  and `62-sovereign-overlord-gate-law.md` rewrites, earlier in this
  project's history, are a specific cautionary example of designing an
  automatic-takeover mechanism that was never built and shouldn't be
  copied here — promotion in Step 2 is a human decision, not a script
  that runs unattended).
- A `git.yana.link` (self-hosted) failover procedure — not written until
  that node exists (§7 of the architecture doc); the shape of this
  document would carry over with different commands, not a different
  process.

---

## Related

- `docs/MULTI_FORGE_ARCHITECTURE.md` — the architecture this procedure assumes
- `core/rules/50-financial-deadman-switch-law.md`, `62-sovereign-overlord-gate-law.md` — why this repo is deliberately cautious about automatic takeover mechanisms
