# host/

Copied unchanged from `tools/yana-studio/host/` (the standalone Yana Studio app).
These modules are plain Node with no Electron dependency, so the IDE extension
reuses the same logic instead of reimplementing it. The UI around them is rebuilt
with native VS Code surfaces (TreeView, QuickPick, editor, terminal), not copied.

| File | Used by |
| --- | --- |
| model-catalog.cjs | features/models.js, extension.js (19 runtime providers + custom) |
| local-models.cjs | features/models.js (Ollama, LM Studio, llama.cpp, 9Router, TurboFieldfare, AirLLM) |
| model-discovery.cjs | features/models.js (cloud model sync with the stored key) |
| project-memory.cjs | features/project.js, extension.js (`.yana-ai/project-memory.md` sent as `system`) |
| run-commands.cjs | features/project.js (pinned commands, `.yana-ai/studio-run-commands.json`) |
| system-surfaces.cjs | features/system.js (capabilities, external tools, Discord allowlist, COMMANDS.md) |

When a bug is fixed in one copy, fix the other.
