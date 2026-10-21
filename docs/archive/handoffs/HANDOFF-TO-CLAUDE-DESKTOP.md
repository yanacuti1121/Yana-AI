# Handoff: Codex → Claude — Yana Desktop

**Date:** 2026-09-01 (Asia/Seoul)  
**Codex worktree:** `/private/tmp/yana-chat-session-continuity`  
**Branch:** `codex/chat-session-continuity`  
**Baseline commit:** `19ecd218` (`feat(desktop): Devices host profile + Remote & Tools status surface`)

## Purpose

Continue the new Yana Desktop workspace without creating a second runtime or
crossing the authority boundary. Commit `19ecd218` already contains two Desktop
vertical slices:

1. **Devices / host profile** — native, read-only host status from `yana-rt`.
2. **Remote & Tools** — truthful status for Discord, MCP and external coding
   CLIs that are already installed on the host.

The worktree also has **uncommitted** runtime-package contract hardening. Do
not assume any of the work is pushed, packaged, or visible in an Electron
window already running from another worktree.

## Files to retain

### Already committed in `19ecd218`

- `tools/yana-desktop/governance-status.js`
- `tools/yana-desktop/main.js`
- `tools/yana-desktop/package.json`
- `tools/yana-desktop/preload.js`
- `tools/yana-web/desktop-src/new-app/index.jsx`
- `tools/yana-web/desktop-src/new-app/sidebar.jsx`

### Already committed in `19ecd218` (new files)

- `tools/yana-desktop/runtime-json.js`
- `tools/yana-desktop/host-status.js`
- `tools/yana-desktop/_test_host_status.js`
- `tools/yana-desktop/remote-tools-status.js`
- `tools/yana-desktop/_test_remote_tools_status.js`
- `tools/yana-web/desktop-src/new-app/devices-view.jsx`
- `tools/yana-web/desktop-src/new-app/remote-tools-view.jsx`

### Current uncommitted runtime-package contract

- `.github/workflows/desktop.yml`
- `tools/yana-desktop/README.md`
- `tools/yana-desktop/_test_package_contract.js`
- `tools/yana-desktop/package.json`
- `tools/yana-desktop/runtime-feature-contract.js`
- `tools/yana-desktop/scripts/verify-staged-runtime.js`
- `tools/yana-desktop/_test_runtime_feature_contract.js`
- `HANDOFF-TO-CLAUDE-DESKTOP.md`

## Implemented behavior

### Devices

`Devices` is active rather than a disabled nav item. Its data path is:

```text
DevicesView → window.yana.hostStatus() → trusted Electron IPC
→ yana-rt os host status --json
```

It displays runtime-provided host data and `—` for unavailable values. It does
not fabricate a remote device registry.

### Remote & Tools

New sidebar item: **Remote & Tools**. It is a control/status surface, not an
unrestricted execution path.

- **Discord:** reads only allowlist counts in `.yana-ai/os/discord-config.json`
  and detects runtime support via fixed `yana-rt --help`. It never reads a bot
  token, creates credentials, starts a bot, or exposes host/repository/Git/
  process/tool capabilities to Discord.
- **MCP:** detects the `mcp` command from the same help output and displays the
  existing `stdio` transport. It does not start a blocking MCP process from UI.
  Governed workspace mutations remain denied from MCP.
- **Claude Code / Codex / Cursor / Antigravity:** detects only fixed command
  names already on `PATH`. The UI focuses the existing human PTY; it does not
  execute any external CLI. External output is never canonical Yana evidence.

New sandboxed-renderer API:

```js
window.yana.remoteToolsStatus()
```

It maps only to trusted `yana:remote-tools-status` IPC in `main.js`.

### Runtime package feature contract

The Desktop release workflow currently builds `yana-rt` with
`cli,pty-bridge`, which deliberately excludes the optional Cargo features
`discord` (`remote` command) and `mcp` (`mcp` command). New contract files make
this an executable policy rather than an assumption:

```text
stage binary → yana-rt --help → parse Commands → validate contract → Electron package
```

- `chat`, `os`, and `capability` must be present in the exact staged binary.
- `remote` and `mcp` must match the explicit profile in
  `runtime-feature-contract.js` (both currently excluded).
- `.github/workflows/desktop.yml` invokes `npm run verify:runtime` immediately
  after staging, before the Desktop test/build steps.
- `_test_package_contract.js` also asserts the staged runtime directories are
  copied to `Resources/bin` and `Resources/pty-bridge`.

If a later release should include Discord and/or MCP, update both the Cargo
feature list in `desktop.yml` and the corresponding `included` value in
`runtime-feature-contract.js` in the same change. CI then proves the resulting
binary, rather than trusting the source tree or a UI label.

## Boundaries to preserve

1. Do not merge the human PTY with AI execution. AI actions still go through
   TurnEngine → RuntimeAuthority → capability/governance/evidence.
2. Do not add credentials to the renderer. Google OAuth is owned by the active
   Claude session and must remain separate from this status surface.
3. Do not auto-start Discord or MCP. Both need an explicit user opt-in.
4. Reconcile before touching Claude-owned files: `src/model/catalog.rs`, the
   `/api/chat` and `/api/models` portions of `tools/yana-web/server.js`,
   `tools/yana-web/lib/providers.js`, and
   `tools/yana-web/desktop-src/pages/system/providers.jsx`.
5. Do not package, release, push, or open a PR from this handoff. The user
   assigned packaging to Claude; Codex performed none of those actions.

## Validation evidence

Run from this worktree during the Codex session:

```text
npm --prefix ../yana-web run build:desktop  → exit 0
npm run test:unit                           → exit 0 (outside sandbox)
git diff --check                            → exit 0
```

Relevant full-suite lines:

```text
Desktop staged runtime contract verified: 38 commands; discord=excluded, mcp=excluded
Desktop runtime feature contract tests passed: 14
Desktop package contract tests passed: 25
remote-tools-status unit tests passed: 17
host-status unit tests passed: 8
Conversation tab state tests passed: 18
```

Vite emitted informational warnings for two non-module scripts and the existing
large application chunk; its build still exited 0.

## Runtime/package caveat

The Remote & Tools UI reads `--help` from its own bundled binary at runtime, not
the source tree. The current release profile therefore reports Discord/MCP as
unavailable by design. The new staged-runtime contract closes the earlier gap
where staging/packaging could drift from that release policy without a CI error.

## Safe next steps

1. Start in this worktree and inspect `git status --short`.
2. Preserve commit `19ecd218`; reconcile only actual overlap in `package.json`
   and the files owned by the active Claude session.
3. Re-run the three validation commands after reconciliation, including
   `npm run verify:runtime` after `npm run stage:runtime`.
4. Ask the user before committing/pushing/opening a PR. No commit/push/PR was
   performed by Codex.
5. If committed, include:

```text
Co-Authored-By: Codex <noreply@openai.com>
```
