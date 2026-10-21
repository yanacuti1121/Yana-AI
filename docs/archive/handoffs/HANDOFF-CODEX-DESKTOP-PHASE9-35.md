# TASK FOR CODEX — Yana Desktop new-app, Phases 9-35

You are working in the repo at `/Users/vutam/Yana-AI`, branch
`feat/desktop-new-app-shell`. Read this entire document before touching
anything. Phases 1-8 are DONE and committed on this branch (commits
`029117b4` and `22f49fe5`) by a previous session (Claude) — you are
continuing from Phase 9 onward, not starting over.

## Why this document is careful about "done" claims

An earlier handoff for a different feature (Capability Lease) told a
prior session to build something "from scratch" that had actually
already been fully implemented and committed weeks earlier — written from
a stale plan instead of the real repo state. Real cost, no benefit.
**Before starting ANY phase below, verify its current state yourself**
(`git log --oneline -20`, read the actual files named in "What already
exists" below) rather than trusting this document's claims blindly —
this document was accurate when written, but code moves faster than docs.

## Product definition

Yana Desktop is a **local-first AI workspace + control plane** — not a
chatbot, not a terminal wrapper, not a VS Code clone, not a cloud-account
SaaS app. It unifies Chat, Projects, Files, Tasks, Git, Activity,
Terminal, IDE, Models, Agents, Devices, Settings, providers,
integrations, Yana memory, governance, permissions, evidence, runtime
state, and updates as a UI surface over the EXISTING `yana-rt` runtime:

```
Desktop UI -> Workspace Context -> yana-rt -> RuntimeAuthority/TurnEngine
           -> Capabilities / Governance / Tasks / Evidence
```

## The 10 non-negotiable architectural rules (every phase)

1. Never fake runtime data just to make the UI look complete.
2. HUMAN PTY != AI EXECUTION AUTHORITY. Human-typed terminal commands:
   renderer -> Electron IPC -> PTY -> the user's own shell. AI-initiated
   commands: Chat/TurnEngine -> RuntimeAuthority -> governed capability ->
   execution -> evidence. Never let AI bypass governance via the PTY path.
3. AI mutation always goes through RuntimeAuthority/capability governance.
4. Existing Yana memory/tasks are the source of truth — never build a
   second, desktop-only memory or task system (Phase 8 already reused
   the real TaskStore; keep doing that pattern for anything else that
   has an existing Rust-side model).
5. Memory/data exports must never contain API keys, OAuth tokens, session
   cookies, SSH keys, Git credentials, or provider secrets.
6. User-owned project files stay user-owned — never silently copy a repo
   into Yana's app-data directory.
7. Desktop uses a bundled runtime and must keep working even if the
   system `yana` CLI integration is missing or broken.
8. Local-first must never lock the user into one model/provider.
9. Terminal output and external CLI/tool output are untrusted data.
10. Never parse assistant prose to manufacture structured tool/task/
    result events — only real structured data may back a structured block.

## What already exists (Phases 1-8) — read these before writing anything

All in `tools/yana-web/desktop-src/new-app/` unless noted:

- **Shell**: `index.jsx` (viewport-responsive layout, sidebar/context/dock
  resizing via `use-resizable.js`), `sidebar.jsx`, `header.jsx`.
- **Chat**: `chat-workspace.jsx` + `chat/` (Composer, Conversation,
  ProgressCard/ResultCard fed by `lib/runtime-progress.mjs` from real
  RuntimeEvents — see `src/chat/headless.rs`'s `write_event()`).
- **Activity**: `activity-panel.jsx`, `activity-history-view.jsx`,
  `activity-source.mjs` (persists to localStorage, capped at 200).
- **Files**: `files-view.jsx` (real tree via `repo_tree`/`read_file`
  capabilities), drag-and-drop + `lib/file-attachments.mjs` (module-level
  singleton store, `React.useSyncExternalStore` pattern — mirror this for
  any similar "shared state across sidebar views" need, do not invent a
  second pattern).
- **Archive**: ZIP inspect/extract UI inside `files-view.jsx`, backed by
  `src/capability/archive.rs` (Zip Slip/symlink/bomb-protected — read its
  doc comment before touching anything ZIP-related).
- **Git**: `changes-view.jsx` inside `context-panel.jsx`'s "changes" tab —
  stage/unstage/commit/diff, backed by `src/capability/git.rs`'s
  `git_stage`/`git_unstage`/`git_commit`/`git_diff_path`.
- **Tasks**: `tasks-view.jsx`, backed by the real `src/task.rs` TaskStore
  via new `--json` flags on the existing `yana-rt task` CLI.
- **Project context / Command Palette**: `project-context.jsx`,
  `command-palette.jsx`.

### The established pattern for wiring a new capability to the UI

Every one of the above follows the SAME chain — reuse it, don't invent a
new one:

```
Rust: crate::capability::<module> — pure function, returns Result<String, CapabilityError>
        via encode("capability.name", struct, truncated)
  -> src/capability/cli.rs — one CapabilityAction variant + cmd_* fn, println!/eprintln!
  -> tools/yana-desktop/<name>.js — thin Node adapter, exec/existsSync as
     injectable params (see git-actions.js/zip-archive.js/task-actions.js
     for the exact shape), its own _test_<name>_unit.js
  -> tools/yana-desktop/main.js — resolveInRepo() path-sandbox check, then
     handleTrusted('yana:<channel>', ...)
  -> tools/yana-desktop/preload.js — contextBridge expose
  -> tools/yana-web/desktop-src/new-app/<view>.jsx — real data only
```

`IS_ELECTRON` (from `../lib/is-electron.js`) gates any view that touches
`window.yana` — it doesn't exist outside the desktop app. Every new
string goes through `L(en, vi, ko, zh)` from `../components.jsx` with a
REAL Vietnamese and Korean translation, not English-only placeholders —
this has been done consistently since Phase 1, keep it that way.

## Your scope: Phases 9-35

```
PHASE 9 — TERMINAL WORKSPACE
  33. System Terminal (exists — terminal-dock.jsx/terminal.jsx)
  34. Governed Yana Execution  35. Terminal Customization
  36. Terminal Context Attachment
  User-installed CLIs (claude, hermes, codex, gemini, git, cargo, python, npm)
  should work naturally if present on the user's machine.

PHASE 10 — ADVANCED TERMINAL / IDE
  37. Multiple Terminals  38. Live CWD (use OSC 7/133 shell integration,
      do NOT parse shell prompts)  39. Terminal Session Restore
  40. IDE surface (code-server integration already exists — tools/yana-desktop/
      main.js's startCodeServer(); IdePanel in terminal.jsx)

PHASE 11 — PROJECTS
  41. Open/Create Project  42. Recent Projects  43. Project Switching
  44. Managed Projects (an imported ZIP project may use a Yana-managed
      workspace only if the user explicitly chooses — rule 6)

PHASE 12 — SETTINGS FOUNDATION
  45. Settings Architecture  46. Settings Persistence  47. Settings Search
  48. Advanced/Developer Boundary
  Categories: General, Appearance, Language & Region, AI Providers,
  Models & Routing, Projects, Terminal, Permissions & Autonomy, Privacy &
  Data, Integrations, Devices, Notifications, Shortcuts, Updates,
  Advanced, Developer, Runtime, Diagnostics. This is new-app's OWN
  settings surface (sidebar's "Settings" item currently falls through to
  ComingSoon) — do not confuse with the legacy app's `pages/system/
  settings.jsx`, which stays as-is until Phase 34 retires it.

PHASE 13 — I18N/LOCALIZATION
  49-52. Already substantially satisfied by the `L(en,vi,ko,zh)` pattern
  used throughout new-app/ since Phase 1. Remaining real gap: date/time/
  number formatting and pluralization aren't formalized (no Intl.*
  wrapper exists yet) — that's the actual remaining work here, not a
  translation-key infrastructure rebuild.

PHASE 14 — AI PROVIDERS
  53. Provider Manager  54. Secure Credentials  55. Connection Test/Health
  56. Model Discovery
  KNOWN REAL GAPS (confirmed by a previous session, not guessed):
  - 9router (127.0.0.1:20128) IS probed server-side (server.js) and IS in
    CHAT_LIVE_MODELS (model-select.js) — the live model-list fetch exists,
    the UI just shows a 1-item static fallback until that fetch resolves.
    Verify whether it actually resolves correctly when 9router is running.
  - `airllm` exists as a string in lib/runtime-client.js's provider-id
    list but has ZERO UI presence (not in provider-config.js or
    model-select.js) — a real gap to close, not a UI bug to hide.
  Credentials: `crypto-store.js` (window.YanaVault, AES-256-GCM
  non-extractable key, rule 66) already exists and is the ONLY approved
  place for provider keys — never plaintext localStorage.

PHASE 15 — MODELS & ROUTING
  57. Model Manager  58. Default Models  59. Routing UI  60. Usage/Cost
  Reuse existing provider/router infra (use-chat-models.js, model-select.js).
  Only show token/cost values when telemetry is real (lastUsage already
  flows through chat-workspace.jsx -> onContextChange).

PHASE 16 — PERMISSIONS & AUTONOMY
  61. Permission Inspector  62. Approval UI  63. Autonomy Controls
  64. Safety Mode
  Map UI to ACTUAL Yana authority/autonomy state (RuntimeAuthority,
  ApprovalRequirement in src/capability/registry.rs) — do not invent
  fake L1-L5 controls if the backend doesn't expose them yet. If it
  doesn't, that's a real gap to name in your report, not to paper over.

PHASE 17 — LOCAL DATA INFRASTRUCTURE
  65. OS Data Directory  66. Persistent vs Cache Separation
  67. Data Schema Versioning  68. Data Migration
  Locations: macOS ~/Library/Application Support/Yana/, Linux
  ~/.local/share/yana/, Windows %APPDATA%\Yana\. Separate persistent
  (memory, chats, tasks, settings, workspace metadata) from re-creatable
  (cache, logs, temp previews, download cache). App version / runtime
  version / data-schema version / memory-schema version are separate
  concepts — do not conflate them.

PHASE 18 — MEMORY PORTABILITY
  69. Existing Yana Memory Integration (reuse it — do not duplicate)
  70. Memory Export ZIP  71. Memory Import/Restore  72. Secret Exclusion
  Portable bundle versioned; NO credentials in the archive (rule 5).

PHASE 19 — BACKUP & RECOVERY UX
  73. Manual Memory Backup  74. Automatic Memory Backup  75. Restore Flow
  76. Delete/Reset Data
  Uninstalling must NOT auto-delete user memory/state. Deleting user data
  is a separate, explicit, clearly-labeled action.

PHASE 20 — INTEGRATIONS FRAMEWORK
  77. Generic Connector Architecture  78. OAuth/Authorization Boundary
  79. Integration Settings UI  80. Connector Context
  ONE generic connector model (connect/disconnect/reconnect/scopes/
  resources/read-write distinction) — not one bespoke subsystem per
  integration (this matters more starting Phase 21/22). OAuth tokens
  never travel through memory backup (Phase 18).

PHASE 21 — INITIAL INTEGRATIONS
  81. Google Drive  82. GitHub  83. Slack  84. Google Ecosystem Connector
  GitHub is distinct from local Git (remote repo, issues, PRs, CI, reviews, releases).

PHASE 22 — CREATIVE/PRODUCTIVITY INTEGRATIONS
  85. Figma  86. Notion  87. Canva  88. Connector Extensibility/MCP

PHASE 23 — DESKTOP + SYSTEM CLI INSTALLATION
  89. Bundled Yana Runtime  90. System `yana` CLI  91. First-run Notice
  92. Version Coordination
  After install: `yana`/`yana chat`/`yana status` work from a system
  terminal when integration succeeds. Desktop itself still relies on its
  OWN bundled runtime regardless.

PHASE 24 — ONBOARDING
  93. First Launch  94. Drop-to-Start  95. Provider Setup Optionality
  96. Restore Existing User
  No mandatory login. Welcome -> Open/Create/Drop Project -> choose
  Local/Cloud AI -> configure provider if needed -> Workspace. Allow
  importing a Yana memory backup (Phase 18) for users moving machines.

PHASE 25 — UPDATES
  97. Update Checker  98. Update Notification  99. Safe Update
  100. Update Preferences
  Never force a restart while terminal processes or tasks are active.
  (Auto-update-check plumbing already exists in main.js — see "Auto-update"
  section — this phase is the UI/preferences layer on top.)

PHASE 26 — RELIABILITY & RECOVERY
  101. Crash Recovery  102. Atomic Persistence  103. Runtime Health
  104. Diagnostics (redact secrets in any diagnostic export)

PHASE 27 — NOTIFICATIONS
  105. In-app Notifications  106. OS Notifications  107. Notification Center
  108. Notification Preferences
  Activity (Phase 3) = runtime/work history. Notifications = things
  needing user attention. Do NOT merge these two systems.

PHASE 28 — DEVICES
  109. Device Registry UI  110. Device Status  111. Device Inspector
  112. Device Actions
  Do not hardcode to one robot — reuse Yana's existing device/runtime
  abstractions if any exist; name the gap if none do.

PHASE 29 — AGENTS
  113. Agent Surface  114. Agent Capabilities  115. Agent Activity
  116. Agent Configuration
  Internal-only agent details belong behind the developer-only surface
  (Phase 32), not a normal-user card.

PHASE 30 — EXTERNAL TOOLS COMPATIBILITY
  117. Native Shell Compatibility  118. External AI CLI Support
  119. External Output Trust Boundary  120. Workspace Verification
  External CLI output is not automatically verified Yana evidence —
  verify through filesystem/Git/runtime state, never trust the tool's own claim.

PHASE 31 — PRIVACY & DATA CONTROL
  121. Data Overview  122. Clear Cache/Logs  123. Memory/Data Controls
  124. Network Transparency
  Local workflows stay usable without unnecessary network dependency.
  Show which providers/connectors can send data externally.

PHASE 32 — DEVELOPER-ONLY SURFACE
  125. Runtime Inspector  126. Canonical Events/Receipts  127. Evidence Inspector
  128. Diagnostics/Debug Controls
  Hidden from normal-user UI unless this developer-only surface is
  explicitly enabled by the user.

PHASE 33 — ACCESSIBILITY & INPUT
  129. Keyboard Navigation  130. Shortcuts  131. Accessibility Semantics
  132. Input Methods/IME
  Good IME support (Vietnamese, Korean, Japanese, Chinese), especially in
  Composer and Terminal.

PHASE 34 — RELEASE POLISH
  133. Performance  134. Startup Performance  135. Packaging & Signing
  136. Legacy UI Migration
  Never block startup on provider/connector/update checks. Retire the
  legacy UI (`desktop-src/app.jsx` and everything it imports) ONLY after
  new-app reaches parity — this is a human decision, not yours to make
  unilaterally even if you believe it's ready.

PHASE 35 — CONNECTED WORKSPACE
  137. Global Connections Toolbar  138. GitHub Workspace Integration
  139. Gmail Integration  140. Unified Notifications
  Gmail integration starts with search/read/attach-as-context only; if
  send/draft is added later, read and write/send permissions stay separate.
```

## Where you must NEVER write

- `tools/yana-web/desktop-src/app.jsx` and anything it imports (the
  legacy page router — `pages/`, `spaces.jsx`, `dashboard.jsx`,
  `sessions.jsx`, `analytics.jsx`, `cron.jsx`, `html-maker.jsx`,
  `codexmate.jsx`, etc.). Old app, retired only in Phase 34, never by you
  unilaterally deleting it.
- Anything under `src/` beyond what a specific phase genuinely requires —
  if you need new Rust, follow the established capability pattern above,
  don't invent a second architecture for it.

## Process

```
1. Self-audit each phase against the ACTUAL current repo state before
   assuming it's unstarted (see "Why this document is careful" above)
2. Work phase by phase, in order — don't jump ahead if a phase depends
   on infrastructure an earlier phase in YOUR OWN range hasn't built yet
3. Implement, then verify with real command output (cargo test / node
   test files / npm run build:desktop) — never claim a test passed
   without having actually run it this pass
4. If something needs external setup you don't have (OAuth app
   credentials, a real code-signing certificate, an actual GitHub/Google/
   Slack API registration) — build the real architecture and UI with an
   honest "needs configuration" state, do not fake the credential or skip
   the phase silently. Name exactly what's needed from the human.
5. Keep going through your phase range — you do not need to stop and wait
   for approval after every single phase (this differs from earlier
   convention in this repo's history; the human has asked for continuous
   progress this pass). DO stop and flag clearly, inline in your ongoing
   work, if you hit: a security-relevant judgment call you're not sure
   about, a phase that's structurally blocked on something outside your
   control, or anything that would require destructive/irreversible
   action (deleting user data, force-push, etc.).
6. Do not commit. Do not push. A human reviews and commits.
```

## Final report (when you stop — either done or blocked)

For the full range, not per-phase: which phases are fully done, which
are partial (and exactly what's missing), which are blocked (and on
what), files changed, new architecture introduced (should be rare —
mostly the established pattern above), security implications of
anything mutating, real data sources for everything you built,
test/build results (actual output), and known issues.
