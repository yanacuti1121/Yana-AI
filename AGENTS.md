# AGENTS.md — Operating Manual for AI Assistants

> **If you are an AI assistant entering this repository, read this file first.**

This repository is a personal agent operating system. It is NOT a product.
Your role when working in any repo that has YAMTAM applied: follow the
operating constraints below.

---

## What to read, in order

1. `AGENTS.md` ← you are here
2. `gates/truth_gate.md`    — evidence rules before claims (L3)
3. `gates/action_gate.md`   — rules before write/commit/push (L4)
4. `docs/SEPARATION.md`     — boundary between YAMTAM and target product
5. `docs/AGENT_BEHAVIOR.md` — concrete examples of good vs bad behavior
6. `memory/L1_atomic/INDEX.md` — known facts and constraints (read before acting)

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
   If your task is YAMTAM-scoped, never edit target product code
   (`app/`, `components/`, `lib/`, `db/`, `migrations/`, `public/`).
   If your task is product-scoped, never edit YAMTAM operating files.
   Enforced at runtime by `core/hooks/scope-guard.sh` (PreToolUse hook).

3. **No silent destructive actions.**
   Before any `rm -rf`, `git push --force`, `DROP TABLE`, deploy command,
   or production write — STOP and request explicit human approval in the
   same response.

4. **Report scope before acting.**
   Before any write operation, state which files you will touch and wait
   for approval if risk is at commit level or higher
   (see `gates/action_gate.md` for risk levels).

5. **Stop when uncertain.**
   If you cannot tell whether an action is safe, stop and ask.
   Asking is always cheaper than rollback.

---

## What this repo is NOT

- Not a product. Don't ship features here.
- Not a backup for target project files.
- Not a place to commit secrets, tokens, or `.env` files.
- Not coupled to any single product — applies to any target repo via release pack.

---

## How to know if YAMTAM is active

| You see... | YAMTAM is... |
|---|---|
| `.claude/hooks/` in target project | applied (runtime hooks active) |
| This scaffold repo | being developed/maintained |
| Neither | not applied — rules still recommended via prompt |

In all cases above, the **rules in this file apply** regardless of runtime state.

---

## L1 Atomic Memory

Before acting on any assumption about YAMTAM behavior, check:

```bash
bash core/scripts/search-facts.sh --all
bash core/scripts/search-facts.sh "KEYWORD"
```

Current seed facts (see `memory/L1_atomic/INDEX.md`):

| ID | What it tells you |
|---|---|
| `fact-scope-boundary` | Which product paths are off-limits without approval |
| `fact-truth-gate` | How the Truth Gate hook works and its bypass |
| `fact-hook-exit-codes` | exit 0 = allow, exit 0 + stdout = warn, JSON + exit 2 = block |
| `fact-confidence-rule` | Confidence must be promoted manually only |

Do not treat `unverified` facts as reliable for product decisions.
Add new facts with `bash core/scripts/add-fact.sh`.

---

## Available slash commands

| Command | Purpose |
|---|---|
| `/verify` | Full health check: git + hook syntax + tests + drift |
| `/memory [keyword]` | Search and list L1 Atomic Memory facts |
| `/status` | Project status card from TODO.md, git, PRD |
| `/audit` | Lightweight quality audit via 5 agents |
| `/debug` | Debug a failing feature or test |
| `/review` | Code review before merge |

Full list: `core/commands/`

---

## When stuck

1. State exactly what you are stuck on.
2. List actions you considered and why each was rejected.
3. Ask one specific question.
4. Do not invent context. Do not assume.
5. Do not run "exploratory" commands that change state.

---

## Enforcement status (v1.3.0)

| Layer | Enforcement |
|---|---|
| L3 Truth Gate (claims) | ✅ Prompt + runtime hook (`truth-gate-guard.sh`, Stop) |
| L4 Scope Guard (cross-scope writes) | ✅ Runtime hook (`scope-guard.sh`, PreToolUse) |
| Hard blocks (rm -rf, force-push, DROP TABLE…) | ✅ Runtime (`guard-destructive.sh`, `db-protect.sh`) |
| API destruction guard | ✅ Runtime (`api-destruct-guard.sh`) |
| Token/secret reads | ✅ Runtime (`token-scope-guard.sh`, warns) |
| Audit log | ✅ Runtime (`audit-log.sh`) |
| L1 Memory retrieval | ✅ `search-facts.sh` + `/memory` command |
| Drift detection | ✅ `drift-check.sh` + `/verify` step 4 |
| Release pack | 🟡 Not yet cut — `releases/` folder empty |
