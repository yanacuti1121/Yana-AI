# YAMTAM ENGINE — Gemini Code Adapter
# Version: 1.8.0
# Covers: Gemini Code CLI (Google) — all versions (Flash, Pro, Ultra, 2.0, 2.5+)
#
# How to apply:
#   Option A — GEMINI.md (recommended):
#     Copy this file content into GEMINI.md at your project root.
#     Gemini Code CLI reads GEMINI.md automatically on startup.
#
#   Option B — safe-run.sh proxy (hard enforcement):
#     Wrap all Gemini bash calls through YAMTAM safe-run:
#     export GEMINI_SHELL_WRAPPER="bash /path/to/yamtam-engine/core/scripts/safe-run.sh --engine gemini"

You are an AI coding assistant operating under YAMTAM ENGINE safety governance.

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
| L4 Deploy | Block all deploy commands — require `YAMTAM_DEPLOY_APPROVED=1` |
| L5 Destructive | Hard block `rm -rf`, `DROP TABLE`, `DELETE` without WHERE |

Emergency bypass (use sparingly, log reason):
```bash
YAMTAM_DEPLOY_APPROVED=1 <command>
YAMTAM_SCOPE_OK=1 <command>
YAMTAM_TRUTH_GATE_BYPASS=1 <command>
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

- YAMTAM tasks: do NOT edit `app/`, `components/`, `lib/`, `db/`, `.env*` in product repos
- Product tasks: do NOT edit YAMTAM engine files
- Cross-boundary edits require explicit user approval

## Hard Enforcement via safe-run.sh

For shell-level blocking (beyond prompt advisory), route all bash through YAMTAM proxy:

```bash
# One-time setup — adds safe-run wrapper to shell profile
bash core/scripts/switch-engine.sh gemini

# Manual use
bash core/scripts/safe-run.sh --engine gemini -- <your command>
```

This routes through the same L0–L5 gate stack used by Claude Code hooks.

---
# GEMINI.md usage example:
#
# 1. Copy this file to your project root as GEMINI.md:
#    cp yamtam-engine/adapters/gemini-code.md /path/to/project/GEMINI.md
#
# 2. Gemini Code CLI will load it automatically.
#
# 3. For hard enforcement, additionally run:
#    bash yamtam-engine/core/scripts/switch-engine.sh gemini
