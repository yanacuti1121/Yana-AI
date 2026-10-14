# Design brief for Stitch: Yana Studio IDE

Paste this whole file into Stitch. It describes what Yana Studio already is today, what
data each surface really has, and which screens still need a design.

## 1. What the product is

Yana Studio is a desktop IDE built on Code-OSS (the open-source VS Code, version 1.141).
Almost everything from VS Code stays: editor, file explorer, search, Source Control,
terminal, extensions, command palette. Yana adds an AI agent and its governance on top,
in the spirit of Cursor and Antigravity. The goal is an end-to-end app: idea → design →
code → run/test → track tasks → governance → ship, all in one place.

The AI never runs a shell command by itself. Every turn goes through the Yana runtime
(`yana-rt`, a local Rust binary started once per chat turn; it is not a background daemon
and opens no network port). Reading files is allowed. Running a command always stops and
waits for the human to approve it. This "human approval gate" is the core of the product
and must stay visible in the design.

Audience: software engineers who keep the IDE open all day. Dense, calm, precise.

## 2. Hard rules for every screen

- **It is VS Code.** Keep the VS Code window structure: title bar with command center,
  activity bar on the left, primary side bar, editor area with tabs, bottom panel
  (terminal/problems/output), secondary side bar on the right, status bar at the bottom.
  Do not draw a second title bar, fake macOS traffic lights or a fake File/Edit menu
  inside a page; the IDE already has them.
- **Only real data.** Every number on screen must come from yana-rt or the machine.
  When there is no data, design the empty state (what will appear here, why, and one
  action). Never use sample counts like "41 providers", "64 GB VRAM", "74.2 T/s",
  "21,066 tokens", a daemon PID or port, or agents that do not exist.
- **English UI only** for now (Korean and Vietnamese later, so leave ~30% room for text
  growth).
- **Text at least 12px.** Body 13–14px. Monospace for code, paths, model IDs and badges.
- **Design light and dark.** The IDE ships Yana Dark, Yana Light, Yana High Contrast and
  Yana High Contrast Light. Yana panels read their colors from the active theme.
- No glassmorphism, no gradient text, no fake progress bars, no decorative buttons that
  do nothing.
- Performance matters (the user's laptop overheats easily): no looping animations, no
  constantly moving elements. A single subtle "running" indicator is fine.

## 3. Palette and type (Yana Dark, from autonomous_runtime_cockpit/DESIGN.md)

| Token | Hex | Used for |
|---|---|---|
| Base | #0c0e12 | title bar, status bar, input fields |
| Editor | #12151c | editor, Yana Settings page |
| Panels | #161a22 | side bars, terminal, chat panel |
| Overlay | #1c212c | hovers, quick pick, selected rows |
| Border | #1e222b / #252a36 | 1px hairlines / focused borders |
| Text | #e2e2e8, muted #94a3b8 | |
| Accent (Yana) | #4f80ff, buttons #3461d6 | AI activity, primary actions, focus |
| Cyan | #00d2c4 | telemetry, model routing |
| ALLOW | #10b981 | permitted actions, healthy |
| APPROVAL | #f59e0b | waiting for a human |
| DENY | #ef4444 | blocked, errors |

Yana Light uses the same roles with darker accents (#2f5fd8) on #ffffff / #f5f6f8.
Radius: 0 for panels and tabs, 4px for buttons/inputs/badges, 6px for overlays.
Fonts: the IDE UI font for text, the editor font for monospace.

## 4. What exists today (design these to match reality)

### 4.1 Left side: the "Yana" activity bar view (native VS Code tree views)

Native VS Code trees: rows of 22px with an icon, a label, a grey description, inline
action icons on hover, and title-bar actions. Seven sections, top to bottom:

1. **Conversations**: saved chats for this project. Row: title (first 45 characters of
   the first message, renamable), "N turns · date". Actions: new, history, rename, delete.
2. **Models & Runtime**: active model row; group **Local AI** (9Router, Ollama, LM
   Studio, llama.cpp, TurboFieldfare, AirLLM, each "N models · 12 ms" when running or
   "offline"); group **Cloud** (13 providers: Claude, OpenAI, Gemini, Groq, DeepSeek,
   OpenRouter, xAI, Novita, NVIDIA, MiniMax, GLM, Hugging Face, Kimi; each shows "key ✓"
   or "no key"); group **Custom** (OpenAI-compatible endpoint + base URL). Total: 19
   runtime providers (13 cloud + 6 local) + 1 custom.
3. **Project**: "Project Memory" (a markdown file sent with every conversation, shows
   size or "empty · click to write"), **Pinned commands** (up to 9 named shell commands,
   run in their own terminal), and "New Design Canvas".
4. **Tasks**: grouped In progress / Open / Blocked / Done. Done requires evidence text.
5. **Governance**: Pending approvals, Capability leases (revocable), Audit summary of the
   last 500 tool calls by decision (allow/deny/warn) and by tool.
6. **Tools**: Doctor, Scan, Hunt, Score, Blast radius map, CI health, Cost; each runs in
   its own terminal.
7. **System** (collapsed): this machine (OS, CPU cores, memory, GPU, capabilities),
   runtime (yana-rt path, MCP yes/no, Discord yes/no), the 12 AI capabilities with risk
   level and approval rule, other AI tools on PATH (Claude Code, Codex, Cursor,
   Antigravity, Gemini CLI), COMMANDS.md reference (102 commands).

### 4.2 Right side: the "Yana AI" chat panel (secondary side bar, a webview)

- Header: logo, "RUNTIME v1.5.0" badge, buttons: history, new conversation, settings.
- Status row: "CONNECTED · LOCAL RUNTIME" or "RUNTIME NOT FOUND", workspace name,
  "RESTRICTED" when the folder is not trusted.
- Model row: provider + model button, KEY button.
- Mode row: Supervised (active). Auto and Plan-Only are shown disabled with the reason
  "this mode is not in the runtime yet".
- Conversation row: current conversation title.
- Feed, per turn: **Operator intent** card; **Agent trace** card (one row per tool call,
  chip CHECK → ALLOW → RUNNING → OK / FAIL / DENY / APPROVAL); **Reply** rendered as
  Markdown; **Human approval required** card (amber, capability such as `run_command`,
  command summary, reason, Approve / Deny, then APPROVED or DENIED); **Error** card.
- Composer: multi-line input, "Send ⌘↵", turns into "Stop ■" while running.
- Footer: runtime mode and real token count for this conversation.

### 4.3 Status bar items (left side)

"Yana Runtime v1.5.0" (opens Settings), "Policy: SUPERVISED [ALLOW: read · REQUIRE:
run]", "Audit 500✓ 0✕".

### 4.4 Yana Settings (opens as an editor tab, like VS Code's own Settings)

Header "Yana Studio Settings" and nine tabs: Account, Appearance, Models & Runtime (active
model card, local AI scan, runtime card, provider library of 20 cards with filters and
key actions, auxiliary models roadmap), Usage (real token records, empty until the first
chat), Connections (not built yet), Permissions (pending approvals, leases with Revoke),
External Tools (Discord, MCP, AI tools on PATH), Yana Commands (searchable COMMANDS.md),
Privacy & Data (sizes only).

## 5. What VS Code lets us change (design inside these limits)

| Area | Possible | Not possible without patching VS Code |
|---|---|---|
| Activity bar | Yana icon + views (trees) | Reordering VS Code's own icons |
| Side bars | Trees, webview panels | Custom drawing inside native trees |
| Editor area | Webview tabs (like Yana Settings), custom editors for a file type | |
| Status bar | Text + icon items, colored background for errors/warnings | Custom widgets |
| Title bar | Command center search | Extra buttons like "Deploy"/"Fork" or a runtime pill (needs a VS Code source patch) |
| Quick pick / input box / notifications | Native look only | Custom styling |
| Colors | Everything through the theme | |

## 6. Screens to design next (not built yet)

Design each with real states: empty, loading, normal, error, and long content.

1. **Model orchestration**: "Auto" default model (which configured provider/model Auto
   resolves to and why); title model (main or a separate cheap model); **Mixture of
   Agents** presets (reference models + aggregator + fallbacks, enable/disable, "Test
   run" with a step log, selectable as a "model" in chat).
2. **Design Canvas**: the priority screen, described in section 7.
3. **Diff comments**: inline comments on lines of a diff (VS Code comment UI).
4. **Task dependencies**: blocks / related / parent-child / discovered-from; blocked state
   is computed by the runtime, never set by hand.
5. **Grant capability lease** form: subject, capability, allow/deny patterns, minutes
   (1–1440), optional invocation budget.
6. **Continuity memory**: what the runtime remembers across conversations, a sharing
   switch, and which sources were used for the current turn.
7. **Backup**: export / restore Yana state (never keys, tokens or the runtime path).
8. **Connections**: GitHub, Slack, Notion, Google sign-in flows and connected state.

## 7. Priority screen: Yana Design Canvas (design this first)

### Intent

Yana Studio has its own Stitch-like design tool built into the IDE. The difference from
Stitch: **any AI model can be plugged in**, the work happens **inside the developer's
project**, and the user **watches the AI build the screen live while it is writing**,
not only after it finishes, and can step in at any time.

### Where it lives

An **editor tab** for `<name>.yana-canvas.json` inside the project (for example
`design/onboarding.yana-canvas.json`), created with "Yana: New Design Canvas". Saving,
undo/redo and the unsaved dot work like any file. Design the tab content at about
1100×750 and at a narrow 800px width.

### Layout (current first build, improve it)

- **Left column (about 320px):** model picker (19 runtime providers + custom, model ID
  with suggestions, key button; each canvas remembers its own model), chat history of
  requests tagged New / Variant / Refine, Desktop (1280px) / Phone (390px) toggle,
  prompt box, Generate (or Refine when a screen is selected) and Stop, a status line
  ("Waiting for the model…", "Generating… 14 KB received", "Done", or a plain error).
- **Right area:** screen tabs (Screen 1, Variant 2… + "New screen"), toolbar for the
  selected screen (device and time, Another variant, Rename, Export HTML, Delete), and the
  stage with the preview scaled to fit.

### Moments to design

1. First open (empty canvas, one line of guidance, model picker obvious).
2. Live generation: preview fills in progressively; show the model, how much is written,
   and Stop. Calm motion, refresh a few times per second at most, no full-screen
   spinners or shimmering skeletons.
3. Done: new screen selected; next actions refine, variant, export.
4. Refine: make it obvious the next message edits the selected screen.
5. Compare 2–3 variants side by side and pick one.
6. Errors: no API key (with Add key), no design returned, the model tried to use a tool,
   runtime missing.
7. Export to an HTML file the user chooses; later export to the project's framework.

### Canvas rules

- The AI only designs, in an isolated empty folder; it cannot read or change project
  files. Writing into the project (export) always needs the user's own click.
- Generated screens never show invented data; they use generic placeholders.
- Project colors when the project has CSS color variables, otherwise the Cockpit palette.
- Preview is static: no scripts, no network.
- One generation at a time (heat rule).

### Later

Manual edit mode on generated screens (select, move, resize, color, radius, text; the old
Yana Studio had 22 component types, layers and alignment); image or sketch input; hand a
selected screen to the Yana chat to implement in code, with approval.

## 8. Out of scope

Mobile companion, VTuber overlay, voice, vector databases, HTML templates, a cloud
account, multi-agent "swarms" running in parallel, and hardware telemetry dashboards. Do
not design these.
