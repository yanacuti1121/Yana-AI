# Yana AI — Cross-Engine Adapters

Yana AI runs on Claude Code natively. These adapters let you apply Yana AI governance to other AI coding assistants.

| Engine | Adapter file | How to apply |
|---|---|---|
| **Claude Code** | _(native — no adapter needed)_ | Drop into `.claude/` via release zip |
| **Cursor** | `.cursorrules` (root) + `.cursor/rules/*.mdc` + real `beforeShellExecution` hook | Already at repo root — Cursor picks up automatically |
| **OpenAI Codex CLI** | `adapters/codex.md` | Copy to `AGENTS.md` at project root (only where none exists yet — see note below) |
| **Google Antigravity** | `adapters/antigravity.md` | `bash core/scripts/switch-engine.sh antigravity` — copies to `.agent/rules/yana-ai.md` |

---

## Quick Switch

```bash
# Switch active engine config
bash core/scripts/switch-engine.sh <engine>

# Examples:
bash core/scripts/switch-engine.sh cursor       # real beforeShellExecution hook + .cursorrules
bash core/scripts/switch-engine.sh codex        # copies adapter to AGENTS.md (only if none exists yet)
bash core/scripts/switch-engine.sh antigravity  # copies adapter to .agent/rules/yana-ai.md
bash core/scripts/switch-engine.sh claude       # default — no adapter needed
bash core/scripts/switch-engine.sh status       # show which adapters are currently active
```

---

## What's Mapped Across All Adapters

| Yana AI Rule | Claude Code | Cursor | Codex | Antigravity |
|---|---|---|---|---|
| Security prohibitions | hooks (L0-L5) | `.cursorrules` + real hook | `AGENTS.md` | `.agent/rules/yana-ai.md` |
| Code constraints (50 lines, 5 params) | `agent-code-constraints.md` | `.mdc` rule | `AGENTS.md` | `.agent/rules/yana-ai.md` |
| Evidence-first policy | truth-gate-guard.sh | `.cursorrules` | `AGENTS.md` | `.agent/rules/yana-ai.md` |
| Git push gate | `git-push-enforcement.md` | `.cursorrules` | `AGENTS.md` | `.agent/rules/yana-ai.md` |
| Hard shell enforcement | hooks | real `beforeShellExecution` hook | `safe-run.sh` prefix (advisory) | `safe-run.sh` prefix (advisory) |

---

## Limitations

- **Claude Code**: full enforcement via hooks (runtime blocking, every tool call in the Merkle audit chain).
- **Cursor**: real enforcement as of `.cursor/hooks.json` + `.cursor/hooks/before-shell-execution.js` — every shell command is technically screened by `core/hooks/guard-destructive.sh` before Cursor executes it (a narrower pattern set than `safe-run.sh`'s prompt-based prefix — see the `.mdc` rule's own "Why" section for exactly what's covered vs not). MCP tool calls are a separate event this hook doesn't cover.
- **Codex, Antigravity**: advisory only — rules are in the prompt (`AGENTS.md` / `.agent/rules/yana-ai.md`), not enforced at shell level. For hard runtime blocking, wrap commands with `bash core/scripts/safe-run.sh`.
- Cursor `.mdc` rules require Cursor ≥ 0.40. Older versions use `.cursorrules` only.
- `AGENTS.md` is a shared cross-tool convention file (several agentic CLIs beyond Codex read it), not an exclusively-Codex target. `switch-engine.sh codex` will not overwrite an existing `AGENTS.md`; it only generates one where none exists yet. If one already exists, merge the relevant sections of `adapters/codex.md` in by hand.
