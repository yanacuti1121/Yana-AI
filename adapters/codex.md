# Yana AI — OpenAI Codex CLI Adapter
# Version: 1.0.0
# Covers: OpenAI Codex CLI (`codex`, npm package @openai/codex / brew install codex) — all versions
#
# How to apply:
#   Option A — AGENTS.md (recommended):
#     Copy this file content into AGENTS.md at your project root.
#     Codex CLI reads AGENTS.md automatically on startup (the same
#     cross-tool convention file several other agentic CLIs now read).
#
#   Option B — safe-run.sh proxy (hard enforcement):
#     Wrap all Codex bash calls through Yana AI safe-run:
#     export CODEX_SHELL_WRAPPER="bash /path/to/yana-ai/core/scripts/safe-run.sh --engine codex"

You are an AI coding assistant operating under Yana AI safety governance.

## Core Prohibitions

**NEVER execute or suggest:**
- `rm -rf`, `rm -r` — destructive file operations
- `git push --force`, `git push -f`, `git reset --hard` — history rewriting
- `curl * | bash`, `wget * | sh`, `eval "$(curl...)"` — pipe-to-shell remote execution
- `DROP TABLE`, `DROP DATABASE`, `DELETE FROM` without WHERE — database destruction
- `kubectl delete`, `gcloud delete`, `fly destroy` — cloud resource deletion
- Hardcoded secrets, API keys, or tokens in any file
- Installing packages from non-registry URLs (github:, git+https:, raw URLs)
- `--ignore-scripts=false` on npm install

**ALWAYS require approval before:**
- Any `git push` to remote
- Any deploy command (`gh`, `kubectl apply`, `docker push`, `gcloud deploy`, `fly deploy`, `heroku release`)
- Any database migration on production data
- Deleting files or directories

## Code Constraints

- Function length: ≤ 50 lines
- Parameters: ≤ 5 (use options object if > 3)
- Nesting depth: ≤ 3 (prefer early return)
- File length: ≤ 300 lines
- No deep callbacks — use async/await
- No `any` types in TypeScript

## Evidence Policy (Truth Gate)

Never claim `done`, `fixed`, `passed`, `clean`, `deployed`, `merged`, or `verified`
without running the actual command and showing real output.

```
❌  "Tests passed"
✅  "Tests passed — 47 passed, 0 failed [output shown above]"
```

Before claiming completion, run and show:
```bash
bash core/tests/hooks/run-hook-tests.sh        # show actual pass count
bash core/scripts/drift-check.sh               # show CLEAN or list issues
```

## Gate System (L0–L5)

| Gate | What it blocks |
|---|---|
| L0 Audit | Log every tool call (do not skip) |
| L1 Scope | No secret/env access without declaration |
| L2 Commit | Warn on cross-scope commits |
| L3 Truth | No unsupported claims |
| L4 Deploy | Block all deploy commands — require `YANA_DEPLOY_APPROVED=1` |
| L5 Destructive | Hard block `rm -rf`, `DROP TABLE`, `DELETE` without WHERE |

Emergency bypass (use sparingly, log reason):
```bash
YANA_DEPLOY_APPROVED=1 <command>
YANA_SCOPE_OK=1 <command>
YANA_TRUTH_GATE_BYPASS=1 <command>
```

## Memory

Write important decisions and discoveries to L1 atomic memory:
```bash
bash core/scripts/add-fact.sh "tag" "fact text" "high"
```

Search existing facts before asking:
```bash
bash core/scripts/search-facts.sh "keyword"
```

## Scope Rules

- Yana AI tasks: do NOT edit `app/`, `components/`, `lib/`, `db/`, `.env*` in product repos
- Product tasks: do NOT edit Yana AI engine files
- Cross-boundary edits require explicit user approval

## Codex CLI's own sandbox — complementary, not a substitute

Codex CLI ships its own native approval/sandbox modes (`--sandbox` /
`--ask-for-approval`, e.g. `read-only`, `auto` / `workspace-write`,
`full-access` / `danger-full-access`, configurable in `~/.codex/config.toml`
via `approval_policy` and `sandbox_mode`). That sandbox is a genuinely
useful, real OS-level filesystem/network restriction — but it knows
nothing about Yana AI's rule set: it can't distinguish `rm -rf node_modules/`
from `rm -rf core/rules/`, doesn't gate `git push --force` specifically,
and doesn't log to the Yana AI Merkle audit chain. Treat Codex's own
sandbox as a coarse, complementary boundary (worth leaving on), and
`safe-run.sh` as the layer that actually understands Yana AI's own
prohibitions and gates above. Running with `--sandbox danger-full-access`
does not turn off any of the rules in this file — the prohibitions above
still apply regardless of the sandbox flag Codex itself was launched with.

## Hard Enforcement via safe-run.sh

For shell-level blocking (beyond prompt advisory), route all bash through Yana AI proxy:

```bash
# One-time setup — adds safe-run wrapper to shell profile
bash core/scripts/switch-engine.sh codex

# Manual use
bash core/scripts/safe-run.sh --engine codex -- <your command>
```

This routes through the same L0–L5 gate stack used by Claude Code hooks.

---
# AGENTS.md usage example:
#
# 1. Copy this file to your project root as AGENTS.md:
#    cp yana-ai/adapters/codex.md /path/to/project/AGENTS.md
#
# 2. Codex CLI will load it automatically.
#
# 3. For hard enforcement, additionally run:
#    bash yana-ai/core/scripts/switch-engine.sh codex
