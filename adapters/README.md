# Yana AI — Cross-Engine Adapters

Yana AI runs on Claude Code natively. These adapters let you apply Yana AI governance to other AI coding assistants.

| Engine | Adapter file | How to apply |
|---|---|---|
| **Claude Code** | _(native — no adapter needed)_ | Drop into `.claude/` via release zip |
| **Cursor** | `.cursorrules` (root) + `.cursor/rules/*.mdc` + real `beforeShellExecution` hook | Already at repo root — Cursor picks up automatically |
| **OpenAI Codex CLI** | `AGENTS.md` + `.codex/` + `.agents/skills/` | `yana-ai install --engine codex` — synchronizes all canonical agents, skills, commands, and hooks without npm |
| **Google Antigravity** | `adapters/antigravity.md` | `bash core/scripts/switch-engine.sh antigravity` or `yana-ai install --engine antigravity`: writes `.agents/rules/yana-ai.md` and a `PreToolUse` hook in `.agents/hooks.json` |

---

## Quick Switch

```bash
# Switch active engine config
bash core/scripts/switch-engine.sh <engine>

# Examples:
bash core/scripts/switch-engine.sh cursor       # real beforeShellExecution hook + .cursorrules
bash core/scripts/switch-engine.sh codex        # syncs agents, skills, commands, and hooks
bash core/scripts/switch-engine.sh antigravity  # .agents/rules/yana-ai.md + PreToolUse hook in .agents/hooks.json
bash core/scripts/switch-engine.sh claude       # default — no adapter needed
bash core/scripts/switch-engine.sh status       # show which adapters are currently active
```

---

## What's Mapped Across All Adapters

| Yana AI Rule | Claude Code | Cursor | Codex | Antigravity |
|---|---|---|---|---|
| Security prohibitions | hooks (L0-L5) | `.cursorrules` + real hook | `.codex/hooks.json` | `.agents/rules/yana-ai.md` + real hook |
| Code constraints (50 lines, 5 params) | `agent-code-constraints.md` | `.mdc` rule | `AGENTS.md` | `.agents/rules/yana-ai.md` |
| Evidence-first policy | truth-gate-guard.sh | `.cursorrules` | Codex Stop hook | `.agents/rules/yana-ai.md` |
| Git push gate | `git-push-enforcement.md` | `.cursorrules` | Codex PreToolUse hook | `.agents/rules/yana-ai.md` + real hook (force-push) |
| Hard shell enforcement | hooks | real `beforeShellExecution` hook | project-scoped Codex hooks | real `PreToolUse` hook on `run_command` |

---

## Limitations

- **Claude Code**: full enforcement via hooks (runtime blocking, every tool call in the Merkle audit chain).
- **Cursor**: real enforcement as of `.cursor/hooks.json` + `.cursor/hooks/before-shell-execution.js` — every shell command is technically screened by `core/hooks/guard-destructive.sh` before Cursor executes it (a narrower pattern set than `safe-run.sh`'s prompt-based prefix — see the `.mdc` rule's own "Why" section for exactly what's covered vs not). MCP tool calls are a separate event this hook doesn't cover.
- **Codex**: project-scoped hooks, custom agents, and skills are synchronized from `core/`; review changed hooks before trusting them in a target project.
- The PyPI-installed path is `yana-ai install --engine codex`; the `switch-engine.sh` form is for source checkouts and invokes the same Python synchronizer.
- Claude `/name` commands map to Codex `$yana-command-name` skills because repository-scoped Codex custom prompts are deprecated; the workflow content remains shared and parity-tested.
- **Antigravity**: real enforcement through `.agents/hooks.json`. A `PreToolUse` hook (`core/adapters/antigravity/pre-tool-use.js`) screens every `run_command` with `guard-destructive.sh` and blocks every tool call while a Giám Thị halt lock or quarantine exists. Checked manually against agy 1.4.5 on 2026-10-22: `rm -rf` returned "tool call denied by pre-tool hook", and a hook that crashed also blocked the call. The automated suite exercises the adapter, not live Antigravity. Antigravity runs hook commands from inside `.agents/`, so hook paths are relative to it. Limits: `agy --dangerously-skip-permissions` skips hooks entirely; the hook needs Node and bash, and its behaviour when Node itself is missing is not verified; file-write tools are not screened; rules other than the shell guard in `.agents/rules/yana-ai.md` stay advisory.
- Cursor `.mdc` rules require Cursor ≥ 0.40. Older versions use `.cursorrules` only.
- `AGENTS.md` is a shared cross-tool convention file (several agentic CLIs beyond Codex read it), not an exclusively-Codex target. `switch-engine.sh codex` will not overwrite an existing `AGENTS.md`; it only generates one where none exists yet. If one already exists, merge the relevant sections of `adapters/codex.md` in by hand.
