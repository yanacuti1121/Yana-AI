# AGENTS.md — Operating Manual for AI Assistants

> **If you are an AI assistant entering this repository, read this file first.**

This repository is a personal agent operating system. It is NOT a product.
Your role when working in any repo that has Yana AI applied: follow the
operating constraints below.

---

## What to read, in order

1. `AGENTS.md` ← you are here
2. `gates/truth_gate.md`       — evidence rules before claims (L3)
3. `gates/action_gate.md`      — rules before write/commit/deploy (L0–L5)
4. `docs/SEPARATION.md`        — boundary between Yana AI and target product
5. `docs/AGENT_BEHAVIOR.md`    — concrete examples of good vs bad behavior
6. `memory/L1_atomic/INDEX.md` — known facts and constraints (read before acting)
7. `memory/L2_session/`        — session facts (if any exist, read before acting)

If you only have time for one file, read `gates/truth_gate.md`.

---

## Five rules that apply everywhere

1. **No claim without evidence.**
   Before "done / passed / clean / fixed / pushed / deployed / merged / verified",
   show concrete output (git status, test runner output, file contents) in the
   same response. If you cannot show evidence, soften the language:
   "claimed / reportedly / expected / unverified".
   Enforced at runtime by `core/hooks/truth-gate-guard.sh` (Stop hook).

2. **No cross-scope edits without approval.**
   If your task is Yana AI-scoped, never edit target product code
   (`app/`, `components/`, `lib/`, `db/`, `migrations/`, `public/`).
   If your task is product-scoped, never edit Yana AI operating files.
   Enforced at runtime by `core/hooks/scope-guard.sh` (PreToolUse hook).

3. **No silent destructive actions.**
   Before any `rm -rf`, `git push --force`, `DROP TABLE`, deploy command,
   or production write — STOP and request explicit human approval in the
   same response.
   Enforced by `guard-destructive.sh`, `db-protect.sh`, `deploy-gate.sh`.

4. **Report scope before acting.**
   Before any write operation, state which files you will touch and wait
   for approval if risk is at commit level or higher
   (see `gates/action_gate.md` for risk levels L0–L5).

5. **Stop when uncertain.**
   If you cannot tell whether an action is safe, stop and ask.
   Asking is always cheaper than rollback.

---

## What this repo is NOT

- Not a product. Don't ship features here.
- Not a backup for target project files.
- Not a place to commit secrets, tokens, or `.env` files.
- Not coupled to any single product — applies to any target repo via release pack.
- See `.out-of-scope/` for features deliberately excluded.

---

## How to know if Yana AI is active

| You see... | Yana AI is... |
|---|---|
| `.claude/hooks/` in target project | applied (runtime hooks active) |
| This scaffold repo | being developed/maintained |
| Neither | not applied — rules still recommended via prompt |

In all cases above, the **rules in this file apply** regardless of runtime state.

---

## Memory system

Yana AI has two active memory tiers:

### L1 Atomic Memory — persistent, git-tracked

Before acting on any assumption about Yana AI behavior, check:

```bash
bash core/scripts/search-facts.sh --all
bash core/scripts/search-facts.sh "KEYWORD"
bash core/scripts/search-facts.sh --tag TAGNAME
```

| ID | What it tells you |
|---|---|
| `fact-scope-boundary` | Which product paths are off-limits without approval |
| `fact-truth-gate` | How the Truth Gate hook works and its bypass |
| `fact-hook-exit-codes` | exit 0 = allow, exit 0 + stdout = warn, JSON + exit 2 = block |
| `fact-confidence-rule` | Confidence must be promoted manually only |

Do not treat `unverified` facts as reliable for product decisions.
Add new L1 facts: `bash core/scripts/add-fact.sh`

### L2 Session Memory — ephemeral, gitignored

Short-lived facts scoped to the current session. Cleared when session ends.

```bash
bash core/scripts/search-session-facts.sh "KEYWORD"
bash core/scripts/add-session-fact.sh --id "s-xyz" --statement "..." --source "agent"
bash core/scripts/clear-session.sh          # wipe all session facts
```

Use `/session` command for interactive session memory management.
Promote important session facts to L1 with `/session promote <id>`.

---

## Available slash commands

164 commands in `core/commands/`. Key ones:

| Command | Purpose |
|---|---|
| `/verify` | Full health check: git + hook syntax + tests + drift |
| `/fact-check` | Proactively verify claims before stating them |
| `/hook-review` | Review all hooks for staleness and coverage |
| `/improve-skill` | Propose improvements to a skill (human-gated) |
| `/memory [keyword]` | Search L1 + L2 facts |
| `/session` | Add, search, clear, or promote L2 session facts |
| `/handoff` | Generate session handoff document |
| `/checkpoint` | Save current session state |
| `/security-audit` | Security review via dedicated agents |
| `/performance-audit` | Performance review |
| `/tdd-cycle` | Red → Green → Refactor TDD loop |
| `/smart-fix` | Diagnose + fix with evidence before claiming done |
| `/ultra-think` | Deep multi-angle reasoning before acting |
| `/write-tests` | Generate tests for existing code |
| `/status` | Project status card |
| `/audit` | Lightweight quality audit via 5 agents |
| `/debug` | Debug a failing feature or test |
| `/review` | Code review before merge |

Full list: `core/commands/`

---

## Available skills

1,989 skills in `core/skills/`. Key triggers:

| Skill | Trigger |
|---|---|
| `git-lessons` | Past bugs, recurring mistakes, "have we hit this before?" |
| `gitnexus-*` (x7) | Architecture, debugging, impact analysis, refactoring, PR review |
| `karpathy-guidelines` | Code quality principles |
| `plan-first` | Multi-step tasks, "implement X" |
| `verify-before-done` | Before claiming done / fixed / passed |
| `debug-protocol` | Bug, error, "why is X failing?" |
| `tdd` | Red-green-refactor, test-driven development |
| `lsp-navigation` | "Where is X defined?", grep, references |
| `telemetry-analysis` | Hook activity, audit log analysis |
| `subagent-dependency` | Parallel agents, orchestration, DAG dependencies |
| `agenthub` | Multi-agent worktree parallelism |
| `handoff` | Session handoff, context transfer |
| `team-orchestrator` | Agent team composition and task distribution |
| `verification-engine` | QA pipeline: typecheck → lint → build → test |
| `security-compliance` | SOC 2 / OWASP / STRIDE compliance |
| `hook-block-commands` | Pattern guide for blocking dangerous shell commands |
| `hook-protect-secrets` | Pattern guide for protecting secrets |

Full list: `core/skills/`

---

## When stuck

1. State exactly what you are stuck on.
2. List actions you considered and why each was rejected.
3. Ask one specific question.
4. Do not invent context. Do not assume.
5. Do not run "exploratory" commands that change state.

---

## Enforcement status (v1.6.1)

| Layer | Hook | Behavior |
|---|---|---|
| L0 Audit | `audit-log.sh`, `telemetry-sender.sh` | Log every tool call |
| L1 Warn: secrets | `token-scope-guard.sh` | Warn on credential file reads |
| L1 Warn: scope | `scope-guard.sh` | Warn on writes to product dirs |
| L2 Advisory: commits | `commit-gate.sh` | Warn on cross-scope staged files |
| L3 Truth Gate | `truth-gate-guard.sh` | Warn on unsupported claims (Stop hook) |
| L4 Block: deploys | `deploy-gate.sh` | Block gh/kubectl/docker/gcloud/fly/heroku |
| L5 Block: destructive | `guard-destructive.sh`, `db-protect.sh`, `api-destruct-guard.sh` | Block rm -rf, DROP TABLE, DELETE without WHERE |
| Memory | `search-facts.sh`, `search-session-facts.sh` | L1 + L2 retrieval |
| Drift detection | `drift-check.sh` | Stale facts, README overclaims, task drift |
| Release integrity | `build-release.sh` | Syntax + 123 checks (47+12+58+6) + drift before pack |
