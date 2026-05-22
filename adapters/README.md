# YAMTAM ENGINE — Cross-Engine Adapters

YAMTAM runs on Claude Code natively. These adapters let you apply YAMTAM governance to other AI coding assistants.

| Engine | Adapter file | How to apply |
|---|---|---|
| **Claude Code** | _(native — no adapter needed)_ | Drop into `.claude/` via release zip |
| **Cursor** | `.cursorrules` (root) + `.cursor/rules/*.mdc` | Already at repo root — Cursor picks up automatically |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Copilot reads this file automatically in VS Code |
| **Aider** | `adapters/aider.md` | `aider --system-prompt adapters/aider.md` |
| **Windsurf** | `adapters/aider.md` (compatible format) | Add to Windsurf system prompt settings |

---

## Quick Switch

```bash
# Switch active engine config
bash core/scripts/switch-engine.sh <engine>

# Examples:
bash core/scripts/switch-engine.sh cursor     # activates .cursorrules
bash core/scripts/switch-engine.sh copilot    # activates .github/copilot-instructions.md
bash core/scripts/switch-engine.sh aider      # prints aider CLI command
bash core/scripts/switch-engine.sh claude     # default — no adapter needed
```

---

## What's Mapped Across All Adapters

| YAMTAM Rule | Claude Code | Cursor | Copilot | Aider |
|---|---|---|---|---|
| Security prohibitions | hooks (L0-L5) | `.cursorrules` | `copilot-instructions.md` | system prompt |
| Code constraints (50 lines, 5 params) | `agent-code-constraints.md` | `.mdc` rule | instructions | system prompt |
| Evidence-first policy | truth-gate-guard.sh | `.cursorrules` | instructions | system prompt |
| Git push gate | `git-push-enforcement.md` | `.cursorrules` | instructions | system prompt |
| UI/color rules | `color-rules.md` | `.mdc` rule | instructions | system prompt |

---

## Limitations

- Claude Code: full enforcement via hooks (runtime blocking). Other engines: **advisory only** — rules are in the prompt, not enforced at shell level.
- For hard runtime blocking on non-Claude engines, wrap commands with `bash core/scripts/safe-run.sh`.
- Cursor `.mdc` rules require Cursor ≥ 0.40. Older versions use `.cursorrules` only.
