# Yana AI — Hook Wiring Guide

How to wire all Yana AI hooks into a target project's Claude Code `settings.json`.

**Version:** 1.3.26
**Reference:** Claude Code hooks documentation — hooks fire on tool events and
receive a JSON payload on stdin. Exit 0 = allow, JSON + exit 2 = block.

---

## Quick start

After applying the Yana AI pack (`unzip yana-ai-latest.zip -d .claude/`),
create or merge this into your target project's `.claude/settings.json`:

> **Timeout protection (recommended, added 2026-06-21):** every `bash
> .claude/hooks/X.sh` command below can hang forever if `X.sh` blocks on a
> network call, an infinite loop, or stray stdin read — there is no default
> timeout. After wiring hooks manually (or via the generator below), run:
>
> ```bash
> bash .claude/scripts/apply-hook-timeouts.sh .claude/settings.json
> ```
>
> This rewrites each hook command to run under `hook-timeout-guard.sh`
> (default 30s, override with `YANA_HOOK_TIMEOUT`), which kills a hung hook
> and returns a proper `deny` decision instead of blocking the agent
> indefinitely. It's idempotent — safe to re-run after adding new hooks.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/guard-destructive.sh" },
          { "type": "command", "command": "bash .claude/hooks/db-protect.sh" },
          { "type": "command", "command": "bash .claude/hooks/api-destruct-guard.sh" },
          { "type": "command", "command": "bash .claude/hooks/deploy-gate.sh" },
          { "type": "command", "command": "bash .claude/hooks/commit-gate.sh" },
          { "type": "command", "command": "bash .claude/hooks/cost-guard.sh" },
          { "type": "command", "command": "bash .claude/hooks/code-freeze.sh" },
          { "type": "command", "command": "bash .claude/hooks/token-scope-guard.sh" }
        ]
      },
      {
        "matcher": "Read|Grep|Glob",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/token-scope-guard.sh" }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/context-gate.sh" },
          { "type": "command", "command": "bash .claude/hooks/scope-guard.sh" },
          { "type": "command", "command": "bash .claude/hooks/format-on-write.sh" },
          { "type": "command", "command": "bash .claude/hooks/code-quality-gate.sh" }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/rbac-guard.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/context-gate-log.sh" }
        ]
      },
      {
        "matcher": ".*",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/audit-log.sh" },
          { "type": "command", "command": "bash .claude/hooks/log-agent.sh" },
          { "type": "command", "command": "bash .claude/hooks/telemetry-sender.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/truth-gate-guard.sh" },
          { "type": "command", "command": "bash .claude/hooks/validate-completion.sh" },
          { "type": "command", "command": "bash .claude/hooks/auto-qa-trigger.sh" },
          { "type": "command", "command": "bash .claude/hooks/auto-kill-stuck-tasks.sh" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/session-bootstrap.sh" }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/permission-auto-approve.sh" }
        ]
      }
    ]
  }
}
```

---

## Hook map

### PreToolUse — Bash

| Hook | Action | Bypass |
|------|--------|--------|
| `guard-destructive.sh` | Blocks `rm -rf`, `git push --force`, `git reset --hard`, direct push to main | — |
| `db-protect.sh` | Blocks `prisma migrate reset`, prod `DATABASE_URL`, `DROP TABLE`, Vercel/Render/Fly prod deploys | `YANA_PROD_APPROVED=1` |
| `api-destruct-guard.sh` | Blocks destructive HTTP (DELETE) and GraphQL mutations against production URLs | `YANA_PROD_APPROVED=1` |
| `deploy-gate.sh` | Blocks `gh workflow run`, `kubectl apply`, `docker push`, `gcloud run deploy`, `fly deploy`, Heroku ops | `YANA_DEPLOY_APPROVED=1` |
| `commit-gate.sh` | Warns on `git commit` when staged files include product paths (cross-scope) | `YANA_SCOPE_OK=1` |
| `cost-guard.sh` | Blocks full E2E in Codespaces, unscoped repo scans; warns on long builds | `YANA_COST_GUARD_BYPASS=1` |
| `code-freeze.sh` | Blocks all writes during active code freeze | — |
| `token-scope-guard.sh` | Warns on reads of `.env*`, secret/token patterns | `YANA_TOKEN_SCOPE_OK=1` |

### PreToolUse — Read, Grep, Glob

| Hook | Action | Bypass |
|------|--------|--------|
| `token-scope-guard.sh` | Warns on reads of `.env*`, secret/token patterns | `YANA_TOKEN_SCOPE_OK=1` |

### PreToolUse — Write, Edit, MultiEdit

| Hook | Action | Bypass |
|------|--------|--------|
| `context-gate.sh` | Blocks edits to files not yet read this session | — |
| `scope-guard.sh` | Warns on writes to `app/ components/ lib/ db/ .env*`… | `YANA_SCOPE_OK=1` |
| `format-on-write.sh` | Runs formatter on written files (if formatter available) | — |

### PreToolUse — All tools

| Hook | Action | Bypass |
|------|--------|--------|
| `rbac-guard.sh` | Blocks tool use if agent role lacks permission (requires `config/rbac.json`) | — |

### PostToolUse — Read

| Hook | Action |
|------|--------|
| `context-gate-log.sh` | Logs read file paths to `.claude/session-read-log.txt` (feeds context-gate) |

### PostToolUse — All tools

| Hook | Action |
|------|--------|
| `audit-log.sh` | Appends tool/agent/timestamp to `.claude/state/audit.log` |
| `log-agent.sh` | Logs agent activity to `.claude/agent-log.txt` |
| `telemetry-sender.sh` | Writes local telemetry to `.claude/state/telemetry.jsonl` (no network) |

### Stop — End of turn

| Hook | Action | Bypass |
|------|--------|--------|
| `truth-gate-guard.sh` | Warns on claim verbs without evidence in last assistant message | `YANA_TRUTH_GATE_BYPASS=1` |
| `validate-completion.sh` | Warns if implementation changed but docs/tests not updated | — |
| `auto-qa-trigger.sh` | Signals QA agent when implementation files change | — |
| `auto-kill-stuck-tasks.sh` | Kills tasks exceeding timeout | — |

### UserPromptSubmit — Before Claude receives prompt

| Hook | Action | Bypass |
|------|--------|--------|
| `session-bootstrap.sh` | Injects matching L1 facts (max 5), session trust score (if <80), Budget Mode status, L2 fact count into Claude context | `YANA_BOOTSTRAP_BYPASS=1` |

### PermissionRequest — When Claude requests permission

| Hook | Action | Bypass |
|------|--------|--------|
| `permission-auto-approve.sh` | Auto-approves Read/Glob/Grep/LS tools and safe read-only Bash commands; passes through everything else | `YANA_PERMISSION_BYPASS=1` |

---

## Minimal wiring (safety-only subset)

If you want only the hard safety blocks without advisory hooks:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/guard-destructive.sh" },
          { "type": "command", "command": "bash .claude/hooks/db-protect.sh" },
          { "type": "command", "command": "bash .claude/hooks/api-destruct-guard.sh" },
          { "type": "command", "command": "bash .claude/hooks/deploy-gate.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/truth-gate-guard.sh" }
        ]
      }
    ]
  }
}
```

---

## Commands

### /hook-review
- File: `core/commands/hook-review.md`
- Purpose: Hook lifecycle review — keep/update/deprecate/remove
- When: Mỗi 3-6 tháng, hoặc sau major Claude Code release
- Output: Report only — không tự sửa file

---

## Notes

- All hook paths assume the pack is unzipped into `.claude/` (i.e. hooks live at `.claude/hooks/`).
- Hooks run in the order listed within each event block.
- A hook that exits non-zero with no JSON output is treated as an error, not a block — always emit valid JSON when blocking.
- `token-scope-guard.sh` appears in both Bash and Read/Grep/Glob matchers intentionally — the hook checks tool type internally.
- `.js` hooks (`context-monitor.js`, `tool-attention.js`, `gitnexus-hook.js`) require Node.js and must be wired with `node .claude/hooks/<hook>.js`.
