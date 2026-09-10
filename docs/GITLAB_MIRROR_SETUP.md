# GitLab Mirror Setup

> Implements the decision anh made on 2026-09-10 for
> `docs/MULTI_FORGE_ARCHITECTURE.md` §5: **GitLab Pull Mirroring**,
> one-way GitHub → GitLab, zero new secrets, zero changes to existing
> GitHub Actions workflows. GitHub stays `canonical_forge` — the only
> place PRs, issues, and collaboration happen. GitLab is `MIRROR` only.

## Why pull, not push

GitLab's mirroring feature has two directions, named confusingly:

| GitLab calls it | What actually happens | Credential needed |
|---|---|---|
| **Push mirror** | GitLab pushes its own content *out* to another remote | A write credential for the *target* (would mean giving GitLab write access to GitHub) |
| **Pull mirror** (chosen) | GitLab fetches *from* another remote, on its own schedule | None, if the source is a public HTTPS URL |

`Yana-AI` is a public GitHub repo, so Pull Mirror needs no token, no
deploy key, no GitHub PAT, and nothing added to GitHub Actions' existing
secrets (`PYPI_TOKEN`, `CARGO_REGISTRY_TOKEN` — untouched). This is the
whole reason the architecture doc's own security section flags zero new
secrets for this design.

## Step 1 — create the GitLab project (anh, manual, GitLab UI)

1. On the GitLab account anh already has, create a new project.
2. Recommended name: `Yana-AI` (matches the GitHub repo name — not
   required, just avoids confusion later).
3. Visibility: anh's choice. Mirroring works the same either way; a
   private GitLab mirror just means fewer people can see the replica.
4. **Do not push any code to it manually.** The whole point of Pull
   Mirror is that GitLab populates it from GitHub — an initial manual
   push would create a second, independent history that the mirror
   config then has to reconcile with.

## Step 2 — configure Pull Mirroring (anh, manual, GitLab UI)

In the new GitLab project:

1. Go to **Settings → Repository → Mirroring repositories**.
2. **Git repository URL:** `https://github.com/yanacuti1121/Yana-AI.git`
3. **Mirror direction:** `Pull`
4. **Authentication method:** `None` (public repo — no token needed).
   If GitLab's UI insists on an auth method, `HTTP` with blank credentials
   also works for a public source; do not create or paste any GitHub
   token here.
5. Leave **"Mirror only protected branches"** unchecked for now
   (`main` plus tags all need to replicate, not just protected branches),
   unless anh has protected `main` on the GitLab side and only wants that.
6. Save. GitLab performs an initial sync, then re-pulls on its own
   interval (GitLab.com's default pull-mirror interval; a webhook-based
   faster path exists but isn't needed here — see
   `MULTI_FORGE_ARCHITECTURE.md` §13, "don't add complexity the brief
   didn't ask for").

## Step 3 — confirm the mirror is live (anh confirms, then tells me)

After Step 2 saves, GitLab shows a "Last successful update" timestamp
under the mirror settings, and the project's own commit list should show
the same commits as GitHub's `main`.

Once anh confirms this, send me:
- The GitLab project URL (e.g. `https://gitlab.com/<namespace>/Yana-AI`)

so I can fill it into `core/config/forge-manifest.json`'s
`repositories[0].mirrors[0].url` field (currently `null`).

## Step 4 — verify with the sync-check script (me, after Step 3)

```bash
python3 core/scripts/check_forge_sync.py
```

Reads `core/config/forge-manifest.json`, calls GitHub's and GitLab's
public REST APIs (`api.github.com`, `gitlab.com` — the only two hosts it
will ever contact, per its own allowlist) for each mirrored repo's `main`
HEAD SHA, and reports one of:

```
SYNCED        — GitHub and GitLab HEAD SHAs match
OUT_OF_SYNC   — they don't match (exit code 1 — treated as a real failure,
                never silently ignored, per anh's explicit requirement)
NOT_MIRRORED  — mirrors[].url is still null (exit code 0 — informational,
                not yet configured, not a failure)
ERROR         — a network/API call failed, or the manifest itself is
                malformed (exit code 2 — distinct from OUT_OF_SYNC so a
                transient outage or a config typo isn't misread as
                genuine divergence)
```

The process exit code is a **global max across every repo/mirror checked
in one run** (2 beats 1 beats 0), not an independent code per status —
one `OUT_OF_SYNC` mirror makes the whole run exit 1 even if every other
mirror that run is `SYNCED` or `NOT_MIRRORED`. This matters once a CI
workflow branches on the exit code: it tells you *something* diverged,
not *which* repo — read the per-repo lines above it for that.

No GitHub Actions workflow calls this script yet — per anh's explicit
"tiếp tục theo hướng minimal change, không sửa CI hiện tại nếu chưa cần."
Once the mirror is confirmed live (Step 3), a natural next step is a
**new, standalone** scheduled workflow (same pattern as
`.github/workflows/herald.yml` — its own header explains why a
standalone workflow beats appending a job to an existing one) that runs
this script daily and fails loud on `OUT_OF_SYNC`. That workflow is not
created by this document — it's the next step once the mirror exists to
actually check against.

## What this explicitly does NOT do

- Does not touch `.github/workflows/publish.yml`, `release.yml`, or any
  other existing GitHub Actions workflow.
- Does not add any GitLab CI configuration (`.gitlab-ci.yml`) — that's a
  separate, later decision per `MULTI_FORGE_ARCHITECTURE.md` §6, not part
  of getting the mirror itself working.
- Does not enable GitLab issues, merge requests, or any collaboration
  surface on the GitLab side — GitHub remains the only place for that,
  per anh's explicit instruction.
- Does not create a second source of truth. If GitHub and GitLab main
  ever show different commits, that is the `OUT_OF_SYNC` failure state
  above, not a "which one is right" question — GitHub's is always right,
  by definition of `canonical_forge`.

## References

- `docs/MULTI_FORGE_ARCHITECTURE.md` — the full design this implements
- `docs/DISASTER_RECOVERY.md` — what happens if GitHub is ever unavailable
- `core/config/forge-manifest.json` — the manifest this setup fills in
- `core/scripts/check_forge_sync.py` — the sync-check script
- `core/rules/network-egress-law.md` — the egress allowlist the script follows
- `core/rules/52-secrets-vault-law.md` — why this design introduces no new secret
