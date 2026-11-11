# Yana Terminal AI Workspace

A terminal-native, local-first AI workspace for developers.

This repository is currently an **UI/UX incubator** for the next Yana terminal experience. The current MVP uses mock data so the interaction model can be validated before connecting it back to `yana-rt` and the existing local-AI stack in `Yana-AI/tools/yana-web`.

## Current MVP

- Transcript-first interface
- Adaptive activity and plan sidebar
- Smart Scope overlay
- Plan overlay
- Keyboard-first composer
- Local runtime/model status
- High-contrast terminal theme
- SPDX copyright headers

## Run

```bash
cargo run
```

## Controls

| Key | Action |
|---|---|
| `Ctrl+S` | Open Smart Scope |
| `Ctrl+P` | Open Plan Tracker |
| `Tab` | Toggle sidebar |
| `Enter` | Submit mock prompt / close overlay |
| `Esc` | Close overlay / quit |
| `Ctrl+C` | Quit |

## Architecture boundary

The MVP intentionally implements only the terminal presentation layer and mock state:

```text
src/app/      interaction state and keyboard events
src/domain/   UI-facing data models
src/ui/       adaptive Ratatui rendering
reference/    legacy code for study only
```

Provider adapters, model downloads, runtime management, safety guards, and session storage will not be duplicated here. They will be connected later through a small bridge to the existing Yana systems.

## Project direction

- Local-first and privacy-first
- Scope before deep repository scanning
- Evidence for code claims
- Review before applying changes
- Capability-based model support
- Terminal-native rather than a GUI drawn with characters

## Authorship

Original concept, product direction, architecture, and interaction design by **Vũ Văn Tâm**.

AI tools may assist with implementation, testing, documentation, and review. Accepted changes remain under maintainer control.

Licensed under Apache-2.0.

## UI engine surface

The terminal now exposes fourteen deliberately UI-facing engines:

1. Chat
2. Composer
3. Render
4. Layout
5. Workflow
6. Provider
7. Session
8. Storage
9. Search
10. Command
11. Context View
12. Attachment
13. Notification
14. Theme

These engines coordinate terminal state and mock interaction only. They do not replace Yana Core, execute shell commands, mutate the workspace, or persist credentials.

### MVP commands

```text
/help
/engines
/clear
/new
/provider [name]
/search <text>
/attach <workspace-relative-path>
/theme
/render
/save
```
