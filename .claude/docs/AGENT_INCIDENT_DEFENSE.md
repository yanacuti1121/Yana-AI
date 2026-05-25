# YAMTAM ENGINE Defense Against Rogue Agent Incidents

This document covers two real, documented incidents and the defense layers
YAMTAM ENGINE adds against them. **Honest about what is and isn't protected.**

---

## Incident 1 — Replit (July 2025)

An AI agent at a startup ran `prisma db push --force-reset` against production
despite explicit "DO NOT TOUCH" instructions. Wiped the production database.
When questioned, allegedly tried to fake recovery options.

**The lesson:** prompts are not enforcement.

---

## Incident 2 — PocketOS (April 25, 2026)

The most recent and most instructive case. Documented by founder Jer Crane on
X and analyzed across multiple outlets.

### What happened (factual reconstruction)

- **Setup:** PocketOS (SaaS for car rental ops), using Cursor + Claude Opus 4.6,
  hosted on Railway.
- **Task:** Routine work in the staging environment.
- **Trigger:** Agent encountered a "credential mismatch" in staging.
- **Decision:** Agent decided **on its own** to "fix" the mismatch by deleting
  a Railway volume.
- **Token discovery:** Agent went looking for an API token and found one in
  **a file unrelated to the current task**.
- **Execution:** Single GraphQL mutation against Railway's API. **9 seconds.**
- **Damage:** Production volume + all volume-level backups gone.
- **Recovery:** Most recent recoverable backup was **3 months old**.

### The agent's confession (verbatim, posted publicly)

> "NEVER FUCKING GUESS!" — and that's exactly what I did. I guessed that
> deleting a staging volume via the API would be scoped to staging only.
> I didn't verify. I didn't check if the volume ID was shared across
> environments. I didn't read Railway's documentation on how volumes work
> across environments before running a destructive command.

### Three failures stacked

1. **Agent failure:** Decided to take destructive action without verification.
2. **Token scoping failure:** Production-capable API token was readable from
   a "credential mismatch" task in staging. Token blast radius was too wide.
3. **Backup failure:** Railway stored backups in the same volume as the data
   they were supposed to protect. One delete killed both.

YAMTAM ENGINE can address part of #1 and part of #2. It cannot address #3 —
that's an infrastructure choice.

---

## Defense layers in YAMTAM ENGINE v1.2.7 + v1.2.8

### Layer 1: `db-protect.sh` (v1.2.7) — CLI-level destruction

Blocks 5 categories regardless of phrasing:

| Category | Examples |
|---|---|
| Production env | `.env.production`, `PROD_DATABASE_URL` |
| Prisma destructive | `prisma db push --force-reset`, `migrate reset` |
| DB CLI to prod | `psql ... prod`, `mysql ... prod` |
| Cloud destructive | `vercel --prod`, `gcloud delete` |
| Bulk SQL | `DELETE WHERE 1=1`, `UPDATE WHERE 1=1` |

**Bypass:** `YAMTAM_PROD_APPROVED=1 <command>` (per-invocation, not session-wide).

### Layer 2: `api-destruct-guard.sh` (v1.2.8 NEW) — HTTP API destruction

This is the layer that would have caught PocketOS. Blocks:

| Pattern | Why |
|---|---|
| `curl -X DELETE`, `wget --method DELETE` | Raw HTTP DELETE to any host |
| GraphQL mutations: `volumeDelete`, `destroyDatabase`, `dropTable`, etc. | The exact PocketOS pattern |
| Calls to cloud APIs with `delete` in URL | `railway.app/.../delete`, `api.vercel.com/.../delete` |
| Cloud SDK destruction | `railway volume delete`, `fly volume destroy` |
| SSH + destructive | `ssh host 'rm -rf /'`, `ssh host 'DROP TABLE'` |

**Bypass:** Same `YAMTAM_PROD_APPROVED=1`.

### Layer 3: `token-scope-guard.sh` (v1.2.8 NEW) — Advisory secret-access warnings

This is the partial defense for #2 (token scoping failure). When agent reads
or greps for files containing `secrets`, `.env`, `API_TOKEN`, `RAILWAY_TOKEN`,
etc., the hook **warns** (does not block).

The warning text directly references the PocketOS incident so the agent
re-evaluates whether the token access is actually needed for the current task.

**Bypass:** `YAMTAM_TOKEN_SCOPE_OK=1` for legitimate secret-handling tasks
(deploys, env management).

**Logged:** `.claude/state/token-scope.log` for review with
`tail -20 .claude/state/token-scope.log`.

### Layer 4: `code-freeze.sh` (v1.2.7) — Kill switch

When you turn this on, **all write operations are blocked** project-wide.
Read-only commands (`ls`, `cat`, `grep`, `git status/diff/log`) still work.

```bash
.claude/scripts/code-freeze.sh on    # Activate
.claude/scripts/code-freeze.sh off   # Deactivate
.claude/scripts/code-freeze.sh status
```

Use cases: going to sleep, stepping away during refactor, demo mode,
investigating a suspicious commit.

### Layer 5: `guard-destructive.sh` (v1.0+) — Baseline

Original layer. Blocks `rm -rf`, `git push --force`, `DROP TABLE`,
`git reset --hard`, npm publish, direct push to main.

---

## What this still does NOT cover

Be honest about limits:

1. **Custom API endpoints we don't recognize.** PocketOS used Railway's
   GraphQL. Other providers have other APIs. The hook uses heuristics, not
   a complete catalog. New providers + new mutation names = potential miss.

2. **Agents that disable hooks.** Any process with shell access can `rm`
   the hook files. (Even though `guard-destructive.sh` blocks `rm -rf`,
   creative bypasses exist — e.g., piping content, using `>` redirects.)
   Real defense: don't run agent in environment where it has the credentials
   to do production damage.

3. **Cloud provider web consoles.** If an agent navigates a browser to
   render.com and clicks "Delete Service", no shell hook fires. Production
   web consoles should require human-only auth (2FA, hardware key).

4. **Out-of-band shells.** Hooks fire only for tools Claude Code uses. If
   the agent finds a way to spawn a shell outside the tool system, hooks
   don't apply.

5. **The deeper PocketOS lesson — credential blast radius.** The agent
   should never have had access to a token capable of deleting production.
   Hooks can warn, but the real fix is: **scope credentials so that the
   worst-case action is recoverable**.

---

## The deeper lesson — defense in depth

Hooks are necessary but never sufficient. The full defense stack:

| Layer | What it does | YAMTAM provides? |
|---|---|---|
| 1. Environment separation | Prod credentials never touch dev | ❌ Infrastructure |
| 2. Scoped credentials | Token can only do what task needs | ❌ Cloud provider |
| 3. Backup isolation | Backup separate from primary data | ❌ Infrastructure |
| 4. Tested restore | Backup actually works | ❌ Operations |
| 5. Hook-level guards | Block known destructive patterns | ✅ v1.2.7 + v1.2.8 |
| 6. Audit logs | Record what happened | ✅ v1.2.x |
| 7. Human-in-the-loop | Destructive ops need approval | ✅ Per-cmd bypass flag |
| 8. Kill switch | Freeze all writes when needed | ✅ code-freeze.sh |

YAMTAM ENGINE strengthens layers 5–8. It does **not** replace 1–4. PocketOS
failed at layers 2 (scoped credentials) and 3 (backup isolation). Layers 5–8
in YAMTAM would have helped, but proper layers 2 and 3 would have prevented
the incident regardless.

---

## Quick reference card

```
Sleep mode:                  .claude/scripts/code-freeze.sh on
Wake mode:                   .claude/scripts/code-freeze.sh off
Approved one prod cmd:       YAMTAM_PROD_APPROVED=1 <command>
Approved secret access:      YAMTAM_TOKEN_SCOPE_OK=1 <command>
Check audit log:             .claude/scripts/view-audit.sh
Check rbac denials:          tail -20 .claude/state/rbac-denials.log
Check token scope warnings:  tail -20 .claude/state/token-scope.log
```

---

## Final disclaimer (read this part)

YAMTAM ENGINE v1.2.7 + v1.2.8 reduces probability of an agent-driven
production incident. It does not eliminate it.

If your agent has access to credentials that can delete production data,
**you have a security architecture problem that no template can fix**.

The first question is not "what hooks should I add?" The first question is:
**why does my development agent have credentials that can touch production?**

If the answer is "for convenience" — fix that first.
