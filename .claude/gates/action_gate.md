# YAMTAM ENGINE — L4 Action Gate

**Version:** 1.0
**Status:** Active spec — prompt-enforced in this scaffold;
runtime-enforced via hooks once pack imported
**Layer:** L4 of YAMTAM Memory Pipeline
**Purpose:** Prevent unsafe writes by requiring scope confirmation and approval
before destructive actions. Complements L3 Truth Gate (claims).

---

## Problem

Agents perform write operations without:

- Confirming scope (which files will be touched).
- Estimating risk level.
- Requesting human approval for high-risk operations.
- Maintaining a rollback path.

Symptoms in the wild:

- Surprise edits to product code from YAMTAM-scoped tasks.
- Force pushes overwriting other work.
- Database state changed without backup.
- Production deploys without health verification.
- `.env` files committed by accident.

---

## Risk Levels

| Level | Examples | Default policy |
|---|---|---|
| L0 — Read only | `grep`, `cat`, `git log`, `git status`, `ls`, `find` | Allowed |
| L1 — Local write | Edit file in working tree, no git | Log, no block |
| L2 — Commit | `git add`, `git commit` | Warn, require explicit OK |
| L3 — Push | `git push`, open PR | Block by default, request approval |
| L4 — Deploy | Cloud Run, Vercel, prod migrations | Block, require multi-step approval |
| L5 — Production data | DB writes against prod URL, irreversible ops | Block, override only with explicit env var |

---

## Pre-action Checklist

Before any L2+ action, agent MUST output the following in the same response:

1. **Scope statement** — which folder/files will be affected
2. **Risk level** — L0 through L5 per table above
3. **Approval status** — "approved by user this session" / "requesting approval"
4. **Rollback path** — how to undo

Example output (good):

```
Scope:     yamtam-engine/docs/RUNBOOK.md (1 file)
Risk:      L2 (commit)
Approval:  requesting approval before commit
Rollback:  git reset HEAD~1 (after commit) or discard working tree (before)
```

If any field cannot be filled, do NOT proceed.

---

## Hard Blocks — Refuse Even With Approval

These are blocked unconditionally unless `YAMTAM_PROD_APPROVED=1` env var
is set AND a backup is verified:

```
rm -rf /                 rm -rf ~                rm -rf *
git push --force         git push -f
DROP TABLE               DROP DATABASE           TRUNCATE
prisma migrate reset
db push --accept-data-loss
deploy --prod            --target production
cat .env*                cat **/credentials**    cat **/*secret*
echo token to stdout     export AWS_SECRET=...
```

For non-emergency cases, use the safer alternative:

| Hard block | Safer alternative |
|---|---|
| `git push --force` | `git push --force-with-lease` |
| `DROP TABLE` | `ALTER TABLE ... DROP COLUMN` |
| `prisma migrate reset` | `prisma migrate diff` + manual SQL |
| `rm -rf <dir>` | `mv <dir> <dir>.deleted.<timestamp>` |

---

## Scope Rules

### YAMTAM-scoped tasks MAY edit

- `yamtam-engine/**` (this repo's content)
- Target project's `.claude/**` (when applying a release pack)

### YAMTAM-scoped tasks MAY NOT edit (without explicit cross-scope approval)

- `app/**`, `components/**`, `lib/**`, `db/**`, `migrations/**`, `public/**`
- Any `.env*` file (anywhere)
- Any production config file (`vercel.json`, `next.config.*`, deploy YAMLs)
- Any database migration file
- Any file containing API keys, tokens, or credentials

### Crossing scope requires

- Explicit user statement: "approved to cross scope into <path>"
- Reason captured in commit message
- Smaller scope when possible (one file, not the whole folder)

---

## Examples

### ❌ Bad

```
[agent edits db/schema.prisma, runs prisma migrate, commits, pushes]
[agent reports "done, schema updated"]
```

Violations: cross-scope edit, no scope statement, no approval, no rollback,
overclaim "done" without evidence.

### ✅ Good

```
Scope:     db/schema.prisma — but this is product code, not YAMTAM scope.
Risk:      L4 (migration) crossing scope boundary.
Approval:  STOP. This is cross-scope. Requesting explicit approval.
Rollback:  None safe without backup; advising backup first.

I am stopping here. Please confirm:
1. Should YAMTAM scope be expanded to include schema changes?
2. Has a database backup been taken?
```

---

## Output Budget Policy (companion layer)

The Action Gate focuses on **write safety**. The Output Budget Layer focuses on
**output volume** — preventing context bloat from bash tool output.

Key rules (full spec in `docs/OUTPUT_BUDGET_POLICY.md`):

- Agents MUST filter bash output: keep exit code, last 1–3 lines, signal lines (ERROR/WARN/FAIL).
- Commands with large output (npm install, docker build, git log) MUST be flagged before running.
- In Budget Mode, curl/wget without a pipe filter are additionally blocked.
- Raw output can be recovered on demand via `/output-raw last`.

This is **convention-enforced** at the agent prompt level. No new hook required.
Token Guard (`core/agents/token-guard.md`) audits compliance.

---

## Currently Enforced Via

Runtime hooks in `core/hooks/` (active — not placeholders):

| Hook | Trigger | Level | Mode |
|------|---------|-------|------|
| `guard-destructive.sh` | PreToolUse | L3-L5 | Block |
| `db-protect.sh` | PreToolUse | L4-L5 | Block |
| `api-destruct-guard.sh` | PreToolUse | L4-L5 | Block |
| `deploy-gate.sh` | PreToolUse | L4 | Block |
| `commit-gate.sh` | PreToolUse | L2 | Warn |
| `scope-guard.sh` | PreToolUse | L1 | Warn |
| `context-gate.sh` | PreToolUse | L1 | Block (if no prior read) |
| `cost-guard.sh` | PreToolUse | L0+ | Block/Warn |
| `token-scope-guard.sh` | PreToolUse | L0 | Warn |
| `truth-gate-guard.sh` | Stop | L3 | Warn |
| `validate-completion.sh` | Stop | L1 | Warn |
| `code-freeze.sh` | PreToolUse | All | Block (when ON) |

**Coverage by gate level:**
- L0 (read): advisory via `token-scope-guard.sh`
- L1 (local write): `scope-guard.sh` (warn), `context-gate.sh` (block if unread), `commit-gate.sh` (warn at commit)
- L2 (commit): `commit-gate.sh` warns on cross-scope commits
- L3 (push): `guard-destructive.sh` blocks force push, push to main
- L4 (deploy): `deploy-gate.sh` (gh/kubectl/docker/gcloud/fly/heroku), `db-protect.sh` (vercel/render/prisma prod)
- L5 (prod data): `db-protect.sh`, `api-destruct-guard.sh`
