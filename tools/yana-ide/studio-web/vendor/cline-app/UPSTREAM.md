# Vendored from cline/cline: the desktop app interface (`webview/`)

- Source: https://github.com/cline/cline, directory `apps/examples/desktop-app/webview` (package `@cline/code`)
- Commit: `d3ecc4890e8f9bcb77182b96c77fa90575e8e145` (a local reference copy; Cline's `main` has moved on since)
- License: Apache License 2.0 (see `../cline-ui/LICENSE`)
- Copied on 2026-11-06.

## What this is

Cline's complete desktop application interface: app shell (title bar, sidebar, header, command bar, terminal panel,
theme), chat (welcome, messages, input bar, changes panel, project files, environment selector), sessions, settings,
marketplace and onboarding. 249 TypeScript/TSX files plus styles and assets. Test and story files were left out.

It is copied verbatim for now. Nothing is edited, built or wired yet.

## What is NOT taken, on purpose

Anh decided on 2026-11-06: take Cline's interface, not their system. Yana has its own core, `yana-rt`.

| Not taken | Why |
|---|---|
| `@cline/core`, `@cline/llms`, agents | Cline's agent runtime. Replaced by `yana-rt`. |
| `@cline/shared` (73 files, about 13,000 lines in its browser entry) | Cline's runtime contracts: hub, agents, hooks, telemetry, prompt system. Yana writes a small shim for the few names the interface uses. |
| `sidecar/` | The process that connects this interface to Cline's core. |
| `src-tauri/` | Cline's native shell. Yana runs inside the IDE. |

## The seam: where this interface meets the core

Measured on the copied files:

- `lib/desktop-client.ts` is the single gateway to Cline's core. 66 files go through it. Replacing it with a Yana
  bridge to `yana-rt` is the main piece of work.
- Only 9 files import `@cline/core` (account, cloud and remote-environment types, plus catalogs); none imports `@cline/llms`.
- 35 files import `@cline/shared` (about 40 names: provider-auth types, agenda/task records, media helpers, a few functions).
  These become Yana shim types and functions.
- 7 files use Tauri (`window-title-bar`, `desktop-notifications`, `desktop-tray`, `desktop-window-title`, `terminal-sessions`,
  `desktop-client`, `app/page.tsx`). They need IDE equivalents.
- Only 4 files use Next.js (`app/layout.tsx`, `app/page.tsx`, `components/theme-provider.tsx`, `components/ui/sonner.tsx`),
  plus one API route (`app/api/marketplace/catalog/route.ts`) and `next.config.mjs`. So the interface can be rebuilt with Vite
  as the other Yana screens are, instead of running Next inside a webview.

## Parts that depend on Cline's own services (must stay inert)

Yana promises zero telemetry. These talk to Cline's cloud or telemetry, and must not run in Yana:

- Telemetry: `desktop-error-telemetry`, `pull-request-telemetry*`, and the telemetry paths in `desktop-client.ts`, `settings-view.tsx`, `app/layout.tsx`.
- Network calls: `lib/changelog.ts`, `lib/marketplace.ts`, `app/api/marketplace/catalog/route.ts`, `lib/streaming-transcription.ts`.
- Cline account and cloud: `cline-account-state`, `account-context`, cloud handoff, `account-view`, `cline-logo`.

Plan: keep the files, cut the connections, and hide their entry points until Yana has its own equivalents.

## Rules

1. Add a notice comment to any file you change and list it here. Cline's name and logos are not used in the product.
2. Light theme only; colors come from `../cline-ui/theme/`.
3. No dependency is installed without anh's approval (rule 44). This interface lists 71; most will not be needed once Next, the sidecar
   and the Tauri pieces are gone.
