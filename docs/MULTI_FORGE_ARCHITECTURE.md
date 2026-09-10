# Multi-Forge Git Architecture

**Status:** Design proposal, not implemented. Written per anh Tâm's direct
brief (2026-09-10) — audit first, minimal change, no rewrite. Every claim
below about "current state" was verified against this repo's actual files,
not assumed; every proposal is marked as a proposal, not conflated with
what exists today.

**Core principle (anh's own words, kept verbatim):** *"GitHub là một node.
GitLab là một node. Self-hosted Git là một node. Yana mới là hệ thống.
Không forge nào được trở thành nơi duy nhất Yana có thể tồn tại."*

---

## 0. What this document is and isn't

This is Phase 0-1 of this repo's own `docs/programs/ADS-v1.md` process —
Input + Specification. It does **not** implement anything: no new
`.gitlab-ci.yml`, no new sync script, no new secrets. Per anh's explicit
instruction ("Không được rewrite toàn bộ project nếu không cần... Trước
khi implement những thay đổi lớn, hãy đọc code/config hiện có"), this
document's job is to answer his 10 numbered questions with real audit
evidence, then propose an architecture — implementation is a separate,
later decision.

---

## 1. Audit — what actually depends on GitHub today (2026-09-10)

Grepped the full repo (excluding `node_modules`, `.git`, `vendor/`, and
stale worktrees) for `github.com` across code and config: **145 files**
contain the string. That number is misleading on its own — most of it is
either (a) `.github/workflows/*.yml`, which is GitHub Actions by
definition and isn't a "dependency" to remove, or (b) attribution
citations in `core/rules/*.md` ("Source: github.com/foo/bar") and
`README.md`/docs prose, which are informational text, not functional
coupling. Narrowing to **functional** dependencies — code that actually
calls a GitHub-specific API, expects a GitHub-shaped credential, or
hardcodes a GitHub URL as the *only* source of truth — the real surface
is small:

| File | What it does | Coupling type |
|---|---|---|
| `core/scripts/upgrade.py:14-15` | `API_URL` hardcodes `https://api.github.com/repos/{REPO}/releases/latest`; `CLONE_URL` hardcodes `https://github.com/{REPO}.git` | **Hard** — self-update mechanism only knows how to check GitHub Releases |
| `src/doctor/mod.rs:492-497`, `core/scripts/doctor.py:233-238` | Checks `GITHUB_TOKEN`/`GH_TOKEN` env var; without it, disables "PR scan and CI checks" | **Soft** — feature degrades gracefully today, but only ever *checks* GitHub, never GitLab |
| `.github/workflows/{release,publish,herald,desktop}.yml` | The entire tag-push → build → GitHub Release → crates.io/PyPI publish pipeline | **Hard, by design** — this is GitHub Actions; not a bug, but the single point of failure for *releasing* anything |
| `core/scripts/verify-required-checks-drift.sh` | Verifies `.github/required-checks.json` against `ci.yml` job names; explicitly documents (its own header comment) that it *cannot* read GitHub's actual branch-protection settings without repo-admin scope | **Hard, GitHub-only by design** — validates GitHub's own CI manifest, not a general concept |
| `package.json:24-26`, `Cargo.toml:7-8`, `pyproject.toml:40-41` | `repository`/`homepage` fields hardcode `github.com` URLs | **Cosmetic** — these are metadata shown on crates.io/PyPI package pages, not runtime dependencies |
| `src/connector.rs:85,457-472` | A GitHub *notifications* connector (`YANA_GITHUB_ACCESS_TOKEN` → `api.github.com/notifications`) | **Not in scope** — this is a deliberate feature integration (like a Slack or Discord connector), not a "where is source code hosted" dependency. A future GitLab-notifications connector would be a *new feature*, not a fix to this one. |

**What this means for the brief's question 1-3 (§14):**

1. **Tightly coupled to GitHub, needs abstraction:** `upgrade.py`'s
   update-check URL, and the entire `release.yml`/`publish.yml`/`herald.yml`
   pipeline's assumption that GitHub Releases is where build artifacts
   live.
2. **Can stay exactly as-is:** `src/connector.rs` (a feature, not
   infrastructure), `verify-required-checks-drift.sh` (validates GitHub's
   own config, has no GitLab equivalent to validate yet), the `.github/`
   workflow files themselves (GitHub Actions is a real, working CI
   backend — nothing here says to remove it, only to stop treating it as
   the *only* one).
3. **Needs a config layer, not a rewrite:** the `repository`/`homepage`
   metadata fields, and `doctor`'s PR-scan check — both can read from a
   canonical-forge config value instead of a hardcoded string, without
   changing their actual logic.

---

## 2. Proposed architecture

```
                          YANA
                            │
                    Local Git repos
                            │
                   Canonical workflow
                  (git add / commit / push —
                   unchanged for developers)
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
           GitHub                      GitLab
      PRIMARY (today)              MIRROR + CI (today)
   PR/issues/discussions/       repo mirror, backup,
   contributor workflow/        secondary CI, security
   releases/visibility          scanning, extra runners
              │                           │
              └─────────────┬─────────────┘
                            │
                            ▼
                  Future: git.yana.link
                  (INTERNAL + ARCHIVE node,
                   not built now — see §7)
```

This matches anh's own diagram exactly (§1 of his brief) — it isn't
changed here, just grounded in the audit above: GitHub is `PRIMARY`
today because that's where `release.yml`/`publish.yml` already live and
work; GitLab starts as `MIRROR + CI`, not `PRIMARY`, because there is
currently **zero** GitLab configuration in this repo (`find . -iname
"*.gitlab*"` → no results) — adding a mirror is additive, promoting
GitLab to primary later is a separate, reversible decision (see
`DISASTER_RECOVERY.md`).

---

## 3. Source of truth — one canonical governance layer, code allowed to exist in many places

Per anh's own framing: *"Code có thể tồn tại ở nhiều forge, nhưng
governance chỉ có một canonical source."* Concretely:

```jsonc
// core/config/forge-manifest.json — REAL, built 2026-09-10 (JSON, not the
// YAML originally sketched here — every other core/config/ file is JSON,
// and this avoids adding a PyYAML dependency for one file)
{
  "canonical_forge": "github",
  "repositories": [
    {
      "name": "Yana-AI",
      "primary_url": "https://github.com/yanacuti1121/Yana-AI",
      "mirrors": [
        {
          "provider": "gitlab",
          "url": null,               // GitLab side is configured; url still pending from anh
          "role": "mirror",
          "direction": "pull",
          "sync_transport": { "active": "gitlab-native-pull-mirror", "...": "see §5" }
        }
      ]
    },
    { "name": "yana-web", "primary_url": "https://github.com/yanacuti1121/yana-web", "mirrors": [] },
    { "name": "yana-wheelbot", "primary_url": "https://github.com/yanacuti1121/yana-wheelbot", "mirrors": [] }
  ]
}
```

This directly answers §10 of the brief (a central manifest covering the
whole ecosystem, not just this one repo) using the real repo list already
established in `docs/website/ECOSYSTEM_AUDIT.md` — `Yana-AI`,
`yana-web`, `yana-wheelbot` are the three confirmed-real GitHub repos in
this ecosystem as of that audit; `Yana-Studio` currently has **no**
separate repository (it lives inside `tools/yana-studio/` in the
`Yana-AI` monorepo per that same audit) — the example manifest in the
brief's §10 listing "Yana-Studio" as a top-level repo doesn't match
current reality and shouldn't be implemented as written until/unless
Studio is actually split into its own repo.

**Divergence rule (anh's own example, kept as the hard constraint):**
if `GitHub main` and `GitLab main` ever point at different commits, that
is a **failure state**, not a normal condition — never silently reconcile
by picking one side. This is designed into §5 (sync status) below as an
explicit, loud `SYNC STATUS: FAILED`, not a warning that gets ignored.

---

## 4. Repository roles (§9 of the brief)

Roles are configuration values, not hardcoded per-provider assumptions —
directly implementing anh's requirement that "vai trò phải configurable
thay vì gắn cứng vào từng provider":

| Role | Meaning | Current holder |
|---|---|---|
| `PRIMARY` | Where PRs/issues/discussions/contributor workflow live; where `release.yml`/`publish.yml` trigger from | GitHub |
| `MIRROR` | Byte-identical copy of every branch/tag; read-only from a developer's perspective | *(none yet — proposed: GitLab)* |
| `CI` | Runs build/test jobs; may or may not be the same node as `MIRROR` | GitHub Actions today; proposed: GitLab CI takes a defined subset (see §6) |
| `ARCHIVE` | Long-term backup, disaster-recovery source | *(none yet — proposed: GitLab initially, `git.yana.link` eventually)* |
| `INTERNAL` | Private development, pre-public work | *(not needed today — no current private-development workflow was found requiring this)* |

The manifest in §3 assigns roles per repository, so a future role swap
(GitLab becomes `PRIMARY`, GitHub becomes `MIRROR`) is a config edit, not
a code change — this is what "reversible migration" (§13 principle)
concretely means here.

---

## 5. Repository synchronization (§3 of the brief)

**Mechanism: GitLab Pull Mirroring**, not a custom sync script, and not
"push mirroring" as this section originally (incorrectly) named it —
corrected 2026-09-10 once anh decided the direction (see
`docs/GITLAB_MIRROR_SETUP.md`). GitLab's terms for its two built-in
mirroring modes are opposite of what they sound like at a glance: "Push
mirroring" means *GitLab* pushes *out* to another remote (would require a
write credential on the GitHub side); "Pull mirroring" means GitLab
*fetches from* another remote on its own schedule. GitHub → GitLab is a
**pull**, configured entirely on the GitLab project (Settings →
Repository → Mirroring repositories, direction: Pull) — this is the
standard, well-tested tool for exactly this job, and matches anh's own
principle #13 ("Đừng tạo complexity chỉ để nói rằng hệ thống là
multi-cloud"). Building a custom polling/push script here would be
unnecessary complexity for a solved problem.

```
Developer → git push → GitHub (canonical)
                            │
                 GitLab Pull Mirror (built-in feature,
                 GitLab-side config, GitLab initiates the fetch)
                            │
                        GitLab (replica)
```

Developer workflow stays exactly `git add / commit / push` — anh's own
requirement in §13 — because the mirroring happens entirely on GitLab's
side, invisible to the developer and untouched by GitHub Actions.

**Sync verification — `core/scripts/check_forge_sync.py` (built 2026-09-10,
implements §12 of the brief's `yana forge status` sketch):**

```
$ python3 core/scripts/check_forge_sync.py

Yana Forge Status (canonical: github)

Yana-AI
  gitlab     PENDING        GitLab branch 'main' not found yet at
                            https://gitlab.com/<namespace>/Yana-AI --
                            initial mirror sync likely still running

yana-web
  (no mirrors configured)

yana-wheelbot
  (no mirrors configured)
```

A Python script, not the `yana-rt forge status` Rust subcommand
originally sketched — this exists so the check works today without
waiting on that CLI work, reading `core/config/forge-manifest.json`
(JSON, not the `.yml` sketched below — see that file's own `$comment`
for why) and calling each forge's REST API for `HEAD` SHA per branch
(`GET /repos/{repo}/commits/{branch}` for GitHub, `GET /projects/{id}/
repository/branches/{branch}` for GitLab — both public, well-documented,
read-only, least-privilege endpoints). A future `yana-rt forge status`
subcommand can replace or wrap this script without changing the manifest
schema or the states below.

Five states, not two — added `PENDING` on 2026-09-10 once the real
`Yana-AI` mirror was configured and needed a way to say "configured, but
still doing its (large) initial sync" without that reading as a failure:

| State | Meaning | Exit code |
|---|---|---|
| `SYNCED` | GitHub and mirror HEAD SHAs match | 0 |
| `PENDING` | Mirror configured, GitLab project exists, but the branch hasn't landed yet (expected during a large repo's first sync) | 0 |
| `NOT_MIRRORED` | No mirror configured at all (`mirrors[].url` is `null`) | 0 |
| `OUT_OF_SYNC` | Mirror exists and has content, but HEAD SHAs don't match | 1 |
| `ERROR` | Network/API failure or malformed manifest — distinct from `OUT_OF_SYNC` so a transient outage is never misread as genuine divergence | 2 |

`OUT_OF_SYNC` and `ERROR` are the only two that are ever a failure —
never silently treated as OK, directly per anh's "Không được âm thầm bỏ
qua" requirement. `PENDING` and `NOT_MIRRORED` are both informational by
design: a large repo's first mirror sync taking time, or a repo that
simply has no mirror yet, are both normal states, not incidents.

### Adapter abstraction — transport independence (added 2026-09-10)

Anh's own constraint, verbatim: *"GitLab native Pull Mirroring is
currently being used under the Ultimate Trial. Do not make Yana's
multi-forge architecture depend on this paid-tier capability."* The
design already happens to satisfy this, for a structural reason worth
naming explicitly: **the status checker never talks to whatever keeps
the mirror updated.** `check_forge_sync.py` only ever calls two things —
GitHub's public commits API and GitLab's public branches API — to read
each side's *current state*. It has no code path that knows or cares
*how* GitLab's copy got there. Whether that's GitLab's native Pull
Mirror (today, Ultimate-Trial-gated) or a future scheduled `git push
--mirror` job running in GitHub Actions (no paid feature required, just
a cron-triggered job with a GitLab deploy token), the comparison logic
is identical.

This is recorded as data, not just prose, in the manifest itself —
`forge-manifest.json`'s mirror entries carry a `sync_transport` object:

```json
"sync_transport": {
  "active": "gitlab-native-pull-mirror",
  "risk": "paid-tier dependent, currently Ultimate Trial",
  "fallback": "github-actions-scheduled-push-mirror (design only, not built)",
  "status_check_dependency": "none"
}
```

Swapping `active` for the fallback later — if the trial ends and anh
doesn't renew — is a manifest edit plus a new, small GitHub Actions job.
It does not touch `check_forge_sync.py`, the manifest schema's shape, or
this document's §3/§4 (source of truth, roles). That's the concrete
meaning of "provider-independent": the *status* layer and the *transport*
layer are two different things, and only the transport layer is allowed
to depend on which forge's paid features happen to be available this
month.

---

## 6. CI responsibility split (§4 of the brief)

Following the brief's own proposed split, adjusted against what this
repo's CI *actually* runs today (`.github/workflows/ci.yml`'s real job
matrix, not a guess):

| GitHub Actions (today, unchanged) | GitLab CI (proposed, not built) |
|---|---|
| `ci.yml` — CodeQL analyze (actions/js-ts/python/rust), Dependency Vulnerability Audit, Hook Tests, Kernel flock-v1, Rust Integration Tests, System Health Monitor (macOS/Ubuntu/Windows), Yana AI Self-Audit | Linux builds (redundant with GitHub's Ubuntu runner — intentional redundancy, not duplication for its own sake, per §4's "không nhất thiết chạy tất cả job hai lần" — pick a *subset*, e.g. security scanning only) |
| `desktop.yml` — macOS/Windows/Linux Electron builds | Additional dependency/security scanning (e.g. GitLab's built-in SAST/dependency-scanning templates, which this repo doesn't currently use anywhere) |
| `release.yml`/`publish.yml` — the actual crates.io/PyPI publish, gated on `.github/required-checks.json` | Backup validation — confirm the GitLab mirror actually received the tag/release before considering a release complete (a real gap today: nothing currently confirms the mirror caught up) |
| `herald.yml` — daily+tag-triggered drift detection (`check_counts.py`) | — |

**Explicit non-goal, per the brief's own §4:** this is not "run
everything twice." GitLab CI's job in this proposal is to cover things
GitHub Actions doesn't already do well (backup validation, a second
security-scanning opinion), plus stand ready to take over build/test
duties if GitHub Actions becomes unavailable — the failover path in
`DISASTER_RECOVERY.md`, not a permanent 2x cost.

---

## 7. Future self-hosted Git (§7 of the brief)

Not built now, per anh's own "hiện tại không cần xây self-host ngay nếu
không cần thiết." The one thing this document commits to now, so adding
`git.yana.link` later doesn't require restructuring: **the
`forge-manifest.json` schema (§3) already has an unbounded `mirrors`
list**, not a hardcoded `github`/`gitlab` pair — adding a third entry
(`"provider": "self-hosted", "url": "https://git.yana.link/..."`) is a
config addition, not a schema change. Same for `check_forge_sync.py`'s
status check in §5 — it iterates whatever's in the manifest, not two
hardcoded providers.

---

## 8. Security (§11 of the brief)

Audited actual secret usage in the current pipeline (`grep -o
"secrets\.[A-Z_]*"` across `publish.yml`/`release.yml`/`herald.yml`):
exactly two secrets exist today — `PYPI_TOKEN` and
`CARGO_REGISTRY_TOKEN`, both scoped to the `publish.yml` jobs that
actually run `python -m build`/`twine upload` and `cargo publish`.

**Least-privilege implication for this design:** since §6 above keeps
the actual crates.io/PyPI *publish* step on GitHub Actions (GitLab's
role is mirror/backup/extra-CI, not publishing), **neither
`PYPI_TOKEN` nor `CARGO_REGISTRY_TOKEN` needs to exist in GitLab CI
variables at all** under this proposal — smaller secret surface than a
naive "mirror everything including credentials" approach would have.
**Resolved 2026-09-10** (was flagged, not resolved, at the time this
section was first written): anh chose GitLab Pull Mirroring specifically
because `Yana-AI` is a **public** GitHub repo, so this design introduces
**zero new secrets, on either side**. GitLab's Pull Mirror fetches over
plain HTTPS from `https://github.com/yanacuti1121/Yana-AI.git` — a public
clone URL needs no credential at all. No GitHub PAT, no deploy key, no
GitLab CI variable, and nothing added to GitHub Actions' existing two
secrets (`PYPI_TOKEN`, `CARGO_REGISTRY_TOKEN`). See
`docs/GITLAB_MIRROR_SETUP.md` for the concrete GitLab-side steps.

No hardcoded tokens, PATs, deploy keys, or SSH private keys were found
anywhere in this repo's tracked files during this audit (consistent with
`core/rules/52-secrets-vault-law.md`'s existing policy, already
enforced).

---

## 9. Principles checklist (§13 of the brief)

| Principle | How this design satisfies it |
|---|---|
| No single point of failure | GitHub Actions failure doesn't block GitLab CI's independent jobs; GitLab mirror failure doesn't block GitHub's own operation |
| Provider independence | `forge-manifest.json` + `check_forge_sync.py` treat providers as data, not hardcoded branches in code |
| Canonical source of truth | Explicit `canonical_forge` field, one value, never two |
| Automated synchronization | GitLab's built-in Pull Mirror feature today (`sync_transport.active`), swappable per-mirror without a schema change (§5's adapter-abstraction note) |
| Observable synchronization | `check_forge_sync.py`, loud `OUT_OF_SYNC`/`ERROR` states — `PENDING`/`NOT_MIRRORED` distinguished as informational, not swept into the same bucket |
| Reversible migration | Promoting a mirror to canonical is a manifest edit — see `DISASTER_RECOVERY.md` |
| Minimal vendor lock-in | `upgrade.py`'s hardcoded GitHub API URL is the one piece of code that would need an actual code change (read `canonical_forge` from config instead) |
| Least privilege | §8 — no publish credentials leave GitHub |
| Disaster recoverability | See `DISASTER_RECOVERY.md` |
| Simple developer workflow | Unchanged: `git add / commit / push` |

---

## 10. What this document deliberately does NOT propose

Per the brief's own §8 and §13 ("đừng tạo complexity chỉ để nói rằng hệ
thống là multi-cloud"):

- No duplication of Issues/PRs/Discussions/comments/reactions between
  GitHub and GitLab — GitHub keeps the collaboration layer, full stop.
- No rewrite of `.github/workflows/*.yml` — they keep doing exactly what
  they do today.
- No new GitLab project provisioned by this document — that's an
  infrastructure decision for anh to make (GitLab.com vs self-managed,
  account/namespace choice) before any of §5-8 above can actually be
  implemented.
- No change to `src/connector.rs` (the GitHub notifications feature) —
  out of scope, as established in §1.

---

## Related

- `docs/DISASTER_RECOVERY.md` — failover/promotion procedures (§5 of the brief)
- `docs/website/ECOSYSTEM_AUDIT.md` — the real list of repos this manifest covers
- `core/rules/52-secrets-vault-law.md` — existing secret-handling policy this design stays inside
- `docs/programs/ADS-v1.md` — the process this document is Phase 0-1 of
