# Yana AI Engine Parity

Yana AI owns capabilities in `core/`. Engine folders are generated adapters,
not independent implementations.

## Source of truth

| Capability | Canonical source |
|---|---|
| Instructions | `AGENTS.md` |
| Agents | `core/agents/*.md` |
| Skills | `core/skills/*/SKILL.md` |
| Commands | `core/commands/*.md` |
| Hooks | `.claude/settings.json` + `core/hooks/` |

The machine-readable contract lives in
`core/config/engine-capabilities.json`.

## Claude and Codex mapping

| Capability | Claude Code | Codex |
|---|---|---|
| Instructions | `AGENTS.md` | `AGENTS.md` |
| Agents | `.claude/agents/*.md` | `.codex/agents/*.toml` |
| Skills | `.claude/skills/*/SKILL.md` | `.agents/skills/*/SKILL.md` |
| Commands | `/name` | `$yana-command-name` |
| Hooks | `.claude/settings.json` | `.codex/hooks.json` |

Codex command adapters are skills because repository-scoped custom prompts are
deprecated. This changes invocation syntax, not the shared workflow content.

Claude `Agent|Task` hook behavior maps to Codex `SubagentStart` and
`SubagentStop`. Hook commands resolve from the git root so enforcement remains
active when Codex starts in a nested directory.

## Synchronize and verify

```bash
bash core/scripts/switch-engine.sh codex
node core/scripts/check-engine-parity.js
```

The parity check fails when either engine is missing shared instructions,
agents, skills, commands, or active hook scripts. It also fails when a generated
Codex command adapter is stale.

## Adding another engine

1. Add the engine mapping to `core/config/engine-capabilities.json`.
2. Generate adapters from `core/`; do not hand-maintain a second source.
3. Translate lifecycle events and payloads without weakening decisions.
4. Add a strict parity verifier and nested-directory enforcement test.
5. Mark platform-only limitations explicitly instead of claiming false parity.

Claude and Codex currently use strict parity verification. Cursor, Copilot,
Gemini, Aider, and the other adapters remain outside the strict parity contract
until they receive equivalent generators and tests.
