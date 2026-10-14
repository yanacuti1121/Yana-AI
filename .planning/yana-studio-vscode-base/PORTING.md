# Port Yana Studio (Electron) → Yana Studio IDE (Code-OSS)

## North star (anh, 2026-10-12)

Yana Studio is an end-to-end app: idea → design → code → run/test → track → govern →
ship, in one place, with AI at every step and Yana's human-approval gate across all of
them. Each item below is judged by which gap in that loop it closes.

| Step | In the IDE today | Gap |
|---|---|---|
| Idea, notes | Project Memory, Conversations | Continuity memory across conversations |
| Design | Design Canvas (AI-generated, live preview) | Manual element editing, image/sketch input |
| Design → code | — | Hand a chosen screen to the Yana chat to implement in the project, with approval |
| Write code | IDE editor + Yana chat | Diff review, diff comments, governed file edits |
| Run, test | Terminal, pinned commands, Tools | Tool/test findings in the Problems panel |
| Track work | Tasks with evidence | Dependencies, link tasks to conversations |
| Govern | Approval gate, Governance, leases, audit | Lease grant form |
| Models, cost | Models & Runtime, Usage | Auto model, Mixture of Agents |
| Ship | IDE Source Control | Packaging, signing, updates for Yana Studio itself |

Stability first (anh flagged it 2026-10-12): before more features, an end-to-end run with
a real model (chat + canvas), automated tests for the extension that run without
launching the app, and one app restart per batch of changes, announced beforehand.

Updated: 2026-10-11. Source of truth for what is left to port. Every row is checked
against `tools/yana-studio/host/main.cjs` IPC handlers (68 total), not against screenshots.

Rule for every row: logic comes from the old `host/*.cjs` (reuse when it is plain Node),
UI is rebuilt with native IDE surfaces (TreeView, QuickPick, editor, terminal, Settings
page) — never the old React UI pasted in. UI text is English only (ko/vi later).

## How to port (decided 2026-10-12)

Reuse the old React screens as they are. `tools/yana-ide/studio-web/bridge.ts` gives each
screen a `window.studio` that forwards calls to the extension (`features/studio-bridge.js`),
which answers with the old `host/*.cjs` logic. Add a screen = one entry file in
`studio-web/`, its bridge handlers, one entry in `features/studio-screens.js`, then
`scripts/build-studio-web.sh` + `prepare.sh`. Done: DesignCanvas; Settings (2026-10-12: old
Settings.tsx with Models & Orchestration incl. MoA + title model, Usage, Permissions, External Tools,
Yana Commands, Privacy & Data; Account/Appearance/Connections/backup hidden via new optional props;
`yana.settings.open` now opens it, the rewritten features/settings.js page is no longer registered).
Auto/MoA cannot drive the IDE chat yet (saveProfile rejects them). Next: Tasks, StudioHome.

## Status by IPC handler

| Area | Old handlers | IDE status |
|---|---|---|
| Files, folders, search, editor, save | openProject, openDroppedPath, recentProject, listFiles, searchFiles, readFile, readFileWindow, saveFile | Native IDE — nothing to port |
| Git read | gitStatus, gitDiff | Native IDE Source Control |
| Terminal | terminalCreate/Subscribe/Write/Resize/Ack/Close, saveLayout | Native IDE terminal |
| Models | discoverModels, inspectLocalModels, saveProfile, clearProviderKey, chooseRuntime | Ported (features/models.js, Settings → Models & Runtime) |
| Chat, single conversation | sendChat, stopChat, decideApproval | Ported (extension.js panel) |
| Tasks | taskList, taskCreate, taskDone, taskDrop | Ported (features/tasks.js) |
| Governance | leaseList, leaseRevoke, pendingApprovals | Ported (governance.js, Settings → Permissions) |
| Project memory, pinned commands | projectMemoryRead/Write, runCommandList/Create/Remove | Ported (features/project.js) |
| System, host | systemOverview, hostStatus | Ported (features/system.js, Settings → External Tools) |
| Usage, data | tokenUsage, dataOverview | Ported (features/usage.js, Settings → Usage / Privacy) |
| Multiple conversations | newChat, removeChat (+ store.cjs chats) | Ported 2026-10-11 (features/conversations.js, Conversations view, Markdown replies) |
| **Model orchestration** | previewAutoProfile, saveTitleModel, saveMixtureOfAgents, runMixtureOfAgentsPreset | **Not ported** (Auto model, auto titles, Mixture of Agents) |
| **Continuity memory** | continuityOverview, continuitySetSharing, continuityRetrieve | **Not ported** (needs node:sqlite in the IDE extension host) |
| Design Canvas | designCanvasLoad/Save/Suggest, scanDesignTokens | Phase A built 2026-10-11 (features/canvas.js, canvas-ai.js, media/canvas.*): Stitch-style generate/variant/refine/export with live preview. Not yet tested with a real model. Phase B (manual component editing) not started |
| **Diff comments** | diffCommentList/Create/Remove | **Not ported** (map to the IDE Comments API) |
| **Task dependencies, lease grant** | taskDepend, leaseGrant | **Not ported** |
| **Connections (OAuth)** | integrationList/ConfigureGithub/Connect/Cancel/Disconnect/Revoke | **Not ported** |
| **Backup** | exportPortableData, choosePortableData, importPortableData | **Not ported** |
| Account, onboarding | bootstrap, accountLock, accountLogout, savePreferences, completeOnboarding | Dropped on purpose: the IDE has no local account; onboarding replaced by IDE first-run |

Rough weight: by handler count ~55% is covered (ported + native). By user-visible work
the old chat UI (main.tsx, 2,447 lines) and Design Canvas (1,521 lines) are most of what
remains, which is why it feels like ~30%.

## Order (each step: port → verify in the dev build → report)

1. Conversations: DONE 2026-10-11 (auto title by model moves to step 3).
2. **Design Canvas, Stitch-style (anh's priority, decided 2026-10-11)** — see the section
   "Design Canvas target" below. Moved ahead of model orchestration.
3. Model orchestration: Auto model (resolveAutoProfile), title model, Mixture of Agents
   presets + run (mixture-of-agents.cjs, chat-turns.cjs runMoATurn).
3. Task dependencies + lease grant (small, both are existing yana-rt commands).
4. Diff comments on the IDE Comments API.
5. Task dependencies + lease grant (moved from 3).
6. Continuity memory (check node:sqlite availability in the Electron extension host first).
7. Backup export/import (excluding keys, tokens, runtime path — same contract as portable-data.cjs).
8. Connections (OAuth) — last, needs its own security review.

## Design Canvas target (Stitch-style, anh 2026-10-11)

What anh asked for: plug in any model, chat inside the canvas, and **watch the AI build the
screen live** while it writes — plus Stitch's strengths (whole screens from a prompt,
several variants, refine by chat, export to code). The old canvas only proposed small
JSON edits to hand-placed components and could not export code.

Phase A (first build):
- Custom editor for `*.yana-canvas.json` (opens as an editor tab). Document holds screens
  (name, device phone/desktop, html, prompt) and the canvas chat.
- Model picker inside the canvas (any of the 19 runtime providers + custom), stored per
  canvas, independent of the main chat model.
- Chat box: the prompt goes to `yana-rt chat --headless` with a design system prompt
  (Cockpit tokens or the project's own colors via design-tokens.cjs). The runtime runs
  in an EMPTY sandbox folder (extension globalStorage), as the old app did, so the model
  cannot read or change the project while designing.
- Live preview: streamed `text_delta` is parsed for the HTML as it arrives and rendered
  into a sandboxed iframe (`sandbox=""`, no scripts, no network), throttled to ~3 updates
  per second for the heat rule.
- "Another variant" generates a second screen from the same prompt (one at a time, not
  in parallel — heat rule). "Refine" sends the current HTML + the new instruction.
- Export: writes `<name>.html` where the user chooses (save dialog = explicit consent).
- No fake data: the design prompt tells the model to use placeholders that read as
  placeholders, never invented metrics.

Phase B (later): the old component canvas (22 kinds, layers, drag/resize, undo/redo) as
a manual edit mode on top of a generated screen; image/sketch input; export to the
project's framework (React/Tailwind) after detecting it.

## Performance rule (anh's Mac overheats easily)

No busy loops, no work per token or per animation frame, no tight polling. Streaming
re-render is throttled (120 ms), stored messages are capped (64 KB), the status bar
audit refresh runs every 60 s. Background probes (local model scan) only run when a
view is opened or refreshed, never on a timer. After each dev-build launch, check CPU
with `ps -Ao pid,pcpu,comm -r | head` and close test servers and extra instances.

## Upgrades learned from Hermes Agent (apply while porting, not as a separate rewrite)

- One provider catalog. Today it exists three times (Rust `src/model/catalog.rs`,
  old Studio `host/model-catalog.cjs`, IDE copy). Target: `yana-rt models --json`
  becomes the only source; the IDE reads it and keeps the JS copy only as an offline
  fallback. Needs a yana-rt release (1.5.0 has no `models` subcommand).
- Transport by API shape, not by vendor (OpenAI-compatible / Anthropic / Responses):
  check how `src/model/` is split before proposing changes.
- Cheap auxiliary model for small jobs (titles, summaries) separate from the main model:
  matches the old Studio title model; build it in step 2.
- Never mutate a conversation's system prompt mid-conversation (prompt cache): Project
  Memory is read once per conversation start, not re-read every turn.
- Narrow core, extend at the edges: new Yana features go in `features/<name>.js`, not in
  extension.js.
