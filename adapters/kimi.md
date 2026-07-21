# Yana AI — Kimi Code CLI Adapter
# Usage: bash core/scripts/switch-engine.sh kimi
# Or manually: copy the [[hooks]] block below into ~/.kimi-code/config.toml
# Sources verified 2026-07-18: platform.kimi.ai/docs/api/overview,
# moonshotai.github.io/kimi-code/en/customization/hooks,
# github.com/MoonshotAI/kimi-code

Unlike most engines in this adapter set, Kimi Code CLI has **real runtime
enforcement**, not just a system-prompt convention. It uses the same hook
contract as Claude Code's own hooks — `exit 0` allow, `exit 2` block,
JSON `hookSpecificOutput.permissionDecision` for the richer form — so
Yana AI's existing `safe-run.sh` blacklist/warn-pattern logic applies
directly through a thin translation layer
(`core/scripts/kimi-hook-adapter.sh`), instead of asking the model to
self-police via prose the way the cursor/windsurf/gemini adapters do.

## What `switch-engine.sh kimi` actually does

Writes a `[[hooks]]` entry into `~/.kimi-code/config.toml` (global,
**outside this project** — asks for confirmation first, since every
other engine here only writes inside the repo):

```toml
# yana-ai-managed-hook-start
[[hooks]]
event = "PreToolUse"
matcher = "Shell"
command = "bash <this-repo>/core/scripts/kimi-hook-adapter.sh"
timeout = 10
# yana-ai-managed-hook-end
```

The marker comments make re-runs idempotent — running the command again
updates the block in place instead of duplicating it.

## What the hook actually blocks

Same blacklist as every other Yana AI-governed engine (`safe-run.sh`,
shared logic, not reimplemented per-engine):

- `rm -rf`, `git push --force`, `git reset --hard` — destructive/history-rewriting
- `curl * | bash`, pipe-to-interpreter, base64-decode-and-pipe — evasion patterns
- `DROP TABLE`/`DROP DATABASE` — database destruction
- `LD_PRELOAD=`, `NODE_OPTIONS=--require` — injection via env hijack
- Elevated-risk commands (`git push`, `npm install`, `docker run`, ...) —
  hard-blocked outright in Kimi's non-interactive hook context (no `/dev/tty`
  to prompt through), unlike Claude Code's own interactive confirm

## Code constraints (context for the model, not hook-enforced)

- Function length: ≤ 50 lines
- Parameters: ≤ 5 (options object if > 3)
- Nesting depth: ≤ 3 (early return to flatten)
- File length: ≤ 300 lines

## Evidence policy

Never claim "done", "fixed", or "passing" without running the actual
command and showing its output.

## AGENTS.md

Kimi Code CLI also reads `AGENTS.md` (hierarchical: `~/.agents/AGENTS.md`
global, root `AGENTS.md`, nearest-subdirectory `AGENTS.md` for
directory-specific rules) — this repo's root `AGENTS.md` already covers
the broader operating manual; the hook above is what actually blocks
commands, this file and `AGENTS.md` are context, not enforcement.
